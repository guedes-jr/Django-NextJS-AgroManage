"""Reviewed single-animal bovine medication through the existing sanitary management."""
from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.core import signing
from django.db import transaction
from django.db.models import Q, F, TextField
from django.db.models.functions import Cast
from django.utils import timezone
from rest_framework import exceptions, serializers

from apps.inventory.models import ItemEstoque, LoteEstoque
from .models import Animal, CattleManagement, CattleManagementEntry, CattleMilkRecord, HealthRecord
from .mobile_health import validate_date
from .mobile_vaccination import Strict, Conflict, fingerprint, canonical
from .cattle_stock_management import validate_management_stock
from .cattle_services import confirm_cattle_management

SALT = 'livestock.mobile-medication.v1'


def authorize(user):
    if not user.organization_id or user.force_password_change or user.role not in ('admin', 'manager'):
        raise exceptions.PermissionDenied('Aplicações por manejo sanitário exigem gerente ou administrador.')


class Input(Strict):
    animal = serializers.UUIDField()
    expected_farm = serializers.UUIDField()
    inventory_lot = serializers.UUIDField()
    expected_unit = serializers.CharField(max_length=20)
    quantity = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal('.01'))
    date = serializers.DateField()
    description = serializers.CharField(max_length=200)
    responsible = serializers.CharField(max_length=100, allow_blank=True, default='')
    notes = serializers.CharField(max_length=2000, allow_blank=True, default='')
    milk_withdrawal_until = serializers.DateField(allow_null=True, default=None)
    meat_withdrawal_until = serializers.DateField(allow_null=True, default=None)


class Query(serializers.Serializer):
    search = serializers.CharField(max_length=100, allow_blank=True, default='')


def medication_items(user):
    # Exact quoted category tokens, portable JSON text matching on SQLite/PostgreSQL.
    return ItemEstoque.objects.alias(_mobile_categories=Cast('categorias', TextField())).filter(
        Q(categoria__in=['medicamento', 'medicamento_vacina']) |
        Q(_mobile_categories__contains='"medicamento"') | Q(_mobile_categories__contains='"medicamento_vacina"'),
        organization_id=user.organization_id, ativo=True, especie_animal__in=['', 'bovino', 'multiplo'],
    )


def lots(user, search=''):
    authorize(user)
    items = medication_items(user)
    return LoteEstoque.objects.filter(item__in=items, ativo=True, quantidade_atual__gt=0).filter(
        Q(item__nome__icontains=search) | Q(numero_lote__icontains=search)
    ).select_related('item').only('id', 'numero_lote', 'quantidade_atual', 'data_validade', 'data_entrada',
                                'item__id', 'item__nome', 'item__unidade_medida', 'item__carencia_dias').order_by('item__nome', 'data_validade', 'id')


def lot_data(lot):
    return {'id': str(lot.pk), 'item': str(lot.item_id), 'name': lot.item.nome, 'unit': lot.item.unidade_medida,
            'number': lot.numero_lote, 'balance': str(lot.quantidade_atual), 'expiry': str(lot.data_validade) if lot.data_validade else None,
            'received': str(lot.data_entrada), 'withdrawal_days': lot.item.carencia_dias or 0}


def options(user):
    authorize(user)
    return {'today': str(timezone.localdate()), 'timezone': settings.TIME_ZONE}


