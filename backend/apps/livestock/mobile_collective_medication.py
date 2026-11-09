"""Collective medication drafts validate stock but neither reserve nor consume it."""
from decimal import Decimal
from django.db import transaction
from django.db.models import F
from rest_framework import serializers
from . import mobile_medication, mobile_sanitary
from .models import Animal, CattleManagement, CattleManagementEntry, CattleMilkRecord
from .mobile_weighing import scope, Conflict
from .mobile_health import validate_date
from .cattle_improvements import filter_purpose


class Input(mobile_sanitary.Input):
    treatment_type = serializers.ChoiceField(choices=['medication'])
    inventory_lot = serializers.UUIDField()
    expected_unit = serializers.CharField(max_length=20)
    quantity = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal('.01'))


@transaction.atomic
def create(user, values):
    farm, query = scope(user, values)
    ids = [entry['animal'] for entry in values['entries']]
    eligible = filter_purpose(Animal.objects.filter(pk__in=ids, farm=farm, species__code='bovinos', status='active'), query['production'])
    if len(list(eligible.order_by('pk').select_for_update(of=('self',)).only('id'))) != len(ids): raise Conflict()
    animals = list(eligible.only('id', 'farm_id', 'entry_date', 'birth_date', 'updated_at').order_by('pk'))
    if len(animals) != len(ids): raise Conflict()
    versions = {entry['animal']: entry['animal_version'] for entry in values['entries']}
    for animal in animals:
        if animal.updated_at != versions[animal.pk]: raise Conflict()
        validate_date(animal, values['date'])
    _, _, lot, total = stock_review(user, values, animals, lock=True)
    record = CattleManagement.objects.create(farm=farm, kind='sanitary', created_by=user,
        inventory_lot=lot, inventory_quantity_per_animal=values['quantity'], **{key: values[key] for key in mobile_sanitary.DOCUMENT_FIELDS})
    CattleManagementEntry.objects.bulk_create([CattleManagementEntry(management=record, animal_id=id) for id in ids])
    return {'id': str(record.pk), 'farm': str(farm.pk), 'kind': 'sanitary', 'status': 'draft', 'date': str(record.date),
        'participant_count': len(ids), 'inventory_lot': str(lot.pk), 'unit': lot.item.unidade_medida, 'total_quantity': str(total)}


def stock_review(user, values, animals, lock=False):
    command = {key: values[key] for key in ['inventory_lot', 'expected_unit', 'quantity', 'date', 'description', 'responsible', 'notes', 'milk_withdrawal_until', 'meat_withdrawal_until']}
    command.update(animal=animals[0].pk, expected_farm=animals[0].farm_id)
    public, internal, _, lot = mobile_medication.evaluate(user, command, lock=lock)
    total = values['quantity'] * len(animals)
    if total > Decimal('99999999.99') or total > lot.quantidade_atual:
        raise serializers.ValidationError({'quantity': 'Saldo insuficiente ou quantidade total fora do limite para todos os participantes.'})
    if lot.custo_unitario is not None and total * lot.custo_unitario > Decimal('999999999999.99'):
        raise serializers.ValidationError({'quantity': 'O consumo total excede o limite do manejo.'})
    if values['milk_withdrawal_until'] and CattleMilkRecord.objects.filter(animal_id__in=[animal.pk for animal in animals], date__gte=values['date'],
        date__lte=values['milk_withdrawal_until'], discarded_liters__lt=F('liters')).exists():
        raise serializers.ValidationError({'milk_withdrawal_until': 'Corrija as ordenhas aproveitadas de todos os participantes no período de carência.'})
    return public, internal, lot, total


class EditInput(Input):
    expected_version = serializers.DateTimeField()


def draft(user, pk, params, lock=False):
    from django.shortcuts import get_object_or_404
    farm, query = scope(user, params)
    qs = CattleManagement.objects.filter(pk=pk, farm=farm, cost_per_animal=0).only('id', 'farm_id', 'kind', 'status', 'updated_at',
        'inventory_lot_id', 'inventory_movement_id', 'inventory_quantity_per_animal', *mobile_sanitary.DOCUMENT_FIELDS)
    record = get_object_or_404(qs.select_for_update() if lock else qs)
    if record.kind != 'sanitary' or record.treatment_type != 'medication' or record.status != 'draft' or not record.inventory_lot_id or record.inventory_movement_id or not record.inventory_quantity_per_animal or record.inventory_quantity_per_animal <= 0:
        raise Conflict()
    entries = record.entries.all()
    valid = entries.filter(animal__farm=farm, animal__species__code='bovinos')
    if entries.count() != valid.count() or not valid.filter(animal__cattle_purpose__in=[query['production'], 'dual']).exists(): raise Conflict()
    return record, farm, query


