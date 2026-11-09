"""Reviewed, pregnancy-bound native birth through the established cattle service."""
from datetime import timezone as datetime_timezone
from decimal import Decimal
from django.conf import settings
from django.core import signing
from django.db import transaction, IntegrityError
from django.utils import timezone
from rest_framework import serializers, exceptions
from common.operator_access import remember_operator_record
from .models import Animal, Pregnancy, Birth, HistoricoEvento, Mating
from .mobile_clinic import authorize
from .mobile_vaccination import Strict, fingerprint
from .mobile_mating import animal_data, canonical
from .mobile_reproduction import Query
from .cattle_improvements import filter_purpose
from .cattle_services import record_cattle_birth

SALT = 'livestock.mobile-birth.v1'

class Conflict(exceptions.APIException):
    status_code = 409
    default_detail = 'A matriz, a gestação, a identificação da cria ou a revisão mudou. Confira o histórico e revise novamente.'

class Input(Strict):
    expected_farm = serializers.UUIDField()
    animal_version = serializers.DateTimeField()
    expected_pregnancy = serializers.UUIDField()
    pregnancy_version = serializers.DateTimeField()
    date = serializers.DateField()
    outcome = serializers.ChoiceField(choices=['alive', 'stillborn'])
    calf_identifier = serializers.CharField(max_length=50, allow_blank=True, default='')
    calf_gender = serializers.ChoiceField(choices=['M', 'F'], allow_null=True, default=None)
    calf_purpose = serializers.ChoiceField(choices=['beef', 'dairy', 'dual'], allow_null=True, default=None)
    weight_kg = serializers.DecimalField(max_digits=8, decimal_places=2, min_value=Decimal('.01'), allow_null=True, default=None)
    notes = serializers.CharField(max_length=2000, allow_blank=True, default='')

    def validate(self, attrs):
        if attrs['outcome'] == 'alive' and (not attrs['calf_identifier'] or not attrs['calf_gender'] or not attrs['calf_purpose']):
            raise serializers.ValidationError({'calf_identifier': 'Informe identificação, sexo e finalidade da cria viva.'})
        if attrs['outcome'] == 'stillborn' and (attrs['calf_identifier'] or attrs['calf_gender'] or attrs['calf_purpose']):
            raise serializers.ValidationError({'outcome': 'Natimorto não cria animal vivo. Remova identificação, sexo e finalidade da cria.'})
        return attrs


def writable(user):
    authorize(user)
    if user.role == 'operator' and (user.operator_read_only or not user.allowed_livestock.filter(code='bovinos').exists()):
        raise exceptions.PermissionDenied()


def context(user, animal_id, params, lock=False):
    writable(user)
    values = Query(data=params); values.is_valid(raise_exception=True)
    scope = values.validated_data
    qs = filter_purpose(Animal.objects.filter(pk=animal_id, farm__organization_id=user.organization_id,
        species__code='bovinos', status='active'), scope['production']).select_related('farm').only(
        'id','identifier','farm__id','farm__name','gender','reproductive_status','updated_at','cattle_purpose','birth_date','entry_date','birth_count')
    if scope.get('farm'):
        qs = qs.filter(farm_id=scope['farm'])
    animal = (qs.select_for_update(of=('self',)) if lock else qs).first()
    if not animal:
        raise exceptions.NotFound()
    if animal.gender != 'F' or animal.reproductive_status != 'gestante':
        raise Conflict()
    pregnancies = Pregnancy.objects.filter(female=animal, status='ongoing').order_by('-start_date','-id')
    if pregnancies.count() != 1:
        raise Conflict()
    pregnancy = (pregnancies.select_for_update() if lock else pregnancies).first()
    if not pregnancy or Birth.objects.filter(pregnancy=pregnancy).exists():
        raise Conflict()
    matings = Mating.objects.filter(pk=pregnancy.mating_id, female=animal).only('id','female_id','sire_id','sire_info','updated_at')
    mating = (matings.select_for_update() if lock else matings).first()
    if not mating or mating.sire_id and not Animal.objects.filter(pk=mating.sire_id, farm__organization_id=user.organization_id, species__code='bovinos').exists():
        raise Conflict()
    return animal, pregnancy, mating, scope


def pregnancy_data(pregnancy):
    return {'id': str(pregnancy.pk), 'start_date': str(pregnancy.start_date), 'expected_birth_date': str(pregnancy.expected_birth_date),
            'version': pregnancy.updated_at.astimezone(datetime_timezone.utc).isoformat()}


