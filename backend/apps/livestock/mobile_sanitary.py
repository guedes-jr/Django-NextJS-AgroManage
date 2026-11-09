"""Documentary sanitary drafts: no clinical/stock effects before confirmation."""
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers
from .models import Animal, CattleManagement, CattleManagementEntry
from .cattle_improvements import filter_purpose
from .mobile_castration import Entry
from .mobile_weighing import scope, options, animals, animal_data, Conflict, CancelInput
from .mobile_vaccination import Strict


class Input(Strict):
    farm = serializers.UUIDField()
    production = serializers.ChoiceField(choices=['beef', 'dairy'])
    date = serializers.DateField()
    description = serializers.CharField(max_length=200)
    responsible = serializers.CharField(max_length=100, allow_blank=True)
    notes = serializers.CharField(max_length=2000, allow_blank=True)
    treatment_type = serializers.ChoiceField(choices=['exam', 'surgery', 'other'])
    next_procedure_date = serializers.DateField(allow_null=True)
    milk_withdrawal_until = serializers.DateField(allow_null=True)
    meat_withdrawal_until = serializers.DateField(allow_null=True)
    entries = Entry(many=True, allow_empty=False, max_length=1000)

    def validate_entries(self, entries):
        if len({entry['animal'] for entry in entries}) != len(entries):
            raise serializers.ValidationError('Um animal não pode ser repetido no manejo.')
        return entries

    def validate(self, values):
        if values['date'] > timezone.localdate():
            raise serializers.ValidationError({'date': 'Não use data futura.'})
        for field in ['next_procedure_date', 'milk_withdrawal_until', 'meat_withdrawal_until']:
            if values[field] and values[field] < values['date']:
                raise serializers.ValidationError({field: 'Use uma data igual ou posterior ao manejo sanitário.'})
        return values


@transaction.atomic
def create(user, values):
    farm, query = scope(user, values)
    ids = [entry['animal'] for entry in values['entries']]
    eligible = filter_purpose(Animal.objects.filter(farm=farm, species__code='bovinos', status='active'), query['production'])
    # Lock participants consistently with the confirmation/animal update paths.
    locked = list(eligible.filter(pk__in=ids).order_by('pk').select_for_update(of=('self',)).only('id'))
    if len(locked) != len(ids): raise Conflict()
    selected = list(eligible.filter(pk__in=ids).only('id', 'entry_date', 'updated_at'))
    if len(selected) != len(ids): raise Conflict()
    indexed = {row.pk: row for row in selected}
    for entry in values['entries']:
        animal = indexed[entry['animal']]
        if animal.updated_at != entry['animal_version']: raise Conflict()
        if animal.entry_date and values['date'] < animal.entry_date:
            raise serializers.ValidationError({'date': 'A data do manejo não pode anteceder a entrada dos participantes.'})
    fields = ['date', 'description', 'responsible', 'notes', 'treatment_type', 'next_procedure_date', 'milk_withdrawal_until', 'meat_withdrawal_until']
    record = CattleManagement.objects.create(farm=farm, kind='sanitary', created_by=user, **{key: values[key] for key in fields})
    CattleManagementEntry.objects.bulk_create([CattleManagementEntry(management=record, animal_id=id) for id in ids])
    return {'id': str(record.pk), 'farm': str(farm.pk), 'kind': record.kind, 'status': record.status, 'date': str(record.date), 'participant_count': len(ids)}


class EditInput(Input):
    expected_version = serializers.DateTimeField()


DOCUMENT_FIELDS = ['date', 'description', 'responsible', 'notes', 'treatment_type', 'next_procedure_date', 'milk_withdrawal_until', 'meat_withdrawal_until']


def draft(user, pk, params, lock=False):
    from .mobile_weighing import draft as base_draft
    from django.shortcuts import get_object_or_404
    record, farm, query = base_draft(user, pk, params, lock=lock, kind='sanitary')
    record = get_object_or_404(CattleManagement.objects.only('id', 'farm_id', 'updated_at', 'status', *DOCUMENT_FIELDS),
        pk=record.pk, cost_per_animal=0, treatment_type__in=['exam', 'surgery', 'other'])
    return record, farm, query


def edit_options(user, pk, params):
    record, farm, query = draft(user, pk, params)
    rows = list(record.entries.select_related('animal').only('id', 'management_id', 'weight_kg', 'animal__id', 'animal__identifier',
        'animal__farm_id', 'animal__cattle_purpose', 'animal__entry_date', 'animal__updated_at', 'animal__status').order_by('animal__identifier', 'id')[:1001])
    if not 1 <= len(rows) <= 1000 or any(row.weight_kg is not None for row in rows): raise Conflict()
    values = {key: getattr(record, key) for key in DOCUMENT_FIELDS}
    for key in ['date', 'next_procedure_date', 'milk_withdrawal_until', 'meat_withdrawal_until']:
        values[key] = str(values[key]) if values[key] else ''
    return {**options(user, params), 'id': str(record.pk), 'version': record.updated_at.isoformat(), 'values': values,
            'entries': [animal_data(row.animal) for row in rows]}


@transaction.atomic
def update(user, pk, values):
    record, farm, query = draft(user, pk, values, lock=True)
    if record.updated_at != values['expected_version']: raise Conflict()
    ids = [entry['animal'] for entry in values['entries']]
    eligible = Animal.objects.filter(farm=farm, species__code='bovinos', status='active', pk__in=ids)
    if len(list(eligible.order_by('pk').select_for_update(of=('self',)).only('id'))) != len(ids): raise Conflict()
    selected = list(eligible.only('id', 'updated_at', 'entry_date', 'cattle_purpose'))
    if len(selected) != len(ids) or not any(row.cattle_purpose in [query['production'], 'dual'] for row in selected): raise Conflict()
    indexed = {row.pk: row for row in selected}
    for entry in values['entries']:
        animal = indexed[entry['animal']]
        if animal.updated_at != entry['animal_version']: raise Conflict()
        if animal.entry_date and values['date'] < animal.entry_date:
            raise serializers.ValidationError({'date': 'A data do manejo não pode anteceder a entrada dos participantes.'})
    for key in DOCUMENT_FIELDS: setattr(record, key, values[key])
    record.save(update_fields=[*DOCUMENT_FIELDS, 'updated_at'])
    record.entries.all().delete()
    CattleManagementEntry.objects.bulk_create([CattleManagementEntry(management=record, animal_id=id) for id in ids])
    return {'id': str(record.pk), 'farm': str(farm.pk), 'kind': 'sanitary', 'status': 'draft', 'date': str(record.date), 'participant_count': len(ids)}


@transaction.atomic
def cancel(user, pk, values):
    record, farm, _ = draft(user, pk, values, lock=True)
    if record.updated_at != values['expected_version']: raise Conflict()
    record.status = 'cancelled'; record.cancellation_reason = values['reason']
    record.save(update_fields=['status', 'cancellation_reason', 'updated_at'])
    return {'id': str(record.pk), 'farm': str(farm.pk), 'status': record.status, 'cancellation_reason': record.cancellation_reason}
