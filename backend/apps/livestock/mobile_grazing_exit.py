"""Reviewed closing of an existing pasture occupation; no implicit transfer."""
from datetime import timezone as utc
from django.conf import settings
from django.core import signing
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, exceptions
from . import mobile_grazing
from .mobile_grazing_entry import writable
from .mobile_vaccination import Strict, fingerprint
from .mobile_mating import canonical
from .cattle_services import close_cattle_pasture

SALT = 'livestock.mobile-grazing-exit.v1'


class Conflict(exceptions.APIException):
    status_code = 409
    default_detail = 'A ocupação ou a revisão mudou. Confira as ocupações e revise novamente.'


class Input(Strict):
    farm = serializers.UUIDField()
    pasture = serializers.UUIDField()
    grazing_version = serializers.DateTimeField()
    exit_date = serializers.DateField()


def context(user, grazing_id, params, lock=False):
    writable(user)
    qs = mobile_grazing.rows(user, params)
    row = get_object_or_404(qs.select_for_update(of=('self',)) if lock else qs, pk=grazing_id)
    if row.exit_date:
        raise Conflict()
    return row


def row_data(row):
    return {**mobile_grazing.data(row), 'version': row.updated_at.astimezone(utc.utc).isoformat()}


def options(user, grazing_id, params):
    row = context(user, grazing_id, params)
    return {'occupation': row_data(row), 'today': str(timezone.localdate()), 'timezone': settings.TIME_ZONE}


def evaluate(user, grazing_id, command, lock=False):
    row = context(user, grazing_id, command, lock)
    if row.updated_at != command['grazing_version']:
        raise Conflict()
    if not row.entry_date <= command['exit_date'] <= timezone.localdate():
        raise serializers.ValidationError({'exit_date': 'Respeite a entrada da ocupação e o dia atual.'})
    public = {'occupation': row_data(row)}
    digest = fingerprint({**public, 'today': str(timezone.localdate()),
        'batch_version': row.batch.updated_at.isoformat(), 'pasture_version': row.pasture.updated_at.isoformat()})
    return public, digest, row


def preview(user, grazing_id, command):
    public, digest, _ = evaluate(user, grazing_id, command)
    return {**public, 'command': canonical(command), 'preview_token': signing.dumps({
        'user': str(user.pk), 'org': str(user.organization_id), 'grazing': str(grazing_id),
        'command': canonical(command), 'digest': digest}, salt=SALT, compress=True)}


@transaction.atomic
def confirm(user, grazing_id, token):
    writable(user)
    try:
        intent = signing.loads(token, salt=SALT, max_age=900)
    except signing.BadSignature as error:
        raise Conflict() from error
    if intent['user'] != str(user.pk) or intent['org'] != str(user.organization_id):
        raise exceptions.PermissionDenied()
    if intent['grazing'] != str(grazing_id):
        raise Conflict()
    values = Input(data=intent['command']); values.is_valid(raise_exception=True)
    command = values.validated_data
    try:
        _, digest, row = evaluate(user, grazing_id, command, lock=True)
    except (serializers.ValidationError, exceptions.NotFound) as error:
        raise Conflict() from error
    if digest != intent['digest']:
        raise Conflict()
    close_cattle_pasture(row, command['exit_date'])
    return {'id': str(row.pk), 'farm': str(row.pasture.farm_id), 'pasture': str(row.pasture_id),
        'batch': str(row.batch_id), 'exit_date': str(command['exit_date'])}
