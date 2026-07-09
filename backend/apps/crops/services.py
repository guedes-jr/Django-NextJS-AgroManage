"""
Business logic / use cases for the crops app.
"""
from decimal import Decimal

from django.db import transaction


@transaction.atomic
def create_plantation(serializer, request):
    """Create a new plantation with organization context."""
    organization = getattr(request.user, "organization", None)
    farm = serializer.validated_data.get("farm")
    if not farm and serializer.validated_data.get("field"):
        farm = serializer.validated_data["field"].farm

    serializer.save(
        organization=organization,
        farm=farm,
    )


@transaction.atomic
def update_plantation(serializer, request):
    """Update a plantation."""
    farm = serializer.validated_data.get("farm")
    if not farm and serializer.validated_data.get("field"):
        farm = serializer.validated_data["field"].farm
    serializer.save(farm=farm)


# ── Shared helpers for operation services ─────────────────────────────────


def _ensure_stock_lot_and_prices(instance):
    """Attach an available stock lot and derive missing prices from its cost."""
    if not getattr(instance, "item_id", None):
        return instance

    lot = getattr(instance, "lot", None)
    lot_changed = False
    unit_price_changed = False
    total_price_changed = False
    if not lot:
        lot = (
            instance.item.lotes.filter(ativo=True, quantidade_atual__gt=0, custo_unitario__gt=0)
            .order_by("data_validade", "created_at")
            .first()
            or instance.item.lotes.filter(ativo=True, quantidade_atual__gt=0)
            .order_by("data_validade", "created_at")
            .first()
        )
        if lot:
            instance.lot = lot
            lot_changed = True

    if lot and (not instance.unit_price or instance.unit_price <= 0):
        instance.unit_price = lot.custo_unitario or Decimal("0")
        unit_price_changed = True

    if instance.unit_price and instance.unit_price > 0 and (
        not instance.total_price or instance.total_price <= 0
    ):
        instance.total_price = (instance.quantity * instance.unit_price).quantize(Decimal("0.01"))
        total_price_changed = True

    update_fields = []
    if lot_changed:
        update_fields.append("lot")
    if unit_price_changed:
        update_fields.append("unit_price")
    if total_price_changed:
        update_fields.append("total_price")
    if update_fields:
        instance.save(update_fields=list(dict.fromkeys(update_fields + ["updated_at"])))
    return instance


def _create_stock_movement(instance, request, description):
    """Create a stock outflow movement (CONSUMO) for any crop operation."""
    from apps.inventory.choices import TipoMovimentacao
    from apps.inventory.services import registrar_movimentacao

    item = instance.item
    lot = getattr(instance, "lot", None)
    amount = instance.quantity
    user = request.user if request.user.is_authenticated else None

    registrar_movimentacao(
        item=item,
        lote=lot,
        tipo=TipoMovimentacao.CONSUMO,
        quantidade=amount,
        responsavel=user,
        destino="Plantio",
        observacao=description,
    )


def _create_financial_transaction(instance, request, category_name, reference_prefix):
    """Create an expense transaction for any crop operation."""
    from apps.finance.models import FinancialCategory, Transaction

    plantation = instance.plantation
    organization = plantation.organization
    farm = plantation.farm

    if not instance.total_price or instance.total_price <= 0:
        return

    category, _ = FinancialCategory.objects.get_or_create(
        organization=organization,
        name=category_name,
        category_type="expense",
    )

    item_desc = f" — {instance.item}" if hasattr(instance, "item") and instance.item else ""
    due_date = getattr(instance, "application_date", None) or getattr(instance, "planting_date", None) or getattr(instance, "date", None)

    Transaction.objects.create(
        organization=organization,
        farm=farm,
        category=category,
        description=f"{category_name}: {plantation}{item_desc}",
        amount=instance.total_price,
        due_date=due_date,
        status="paid",
        planting_cycle=plantation,
        reference=f"{reference_prefix}-{instance.id}",
    )


def _process_operation(instance, request, category_name, reference_prefix):
    """Shared: create stock movement + financial transaction for an operation."""
    instance = _ensure_stock_lot_and_prices(instance)
    item_nome = instance.item.nome if hasattr(instance.item, "nome") else str(instance.item)
    date_str = str(getattr(instance, "application_date", None) or getattr(instance, "planting_date", ""))
    desc = f"{category_name}: {instance.plantation} — {item_nome} ({date_str})"

    _create_stock_movement(instance, request, desc)
    _create_financial_transaction(instance, request, category_name, reference_prefix)


# ── Operation services ────────────────────────────────────────────────────


@transaction.atomic
def create_planting(serializer, request):
    planting = serializer.save()
    _process_operation(planting, request, "Plantio", "PLANTING")
    return planting


@transaction.atomic
def create_fertilization(serializer, request):
    fertilization = serializer.save()
    _process_operation(fertilization, request, "Adubação", "FERTILIZATION")
    return fertilization


@transaction.atomic
def create_fertigation(serializer, request):
    fertigation = serializer.save()
    _process_operation(fertigation, request, "Fertirrigação", "FERTIGATION")
    return fertigation


