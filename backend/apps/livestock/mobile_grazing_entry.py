"""Reviewed manager-only entry of an existing batch into a shared pasture."""
from datetime import timezone as utc
from django.conf import settings
from django.core import signing
from django.db import transaction
from django.db.models import Exists, OuterRef, Subquery, Q, Count, Max
from django.utils import timezone
from rest_framework import serializers, exceptions
from .models import CattlePasture, CattleGrazing, AnimalBatch
from .mobile_vaccination import Strict, fingerprint
from .mobile_mating import canonical
from .mobile_clinic import authorize
from .cattle_services import enter_cattle_pasture

SALT = 'livestock.mobile-grazing-entry.v1'


class Conflict(exceptions.APIException):
    status_code = 409
    default_detail = 'O pasto, o lote ou a revisão mudou. Confira as ocupações e revise novamente.'


class Scope(serializers.Serializer):
    farm = serializers.UUIDField()
    pasture = serializers.UUIDField()
    search = serializers.CharField(max_length=100, allow_blank=True, default='')


class Input(Strict):
    farm = serializers.UUIDField()
    pasture = serializers.UUIDField()
    pasture_version = serializers.DateTimeField()
    batch = serializers.UUIDField()
    batch_version = serializers.DateTimeField()
    entry_date = serializers.DateField()
    notes = serializers.CharField(max_length=2000, allow_blank=True, default='')


def writable(user):
    authorize(user)
    if user.role not in ('admin', 'manager'):
        raise exceptions.PermissionDenied()


def pasture_data(pasture):
    return {'id': str(pasture.pk), 'name': pasture.name, 'farm': str(pasture.farm_id),
        'farm_name': pasture.farm.name, 'version': pasture.updated_at.astimezone(utc.utc).isoformat(),
        'availability': pasture.availability}


def pasture(user, params, lock=False):
    writable(user)
    values = Scope(data=params); values.is_valid(raise_exception=True)
    scope = values.validated_data
    qs = CattlePasture.objects.filter(pk=scope['pasture'], farm_id=scope['farm'],
        farm__organization_id=user.organization_id).select_related('farm').only(
        'id','name','farm__id','farm__name','updated_at','availability')
    row = (qs.select_for_update(of=('self',)) if lock else qs).first()
    if not row:
        raise exceptions.NotFound()
    if row.availability in ('resting', 'blocked'):
        raise Conflict()
    return row, scope


def options(user, params):
    row, _ = pasture(user, params)
    return {'pasture': pasture_data(row), 'today': str(timezone.localdate()), 'timezone': settings.TIME_ZONE}


def batches(user, params):
    row, scope = pasture(user, params)
    qs = AnimalBatch.objects.filter(farm_id=row.farm_id, species__code='bovinos', status='active', quantity__gt=0)
    qs = qs.annotate(has_open=Exists(CattleGrazing.objects.filter(batch_id=OuterRef('pk'), exit_date__isnull=True)),
        last_exit_date=Subquery(CattleGrazing.objects.filter(batch_id=OuterRef('pk'), exit_date__isnull=False).order_by('-exit_date').values('exit_date')[:1])).filter(has_open=False)
    if scope['search']:
        qs = qs.filter(Q(batch_code__icontains=scope['search']) | Q(name__icontains=scope['search']))
    return qs.only('id','batch_code','farm_id','cattle_purpose','quantity','entry_date','updated_at').order_by('batch_code','id')


def batch_data(row):
    return {'id': str(row.pk), 'batch_code': row.batch_code, 'farm': str(row.farm_id),
        'cattle_purpose': row.cattle_purpose, 'quantity': row.quantity, 'entry_date': str(row.entry_date),
        'version': row.updated_at.astimezone(utc.utc).isoformat(),
        'last_exit_date': str(row.last_exit_date) if row.last_exit_date else None}


def evaluate(user, command, lock=False):
    writable(user)
    # Same lock order as enter_cattle_pasture: batch, then pasture.
    qs = AnimalBatch.objects.filter(pk=command['batch'], farm_id=command['farm'],
        farm__organization_id=user.organization_id, species__code='bovinos', status='active', quantity__gt=0).only(
        'id','batch_code','farm_id','cattle_purpose','quantity','entry_date','updated_at')
    batch = (qs.select_for_update(of=('self',)) if lock else qs).first()
    if not batch:
        raise Conflict()
    target, _ = pasture(user, command, lock)
    if target.updated_at != command['pasture_version'] or batch.updated_at != command['batch_version']:
        raise Conflict()
    history = CattleGrazing.objects.filter(batch=batch)
    if history.filter(exit_date__isnull=True).exists():
        raise Conflict()
    latest = history.order_by('-exit_date','-id').first()
    earliest = max(day for day in [batch.entry_date, latest.exit_date if latest else None] if day)
    if not earliest <= command['entry_date'] <= timezone.localdate():
        raise serializers.ValidationError({'entry_date': 'Respeite entrada do lote, última saída e o dia atual.'})
    batch.last_exit_date = latest.exit_date if latest else None
    public = {'pasture': pasture_data(target), 'batch': batch_data(batch), 'earliest_date': str(earliest)}
    digest = fingerprint({'public': public, 'today': str(timezone.localdate()),
        'history': canonical(history.aggregate(count=Count('id'), updated=Max('updated_at'), created=Max('created_at'))) })
    return public, digest, batch, target


def preview(user, command):
    public, digest, _, _ = evaluate(user, command)
    return {**public, 'command': canonical(command), 'preview_token': signing.dumps({
        'user': str(user.pk), 'org': str(user.organization_id), 'command': canonical(command),
        'digest': digest}, salt=SALT, compress=True)}


@transaction.atomic
def confirm(user, token):
    writable(user)
    try:
        intent = signing.loads(token, salt=SALT, max_age=900)
    except signing.BadSignature as error:
        raise Conflict() from error
    if intent['user'] != str(user.pk) or intent['org'] != str(user.organization_id):
        raise exceptions.PermissionDenied()
    values = Input(data=intent['command']); values.is_valid(raise_exception=True)
    command = values.validated_data
    try:
        _, digest, batch, target = evaluate(user, command, lock=True)
    except (serializers.ValidationError, exceptions.NotFound) as error:
        raise Conflict() from error
    if digest != intent['digest']:
        raise Conflict()
    row = enter_cattle_pasture({'pasture':target, 'batch':batch, 'entry_date':command['entry_date'], 'notes':command['notes']})
    return {'id': str(row.pk), 'farm': str(target.farm_id), 'pasture': str(target.pk),
        'batch': str(batch.pk), 'entry_date': str(row.entry_date)}