def edit_options(user, pk, params):
    from django.shortcuts import get_object_or_404
    from apps.inventory.models import LoteEstoque
    from .mobile_weighing import options, animal_data
    record, farm, query = draft(user, pk, params)
    rows = list(record.entries.select_related('animal').only('id', 'management_id', 'weight_kg', 'animal__id', 'animal__identifier',
        'animal__farm_id', 'animal__cattle_purpose', 'animal__entry_date', 'animal__updated_at', 'animal__status').order_by('animal__identifier', 'id')[:1001])
    if not 1 <= len(rows) <= 1000 or any(row.weight_kg is not None for row in rows): raise Conflict()
    # Existing exhausted/inactive lots remain readable for correction or cancellation.
    lot = get_object_or_404(LoteEstoque.objects.filter(item__organization=user.organization).select_related('item').only(
        'id', 'numero_lote', 'quantidade_atual', 'data_validade', 'data_entrada', 'item__id', 'item__nome', 'item__unidade_medida', 'item__carencia_dias'), pk=record.inventory_lot_id)
    values = {key: getattr(record, key) for key in mobile_sanitary.DOCUMENT_FIELDS}
    for key in ['date', 'next_procedure_date', 'milk_withdrawal_until', 'meat_withdrawal_until']:
        values[key] = str(values[key]) if values[key] else ''
    values['quantity'] = str(record.inventory_quantity_per_animal)
    return {**options(user, params), 'id': str(record.pk), 'version': record.updated_at.isoformat(), 'values': values,
            'lot': mobile_medication.lot_data(lot), 'entries': [animal_data(row.animal) for row in rows]}


@transaction.atomic
def update(user, pk, values):
    record, farm, query = draft(user, pk, values, lock=True)
    if record.updated_at != values['expected_version']: raise Conflict()
    ids = [entry['animal'] for entry in values['entries']]
    eligible = Animal.objects.filter(pk__in=ids, farm=farm, species__code='bovinos', status='active')
    if len(list(eligible.order_by('pk').select_for_update(of=('self',)).only('id'))) != len(ids): raise Conflict()
    animals = list(eligible.only('id', 'farm_id', 'entry_date', 'birth_date', 'cattle_purpose', 'updated_at').order_by('pk'))
    if len(animals) != len(ids) or not any(row.cattle_purpose in [query['production'], 'dual'] for row in animals): raise Conflict()
    versions = {entry['animal']: entry['animal_version'] for entry in values['entries']}
    for animal in animals:
        if animal.updated_at != versions[animal.pk]: raise Conflict()
        validate_date(animal, values['date'])
    _, _, lot, total = stock_review(user, values, animals, lock=True)
    for key in mobile_sanitary.DOCUMENT_FIELDS: setattr(record, key, values[key])
    record.inventory_lot = lot; record.inventory_quantity_per_animal = values['quantity']
    record.save(update_fields=[*mobile_sanitary.DOCUMENT_FIELDS, 'inventory_lot', 'inventory_quantity_per_animal', 'updated_at'])
    record.entries.all().delete()
    CattleManagementEntry.objects.bulk_create([CattleManagementEntry(management=record, animal_id=id) for id in ids])
    return {'id': str(record.pk), 'farm': str(farm.pk), 'kind': 'sanitary', 'status': 'draft', 'date': str(record.date),
            'participant_count': len(ids), 'inventory_lot': str(lot.pk), 'unit': lot.item.unidade_medida, 'total_quantity': str(total)}


@transaction.atomic
def cancel(user, pk, values):
    record, farm, _ = draft(user, pk, values, lock=True)
    if record.updated_at != values['expected_version']: raise Conflict()
    record.status = 'cancelled'; record.cancellation_reason = values['reason']
    record.save(update_fields=['status', 'cancellation_reason', 'updated_at'])
    return {'id': str(record.pk), 'farm': str(farm.pk), 'status': record.status, 'cancellation_reason': record.cancellation_reason}
