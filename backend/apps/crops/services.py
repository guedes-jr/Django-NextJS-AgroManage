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
