"""Reviewed native bovine mating, retaining existing coverage/lactation rules."""
from datetime import timedelta, datetime, timezone as datetime_timezone
from django.conf import settings
from django.core import signing
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import serializers, exceptions
from common.operator_access import remember_operator_record
from .models import Animal, Mating, Pregnancy, HistoricoEvento
from .mobile_clinic import authorize
from .mobile_vaccination import Strict, fingerprint
from .mobile_reproduction import Query
from .cattle_improvements import filter_purpose
from .cattle_services import cattle_profile

SALT = 'livestock.mobile-mating.v1'

class Conflict(exceptions.APIException):
    status_code = 409
    default_detail = 'O animal, o reprodutor ou a revisão mudou. Revise a cobertura novamente.'

class Input(Strict):
    expected_farm = serializers.UUIDField()
    animal_version = serializers.DateTimeField()
    mating_date = serializers.DateField()
    mating_type = serializers.ChoiceField(choices=Mating.MatingType.choices)
    sire = serializers.UUIDField(allow_null=True, default=None)
    expected_sire_farm = serializers.UUIDField(allow_null=True, default=None)
    sire_version = serializers.DateTimeField(allow_null=True, default=None)
    sire_info = serializers.CharField(max_length=100, allow_blank=True, default='')
    expected_diagnosis_date = serializers.DateField(allow_null=True, default=None)
    notes = serializers.CharField(max_length=2000, allow_blank=True, default='')

    def validate(self, attrs):
        natural = attrs['mating_type'] == 'natural'
        if natural and (not attrs['sire'] or not attrs['expected_sire_farm'] or not attrs['sire_version'] or attrs['sire_info']):
            raise serializers.ValidationError({'sire': 'Selecione um macho ativo para monta natural.'})
        if not natural and (not attrs['sire_info'] or attrs['sire'] or attrs['expected_sire_farm'] or attrs['sire_version']):
            raise serializers.ValidationError({'sire_info': 'Informe a identificação do reprodutor/sêmen para IA/IATF.'})
        if attrs['expected_diagnosis_date'] and attrs['expected_diagnosis_date'] < attrs['mating_date']:
            raise serializers.ValidationError({'expected_diagnosis_date': 'O diagnóstico previsto não pode anteceder a cobertura.'})
        return attrs


def writable(user):
    authorize(user)
    if user.role == 'operator' and (user.operator_read_only or not user.allowed_livestock.filter(code='bovinos').exists()):
        raise exceptions.PermissionDenied()


def target(user, animal_id, params, lock=False):
    writable(user)
    values = Query(data=params); values.is_valid(raise_exception=True)
    scope = values.validated_data
    qs = filter_purpose(Animal.objects.filter(pk=animal_id, farm__organization_id=user.organization_id,
        species__code='bovinos', status='active'), scope['production']).select_related('farm').only(
        'id', 'identifier', 'farm__id', 'farm__name', 'gender', 'cattle_purpose', 'reproductive_status', 'previous_phase',
        'birth_date', 'entry_date', 'updated_at')
    if scope.get('farm'):
        qs = qs.filter(farm_id=scope['farm'])
    animal = (qs.select_for_update(of=('self',)) if lock else qs).first()
    if not animal:
        raise exceptions.NotFound()
    if animal.gender != 'F' or animal.reproductive_status in ['coberta', 'gestante'] or animal.matings_as_female.filter(status='pending_dg').exists() or Pregnancy.objects.filter(female=animal, status='ongoing').exists():
        raise Conflict()
    return animal


def animal_data(animal):
    return {'id': str(animal.pk), 'identifier': animal.identifier, 'farm': str(animal.farm_id),
            'farm_name': animal.farm.name, 'version': animal.updated_at.astimezone(datetime_timezone.utc).isoformat(), 'cattle_purpose': animal.cattle_purpose}


def options(user, animal_id, params):
    animal = target(user, animal_id, params)
    return {'animal': animal_data(animal), 'today': str(timezone.localdate()), 'timezone': settings.TIME_ZONE,
            'earliest_date': str(max(day for day in [animal.birth_date, animal.entry_date] if day)) if animal.birth_date or animal.entry_date else None,
            'types': [value for value, _ in Mating.MatingType.choices]}


def sires(user, search=''):
    writable(user)
    return Animal.objects.filter(farm__organization_id=user.organization_id, species__code='bovinos', gender='M', status='active').filter(
        Q(identifier__icontains=search) | Q(farm__name__icontains=search)
    ).select_related('farm').only('id', 'identifier', 'farm__id', 'farm__name', 'updated_at', 'cattle_purpose').order_by('identifier', 'id')


