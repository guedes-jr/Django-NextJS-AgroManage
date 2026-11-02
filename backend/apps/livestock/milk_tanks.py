"""Milk storage is an auditable ledger backed by recorded usable production."""
from decimal import Decimal
from django.db import transaction
from django.db.models import Sum, F, DecimalField, Case, When, Value, Count
from django.utils import timezone
from rest_framework.exceptions import ValidationError, PermissionDenied
from apps.farms.models import Farm
from .models import MilkTank, MilkTankMovement, MilkTankQuality, CattleMilkRecord, CattleMilkDailyTotal

ZERO = Decimal("0")


def tanks(organization):
    return MilkTank.objects.filter(farm__organization=organization).select_related("farm").annotate(
        balance_liters=Sum(Case(When(movements__cancelled_at__isnull=True, movements__kind="production", then=F("movements__liters")), When(movements__cancelled_at__isnull=True, movements__kind__in=["collection", "discard"], then=-F("movements__liters")), default=Value(0), output_field=DecimalField(max_digits=14, decimal_places=2)), default=0)).order_by("farm__name", "name", "id")


def production_available(farm, day):
    individual_rows = CattleMilkRecord.objects.filter(animal__farm=farm, date=day).aggregate(total=Sum(F("liters")-F("discarded_liters")), count=Count("pk"))
    daily_rows = CattleMilkDailyTotal.objects.filter(farm=farm, date=day).aggregate(total=Sum(F("liters")-F("discarded_liters")), count=Count("pk"))
    if individual_rows["count"] and daily_rows["count"]:
        raise ValidationError("Há produção total e individual na mesma fazenda e data. Regularize os lançamentos antes de receber no tanque.")
    individual, daily = individual_rows["total"] or ZERO, daily_rows["total"] or ZERO
    allocated = MilkTankMovement.objects.filter(tank__farm=farm, date=day, kind="production", cancelled_at__isnull=True).aggregate(total=Sum("liters"))["total"] or ZERO
    return {"produced_usable": individual+daily, "allocated": allocated, "available": individual+daily-allocated}


def protect_production(farm, *days):
    for day in set(days):
        if production_available(farm, day)["available"] < 0:
            raise ValidationError("Esta produção já foi recebida no tanque. Cancele primeiro a entrada correspondente; não reduza nem exclua o leite já armazenado.")


def validate_ledger(tank):
    balance = ZERO
    for row in tank.movements.filter(cancelled_at__isnull=True).order_by("date", "created_at", "id"):
        balance += row.liters if row.kind == "production" else -row.liters
        if balance < 0:
            raise ValidationError({"liters": "Saldo insuficiente na data do lançamento. Confira as entradas e coletas anteriores."})
        if balance > tank.capacity_liters:
            raise ValidationError({"liters": "O lançamento ultrapassa a capacidade do tanque. Confira o histórico ou selecione outro tanque."})
    return balance


@transaction.atomic
def save_tank(user, data, instance=None):
    farm = instance.farm if instance else data["farm"]
    Farm.objects.select_for_update().get(pk=farm.pk)
    if instance:
        instance = MilkTank.objects.select_for_update().get(pk=instance.pk)
        if data.get("farm", farm) != farm:
            raise ValidationError({"farm": "A fazenda do tanque não pode ser alterada."})
        if "capacity_liters" in data and data["capacity_liters"] != instance.capacity_liters and instance.movements.exists():
            raise ValidationError({"capacity_liters": "Tanque com histórico: cadastre outro equipamento para mudar a capacidade."})
        if data.get("is_active") is False and validate_ledger(instance) != 0:
            raise ValidationError({"is_active": "Esvazie o tanque por coleta ou descarte antes de desativá-lo."})
        for key, value in data.items(): setattr(instance, key, value)
        instance.save()
        return instance
    if MilkTank.objects.filter(farm=farm, name=data["name"]).exists():
        raise ValidationError({"name": "Já existe um tanque com este nome na fazenda."})
    return MilkTank.objects.create(**data)