def evaluate(user, command, lock=False):
    authorize(user)
    qs = Animal.objects.filter(pk=command['animal'], farm__organization_id=user.organization_id,
                               species__code='bovinos', status='active').select_related('farm').only(
        'id', 'identifier', 'farm__id', 'farm__name', 'birth_date', 'entry_date', 'updated_at')
    animal = (qs.select_for_update(of=('self',)) if lock else qs).first()
    if not animal:
        raise exceptions.NotFound()
    if animal.farm_id != command['expected_farm']:
        raise serializers.ValidationError({'expected_farm': 'O animal mudou de fazenda. Atualize a seleção.'})
    validate_date(animal, command['date'])
    items = medication_items(user)
    lot_item = LoteEstoque.objects.filter(pk=command['inventory_lot'], item__in=items).values_list('item_id', flat=True).first()
    if not lot_item:
        raise serializers.ValidationError({'inventory_lot': 'Selecione um lote de medicamento bovino da organização.'})
    item_qs = items.filter(pk=lot_item)
    item = (item_qs.select_for_update() if lock else item_qs).get()
    lot_qs = LoteEstoque.objects.filter(pk=command['inventory_lot'], item_id=item.pk)
    lot = (lot_qs.select_for_update() if lock else lot_qs).get()
    lot.item = item
    if item.unidade_medida != command['expected_unit']:
        raise serializers.ValidationError({'expected_unit': 'A unidade do produto mudou. Atualize a seleção.'})
    candidate = CattleManagement(kind='sanitary', date=command['date'], inventory_lot=lot,
        inventory_quantity_per_animal=command['quantity'], milk_withdrawal_until=command['milk_withdrawal_until'],
        meat_withdrawal_until=command['meat_withdrawal_until'])
    for field in ('milk_withdrawal_until', 'meat_withdrawal_until'):
        if command[field] and command[field] < command['date']:
            raise serializers.ValidationError({field: 'A carência não pode anteceder a aplicação.'})
    validate_management_stock(candidate, user.organization)
    if command['quantity'] > lot.quantidade_atual:
        raise serializers.ValidationError({'quantity': 'Saldo insuficiente no lote selecionado.'})
    if lot.custo_unitario is not None and command['quantity'] * lot.custo_unitario > Decimal('999999999999.99'):
        raise serializers.ValidationError({'quantity': 'O consumo excede o limite do manejo.'})
    if command['milk_withdrawal_until'] and CattleMilkRecord.objects.filter(animal=animal, date__gte=command['date'],
        date__lte=command['milk_withdrawal_until'], discarded_liters__lt=F('liters')).exists():
        raise serializers.ValidationError({'milk_withdrawal_until': 'Corrija as ordenhas aproveitadas no período de carência antes de aplicar.'})
    public = {'animal': {'id': str(animal.pk), 'identifier': animal.identifier, 'farm': str(animal.farm_id), 'farm_name': animal.farm.name},
              'lot': lot_data(lot), 'quantity': str(command['quantity']), 'remaining': str(lot.quantidade_atual-command['quantity']),
              'minimum_withdrawal': str(command['date']+timedelta(days=item.carencia_dias)) if item.carencia_dias else None}
    internal = {'public': public, 'animal_version': animal.updated_at.isoformat(), 'item_version': item.updated_at.isoformat(),
                'lot_version': lot.updated_at.isoformat(), 'unit_cost': str(lot.custo_unitario), 'today': str(timezone.localdate())}
    return public, internal, animal, lot


def preview(user, command):
    public, internal, *_ = evaluate(user, command)
    intent = canonical(command)
    return {**public, 'command': intent, 'preview_token': signing.dumps({'user': str(user.pk), 'org': str(user.organization_id),
        'command': intent, 'digest': fingerprint(internal)}, salt=SALT, compress=True)}


@transaction.atomic
def confirm(user, token):
    authorize(user)
    try:
        intent = signing.loads(token, salt=SALT, max_age=900)
    except signing.BadSignature as error:
        raise Conflict() from error
    if intent['user'] != str(user.pk) or intent['org'] != str(user.organization_id):
        raise exceptions.PermissionDenied()
    value = Input(data=intent['command']); value.is_valid(raise_exception=True)
    command = value.validated_data
    try:
        public, internal, animal, lot = evaluate(user, command, lock=True)
    except (serializers.ValidationError, exceptions.NotFound, ItemEstoque.DoesNotExist, LoteEstoque.DoesNotExist) as error:
        raise Conflict() from error
    if fingerprint(internal) != intent['digest']:
        raise Conflict()
    management = CattleManagement.objects.create(farm=animal.farm, kind='sanitary', date=command['date'],
        description=command['description'], responsible=command['responsible'], notes=command['notes'], treatment_type='medication',
        inventory_lot=lot, inventory_quantity_per_animal=command['quantity'], milk_withdrawal_until=command['milk_withdrawal_until'],
        meat_withdrawal_until=command['meat_withdrawal_until'], created_by=user)
    CattleManagementEntry.objects.create(management=management, animal=animal)
    confirm_cattle_management(management, user)
    record = HealthRecord.objects.get(cattle_management=management, animal=animal)
    return {'id': str(record.pk), 'management': str(management.pk)}