def evaluate(user, animal_id, params, command, lock=False):
    animal = target(user, animal_id, params, lock)
    if animal.farm_id != command['expected_farm'] or animal.updated_at != command['animal_version']:
        raise Conflict()
    day = command['mating_date']
    if day > timezone.localdate() or (animal.birth_date and day < animal.birth_date) or (animal.entry_date and day < animal.entry_date):
        raise serializers.ValidationError({'mating_date': 'Respeite nascimento/entrada e não use data futura.'})
    if animal.matings_as_female.filter(mating_date__gte=day).exists():
        raise serializers.ValidationError({'mating_date': 'A cobertura deve ser posterior às coberturas já registradas.'})
    sire = None
    if command['sire']:
        qs = Animal.objects.filter(pk=command['sire'], farm__organization_id=user.organization_id,
            species__code='bovinos', gender='M', status='active').select_related('farm').only(
            'id', 'identifier', 'farm__id', 'farm__name', 'birth_date', 'entry_date', 'updated_at', 'cattle_purpose')
        sire = (qs.select_for_update(of=('self',)) if lock else qs).first()
        if not sire or sire.farm_id != command['expected_sire_farm'] or sire.updated_at != command['sire_version']:
            raise Conflict()
        if (sire.birth_date and day < sire.birth_date) or (sire.entry_date and day < sire.entry_date):
            raise serializers.ValidationError({'sire': 'Respeite as datas do reprodutor na cobertura.'})
    from .models import CattleAnimalProfile
    profile = CattleAnimalProfile.objects.filter(animal=animal).only('is_lactating', 'updated_at').first()
    public = {'animal': animal_data(animal), 'sire': animal_data(sire) if sire else None,
              'expected_birth_date': str(day + timedelta(days=283)),
              'mating_date': str(day), 'mating_type': command['mating_type']}
    internal = {'public': public, 'previous_status': animal.reproductive_status,
                'profile': [profile.is_lactating, profile.updated_at.isoformat()] if profile else None, 'today': str(timezone.localdate())}
    return public, internal, animal, sire


def canonical(command):
    return {key: (value.astimezone(datetime_timezone.utc).isoformat() if isinstance(value, datetime) else value.isoformat() if hasattr(value, 'isoformat') else str(value)) if value is not None else None for key, value in command.items()}


def preview(user, animal_id, params, command):
    public, internal, *_ = evaluate(user, animal_id, params, command)
    scope = Query(data=params); scope.is_valid(raise_exception=True)
    return {**public, 'command': canonical(command), 'preview_token': signing.dumps({'user': str(user.pk),
        'org': str(user.organization_id), 'animal': str(animal_id), 'production': scope.validated_data['production'],
        'command': canonical(command), 'digest': fingerprint(internal)}, salt=SALT, compress=True)}


@transaction.atomic
def confirm(user, animal_id, params, token):
    writable(user)
    try:
        intent = signing.loads(token, salt=SALT, max_age=900)
    except signing.BadSignature as error:
        raise Conflict() from error
    scope = Query(data=params); scope.is_valid(raise_exception=True)
    if intent['user'] != str(user.pk) or intent['org'] != str(user.organization_id):
        raise exceptions.PermissionDenied()
    if intent['animal'] != str(animal_id) or intent['production'] != scope.validated_data['production']:
        raise Conflict()
    values = Input(data=intent['command']); values.is_valid(raise_exception=True)
    command = values.validated_data
    try:
        public, internal, animal, sire = evaluate(user, animal_id, params, command, lock=True)
    except (serializers.ValidationError, exceptions.NotFound) as error:
        raise Conflict() from error
    if fingerprint(internal) != intent['digest']:
        raise Conflict()
    # As in the existing bovine coverage flow, freeze lactation before changing status.
    cattle_profile(animal)
    record = Mating.objects.create(female=animal, sire=sire, sire_info=command['sire_info'], mating_date=command['mating_date'],
        mating_type=command['mating_type'], expected_birth_date=public['expected_birth_date'],
        expected_diagnosis_date=command['expected_diagnosis_date'], notes=command['notes'], status='pending_dg')
    remember_operator_record(user, record)
    animal.previous_phase = animal.reproductive_status
    animal.reproductive_status = 'coberta'
    animal.save(update_fields=['previous_phase', 'reproductive_status', 'updated_at'])
    HistoricoEvento.objects.create(farm=animal.farm, matriz=animal, tipo_evento='Cobertura', data_evento=command['mating_date'],
        descricao=f'Tipo: {record.get_mating_type_display()} | Reprodutor: {command["sire_info"] or sire.identifier}',
        metadata={'mating_id': str(record.pk), 'mating_type': record.mating_type, 'sire_id': str(sire.pk) if sire else None,
                  'sire_info': command['sire_info'], 'expected_birth_date': public['expected_birth_date'], 'responsible_id': str(user.pk)})
    return {'id': str(record.pk), 'animal': str(animal.pk), 'status': 'coberta', 'expected_birth_date': public['expected_birth_date']}