@transaction.atomic
def create_pesticide_application(serializer, request):
    application = serializer.save()
    _process_operation(application, request, "Defensivos", "PESTICIDE")
    return application


@transaction.atomic
def create_irrigation(serializer, request):
    """Register an irrigation event.

    Auto-calculates liters, energy, and cost via model.save().
    Creates a financial transaction if energy_cost > 0.
    """
    irrigation = serializer.save()

    if irrigation.energy_cost and irrigation.energy_cost > 0:
        from apps.finance.models import FinancialCategory, Transaction

        plantation = irrigation.plantation
        category, _ = FinancialCategory.objects.get_or_create(
            organization=plantation.organization,
            name="Irrigação",
            category_type="expense",
        )

        Transaction.objects.create(
            organization=plantation.organization,
            farm=plantation.farm,
            category=category,
            description=f"Irrigação: {plantation} — {irrigation.start_date or irrigation.date}",
            amount=irrigation.energy_cost,
            due_date=irrigation.start_date or irrigation.date,
            status="paid",
            planting_cycle=plantation,
            reference=f"IRRIGATION-{irrigation.id}",
        )

    return irrigation


@transaction.atomic
def create_land_preparation(serializer, request):
    """Register a land preparation operation and its cost transaction."""
    prep = serializer.save()
    if prep.total_price > 0:
        _create_financial_transaction(prep, request, "Máquinas", "LANDPREP")
    return prep


@transaction.atomic
def create_labor_record(serializer, request):
    """Register a labor record and create its financial expense."""
    labor_record = serializer.save()

    if labor_record.total_amount and labor_record.total_amount > 0:
        from apps.finance.models import FinancialCategory, Transaction

        plantation = labor_record.plantation
        category, _ = FinancialCategory.objects.get_or_create(
            organization=plantation.organization,
            name="Mão de Obra",
            category_type="expense",
        )

        Transaction.objects.create(
            organization=plantation.organization,
            farm=plantation.farm,
            category=category,
            description=f"Mão de Obra: {plantation} — {labor_record.worker}",
            amount=labor_record.total_amount,
            due_date=labor_record.activity_date,
            status="paid",
            planting_cycle=plantation,
            reference=f"LABOR-{labor_record.id}",
            created_by=request.user if request.user.is_authenticated else None,
        )

    return labor_record


@transaction.atomic
def create_harvest(serializer, request):
    """Register a harvest and create revenue when production is sold."""
    harvest = serializer.save(
        created_by=request.user if request.user.is_authenticated else None,
    )

    if harvest.destination == harvest.Destination.SALE and harvest.revenue_amount > 0:
        from apps.finance.models import FinancialCategory, Transaction

        plantation = harvest.planting_cycle
        category, _ = FinancialCategory.objects.get_or_create(
            organization=plantation.organization,
            name="Colheita",
            category_type="revenue",
        )

        Transaction.objects.create(
            organization=plantation.organization,
            farm=plantation.farm,
            category=category,
            description=f"Colheita: {plantation} — {harvest.buyer_name or harvest.buyer or 'Venda'}",
            amount=harvest.revenue_amount,
            due_date=harvest.harvest_date,
            status="paid",
            planting_cycle=plantation,
            reference=f"HARVEST-{harvest.id}",
            created_by=request.user if request.user.is_authenticated else None,
        )

    return harvest


def _sync_harvest_transaction(harvest, request=None):
    """Keep the financial revenue aligned with a harvest sale."""
    from apps.finance.models import FinancialCategory, Transaction

    reference = f"HARVEST-{harvest.id}"
    transaction_qs = Transaction.objects.filter(reference=reference)

    if harvest.destination != harvest.Destination.SALE or harvest.revenue_amount <= 0:
        transaction_qs.delete()
        return

    plantation = harvest.planting_cycle
    category, _ = FinancialCategory.objects.get_or_create(
        organization=plantation.organization,
        name="Colheita",
        category_type="revenue",
    )
    created_by = None
    if request and request.user.is_authenticated:
        created_by = request.user

    defaults = {
        "organization": plantation.organization,
        "farm": plantation.farm,
        "category": category,
        "description": f"Colheita: {plantation} — {harvest.buyer_name or harvest.buyer or 'Venda'}",
        "amount": harvest.revenue_amount,
        "due_date": harvest.harvest_date,
        "status": "paid",
        "planting_cycle": plantation,
    }
    if created_by:
        defaults["created_by"] = created_by

    transaction_obj = transaction_qs.order_by("created_at").first()
    transaction_qs.exclude(id=getattr(transaction_obj, "id", None)).delete()

    if transaction_obj:
        for field, value in defaults.items():
            setattr(transaction_obj, field, value)
        transaction_obj.save()
    else:
        Transaction.objects.create(reference=reference, **defaults)


@transaction.atomic
def update_harvest(serializer, request):
    """Update a harvest and synchronize its revenue transaction."""
    harvest = serializer.save()
    _sync_harvest_transaction(harvest, request)
    return harvest


@transaction.atomic
def delete_harvest(harvest):
    """Delete a harvest and its generated revenue transaction."""
    from apps.finance.models import Transaction

    Transaction.objects.filter(reference=f"HARVEST-{harvest.id}").delete()
    harvest.delete()