@transaction.atomic
def move_milk(user, data):
    tank = data["tank"]
    Farm.objects.select_for_update().get(pk=tank.farm_id)
    tank = MilkTank.objects.select_for_update().select_related("farm").get(pk=tank.pk)
    previous = tank.movements.filter(request_key=data["request_key"]).first()
    if previous: return previous
    if not tank.is_active: raise ValidationError({"tank": "Tanque inativo."})
    financial = data.pop("generate_receivable", False)
    due = data.pop("due_date", None)
    if user.role not in {"admin", "manager"} and (financial or data.get("unit_price") is not None):
        raise PermissionDenied("Valores e receitas exigem gerente ou administrador.")
    if data["kind"] == "production" and data["liters"] > production_available(tank.farm, data["date"])["available"]:
        raise ValidationError({"liters": "Volume superior à produção aproveitável ainda não destinada a tanques nesta fazenda e data."})
    if data.get("unit_price") is not None:
        data["amount"] = (data["unit_price"] * data["liters"]).quantize(Decimal(".01"))
        if data["amount"] <= 0 or data["amount"] > Decimal("9999999999.99"):
            raise ValidationError({"unit_price": "Valor total fora dos limites permitidos."})
    movement = MilkTankMovement.objects.create(**data, created_by=user)
    validate_ledger(tank)
    if financial:
        from apps.finance.models import FinancialCategory, Transaction
        from .models import Species
        category, _ = FinancialCategory.objects.get_or_create(organization=user.organization, name="Venda de leite", category_type="revenue")
        species, _ = Species.objects.get_or_create(code="bovinos", defaults={"name":"Bovinos"})
        movement.receivable = Transaction.objects.create(organization=user.organization, farm=tank.farm, species=species, category=category,
            description=f"Coleta de leite · {tank.name} · {movement.buyer}", amount=movement.amount, due_date=due or movement.date,
            status="pending", reference=f"SALE-MILK-TANK-{movement.pk}", created_by=user, notes=movement.document)
        movement.save(update_fields=["receivable", "updated_at"])
    return movement


@transaction.atomic
def cancel_movement(user, movement, reason):
    Farm.objects.select_for_update().get(pk=movement.tank.farm_id)
    tank = MilkTank.objects.select_for_update().get(pk=movement.tank_id)
    movement = MilkTankMovement.objects.select_for_update().get(pk=movement.pk)
    if movement.cancelled_at: return movement
    if movement.receivable_id:
        from apps.finance.models import Transaction
        title = Transaction.objects.select_for_update().get(pk=movement.receivable_id)
        if title.status == "paid": raise ValidationError("Estorne o recebimento no financeiro antes de cancelar esta coleta.")
        title.status = "cancelled"; title.save(update_fields=["status", "updated_at"])
    movement.cancelled_at = timezone.now(); movement.cancelled_by = user; movement.cancellation_reason = reason
    movement.save(update_fields=["cancelled_at", "cancelled_by", "cancellation_reason", "updated_at"])
    validate_ledger(tank)
    return movement


@transaction.atomic
def record_quality(user, data):
    tank = data["tank"]
    Farm.objects.select_for_update().get(pk=tank.farm_id)
    tank = MilkTank.objects.select_for_update().get(pk=tank.pk)
    existing = tank.quality_records.filter(request_key=data["request_key"]).first()
    if existing: return existing
    if not tank.is_active: raise ValidationError({"tank": "Tanque inativo."})
    return MilkTankQuality.objects.create(**data, created_by=user)


@transaction.atomic
def delete_milk(record):
    farm = record.farm if isinstance(record, CattleMilkDailyTotal) else record.animal.farm
    Farm.objects.select_for_update().get(pk=farm.pk)
    day = record.date
    record.delete()
    protect_production(farm, day)