def options(user, animal_id, params):
    animal, pregnancy, _, _ = context(user, animal_id, params)
    return {'animal': animal_data(animal), 'pregnancy': pregnancy_data(pregnancy),
            'today': str(timezone.localdate()), 'timezone': settings.TIME_ZONE,
            'earliest_date': str(max(day for day in [pregnancy.start_date, animal.birth_date, animal.entry_date] if day))}


def evaluate(user, animal_id, params, command, lock=False):
    animal, pregnancy, mating, scope = context(user, animal_id, params, lock)
    if animal.farm_id != command['expected_farm'] or animal.updated_at != command['animal_version'] or pregnancy.pk != command['expected_pregnancy'] or pregnancy.updated_at != command['pregnancy_version']:
        raise Conflict()
    earliest = max(day for day in [pregnancy.start_date, animal.birth_date, animal.entry_date] if day)
    if not earliest <= command['date'] <= timezone.localdate():
        raise serializers.ValidationError({'date': 'Respeite início da gestação/nascimento/entrada e não use data futura.'})
    if command['outcome'] == 'alive' and Animal.objects.filter(farm=animal.farm, identifier=command['calf_identifier']).exists():
        raise serializers.ValidationError({'calf_identifier': 'Identificação já cadastrada nesta fazenda.'})
    public = {'animal': animal_data(animal), 'pregnancy': pregnancy_data(pregnancy)}
    internal = {'public': public, 'birth_count': animal.birth_count, 'mating_version': mating.updated_at.isoformat(),
                'sire': str(mating.sire_id), 'sire_info': mating.sire_info, 'today': str(timezone.localdate())}
    return public, internal, animal, pregnancy, scope


def preview(user, animal_id, params, command):
    public, internal, _, _, scope = evaluate(user, animal_id, params, command)
    return {**public, 'command': canonical(command), 'preview_token': signing.dumps({'user': str(user.pk), 'org': str(user.organization_id),
        'animal': str(animal_id), 'production': scope['production'], 'command': canonical(command), 'digest': fingerprint(internal)}, salt=SALT, compress=True)}


@transaction.atomic
def confirm(user, animal_id, params, token):
    writable(user)
    try:
        intent = signing.loads(token, salt=SALT, max_age=900)
    except signing.BadSignature as error:
        raise Conflict() from error
    if intent['user'] != str(user.pk) or intent['org'] != str(user.organization_id):
        raise exceptions.PermissionDenied()
    query = Query(data=params); query.is_valid(raise_exception=True)
    if intent['animal'] != str(animal_id) or intent['production'] != query.validated_data['production']:
        raise Conflict()
    values = Input(data=intent['command']); values.is_valid(raise_exception=True)
    command = values.validated_data
    try:
        _, internal, animal, pregnancy, _ = evaluate(user, animal_id, params, command, lock=True)
    except (serializers.ValidationError, exceptions.NotFound) as error:
        raise Conflict() from error
    if fingerprint(internal) != intent['digest']:
        raise Conflict()
    data = {key: command[key] for key in ['date','outcome','calf_identifier','calf_gender','notes']}
    if command['weight_kg'] is not None:
        data['weight_kg'] = command['weight_kg']
    try:
        birth, calf = record_cattle_birth(animal, data, pregnancy_id=pregnancy.pk)
    except IntegrityError as error:
        if command['outcome'] == 'alive' and Animal.objects.filter(farm_id=animal.farm_id, identifier=command['calf_identifier']).exists():
            raise Conflict() from error
        raise
    if calf:
        calf.cattle_purpose = command['calf_purpose']
        calf.save(update_fields=['cattle_purpose','updated_at'])
        remember_operator_record(user, calf)
    remember_operator_record(user, birth)
    now = timezone.now()
    Animal.objects.filter(pk=animal.pk).update(updated_at=now)
    Pregnancy.objects.filter(pk=pregnancy.pk).update(updated_at=now)
    event = HistoricoEvento.objects.get(matriz=animal, tipo_evento='Parto bovino', metadata__birth_id=str(birth.pk))
    event.metadata.update(responsible_id=str(user.pk), pregnancy_id=str(pregnancy.pk), calf_id=str(calf.pk) if calf else None)
    event.save(update_fields=['metadata','updated_at'])
    return {'birth_id': str(birth.pk), 'calf_id': str(calf.pk) if calf else None, 'calf_purpose': command['calf_purpose'] if calf else None}
