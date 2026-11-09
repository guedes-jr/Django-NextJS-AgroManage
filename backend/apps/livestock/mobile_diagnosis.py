"""Native diagnosis bound to an explicit pending mating, preserving cattle transitions."""
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers, exceptions
from .models import Animal, Mating, Pregnancy, HistoricoEvento
from .mobile_clinic import authorize
from .mobile_vaccination import Strict
from .mobile_reproduction import Query
from .cattle_improvements import filter_purpose


class Conflict(exceptions.APIException):
    status_code = 409
    default_detail = 'O animal ou a cobertura mudou. Atualize antes de registrar o diagnóstico.'


class Input(Strict):
    expected_farm = serializers.UUIDField()
    expected_mating = serializers.UUIDField()
    animal_version = serializers.DateTimeField()
    mating_version = serializers.DateTimeField()
    diagnosis_date = serializers.DateField()
    result = serializers.ChoiceField(choices=['positive', 'negative'])


def context(user, animal_id, params, lock=False, command=None):
    authorize(user)
    if user.role == 'operator' and not user.allowed_livestock.filter(code='bovinos').exists():
        raise exceptions.PermissionDenied()
    if command and user.role == 'operator' and user.operator_read_only:
        raise exceptions.PermissionDenied()
    query = Query(data=params); query.is_valid(raise_exception=True)
    values = query.validated_data
    qs = filter_purpose(Animal.objects.filter(pk=animal_id, farm__organization_id=user.organization_id,
        species__code='bovinos', status='active'), values['production']).select_related('farm').only(
        'id', 'identifier', 'farm__id', 'farm__name', 'cattle_purpose', 'gender', 'reproductive_status', 'updated_at')
    if values.get('farm'):
        qs = qs.filter(farm_id=values['farm'])
    animal = (qs.select_for_update(of=('self',)) if lock else qs).first()
    if not animal:
        raise exceptions.NotFound()
    if animal.gender != 'F' or animal.reproductive_status != 'coberta':
        raise Conflict()
    matings = Mating.objects.filter(female=animal).order_by('-mating_date', '-created_at', '-id')
    if lock:
        matings = matings.select_for_update()
    mating = matings.first()
    if not mating or mating.status != Mating.Status.PENDING_DG:
        raise Conflict()
    # The legacy action selects by mating date. Ambiguous legacy ties cannot be
    # silently attached to a different event by the native form.
    if matings.filter(mating_date=mating.mating_date).count() != 1 or Pregnancy.objects.filter(female=animal, status='ongoing').exists() or Pregnancy.objects.filter(mating=mating).exists():
        raise Conflict()
    results = ['positive', 'negative'] if mating.expected_birth_date and mating.expected_birth_date >= mating.mating_date else ['negative']
    if command:
        if animal.farm_id != command['expected_farm'] or mating.pk != command['expected_mating'] or animal.updated_at != command['animal_version'] or mating.updated_at != command['mating_version']:
            raise Conflict()
        if not mating.mating_date <= command['diagnosis_date'] <= timezone.localdate():
            raise serializers.ValidationError({'diagnosis_date': 'Use uma data entre a cobertura e hoje.'})
        if command['result'] not in results:
            raise serializers.ValidationError({'result': 'A cobertura não possui previsão válida para confirmar gestação. Revise o registro no web.'})
    return animal, mating, {'today': str(timezone.localdate()), 'timezone': settings.TIME_ZONE,
        'animal': {'id': str(animal.pk), 'identifier': animal.identifier, 'farm': str(animal.farm_id),
            'farm_name': animal.farm.name, 'cattle_purpose': animal.cattle_purpose, 'version': animal.updated_at.isoformat()},
        'mating': {'id': str(mating.pk), 'date': str(mating.mating_date), 'version': mating.updated_at.isoformat(),
            'expected_birth_date': str(mating.expected_birth_date) if mating.expected_birth_date else None},
        'allowed_results': results}


@transaction.atomic
def record(user, animal_id, params, command):
    animal, mating, _ = context(user, animal_id, params, lock=True, command=command)
    result, day = command['result'], command['diagnosis_date']
    metadata = {'resultado': result, 'data_diagnostico': str(day),
                'mating_id': str(mating.pk), 'responsible_id': str(user.pk)}
    if result == 'positive':
        animal.reproductive_status = Animal.ReproductiveStatus.GESTANTE
        animal.save(update_fields=['reproductive_status', 'updated_at'])
        Pregnancy.objects.create(female=animal, mating=mating, start_date=mating.mating_date,
            expected_birth_date=mating.expected_birth_date, status='ongoing')
        description = 'Resultado: POSITIVO — Gestação confirmada.'
        mating.status = Mating.Status.CONFIRMED
    else:
        previous = animal.previous_phase or Animal.ReproductiveStatus.VAZIA
        animal.reproductive_status = previous
        animal.previous_phase = ''
        animal.save(update_fields=['reproductive_status', 'previous_phase', 'updated_at'])
        metadata['previous_phase'] = previous
        description = f'Resultado: NEGATIVO — Retorno para {previous}.'
        mating.status = Mating.Status.FAILED
    HistoricoEvento.objects.create(farm=animal.farm, tipo_evento='Diagnóstico de Gestação',
        descricao=description, data_evento=day, matriz=animal, metadata=metadata)
    mating.save(update_fields=['status', 'updated_at'])
    return {'animal': str(animal.pk), 'mating': str(mating.pk), 'result': result, 'status': animal.reproductive_status}
