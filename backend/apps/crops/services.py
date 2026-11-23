"""
Business logic / use cases for the crops app.
"""
from decimal import Decimal

from django.db import transaction
from django.db.models import F
from django.utils.translation import gettext as translate_message
from rest_framework.exceptions import ValidationError

from apps.inventory.choices import CategoriaItem, TipoMovimentacao, UnidadeMedida
from apps.inventory.models import ItemEstoque, LoteEstoque
from apps.inventory.services import registrar_movimentacao

from .finance_sync import remove_operation_transaction, sync_operation_transaction


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


def _quantity_in_inventory_unit(instance):
    """Converte a quantidade informada para a unidade cadastrada no estoque."""
    quantity = Decimal(instance.quantity)
    inventory_unit = (getattr(instance.item, "unidade_medida", "") or "").lower()
    operation_unit = (getattr(instance, "unit", "") or inventory_unit).lower()
    factors = {
        ("kg", "g"): Decimal("0.001"),
        ("g", "kg"): Decimal("1000"),
        ("l", "ml"): Decimal("0.001"),
        ("ml", "l"): Decimal("1000"),
        ("tonelada", "kg"): Decimal("0.001"),
        ("kg", "tonelada"): Decimal("1000"),
    }
    return quantity * factors.get((inventory_unit, operation_unit), Decimal("1"))


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
        instance.total_price = (
            _quantity_in_inventory_unit(instance) * instance.unit_price
        ).quantize(Decimal("0.01"))
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
    amount = _quantity_in_inventory_unit(instance)
    user = request.user if request.user.is_authenticated else None

    registrar_movimentacao(
        item=item,
        lote=lot,
        tipo=TipoMovimentacao.CONSUMO,
        quantidade=amount,
        responsavel=user,
        destino="Plantio",
        farm=instance.plantation.farm or instance.plantation.field.farm,
        observacao=description,
    )


def _process_operation(instance, request, category_name, reference_prefix):  # noqa: ARG001
    """Shared: create stock movement + financial transaction for an operation."""
    instance = _ensure_stock_lot_and_prices(instance)
    item_nome = instance.item.nome if hasattr(instance.item, "nome") else str(instance.item)
    date_str = str(getattr(instance, "application_date", None) or getattr(instance, "planting_date", ""))
    desc = f"{category_name}: {instance.plantation} — {item_nome} ({date_str})"

    _create_stock_movement(instance, request, desc)
    sync_operation_transaction(instance, request.user)


# ── Operation services ────────────────────────────────────────────────────


def _sync_planting_cycle_harvest_state(plantation):
    """Keep the crop lifecycle aligned with its partial/total harvests."""
    latest_total = (
        plantation.harvests.filter(harvest_type="total")
        .order_by("-harvest_date", "-created_at")
        .first()
    )
    if latest_total:
        actual_harvest_date = latest_total.harvest_date
        status = plantation.Status.FINISHED
    else:
        actual_harvest_date = None
        status = (
            plantation.Status.HARVESTING
            if plantation.harvests.exists()
            else plantation.Status.GROWING
        )

    if (
        plantation.actual_harvest_date != actual_harvest_date
        or plantation.status != status
    ):
        plantation.actual_harvest_date = actual_harvest_date
        plantation.status = status
        plantation.save(
            update_fields=["actual_harvest_date", "status", "updated_at"]
        )


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
    sync_operation_transaction(irrigation, request.user)
    return irrigation


@transaction.atomic
def create_land_preparation(serializer, request):
    """Register a land preparation operation and its cost transaction."""
    prep = serializer.save()
    sync_operation_transaction(prep, request.user)
    return prep


@transaction.atomic
def create_labor_record(serializer, request):
    """Register a labor record and create its financial expense."""
    labor_record = serializer.save()
    sync_operation_transaction(labor_record, request.user)
    return labor_record


def packaging_items(organization_id):
    return ItemEstoque.objects.filter(
        organization_id=organization_id, ativo=True,
        segmento="", unidade_medida__in=[UnidadeMedida.UNIDADE, UnidadeMedida.SACO, UnidadeMedida.CAIXA],
    )


def is_packaging_item(item):
    return bool({CategoriaItem.MATERIAL, CategoriaItem.OUTRO}.intersection([item.categoria, *(item.categorias or [])]))


def _stock_package_type(item):
    name = item.nome.casefold()
    if item.unidade_medida == UnidadeMedida.SACO or name.startswith(("saco", "sacaria")):
        return "sack"
    if item.unidade_medida == UnidadeMedida.CAIXA or name.startswith("caixa"):
        return "box"
    if name.startswith("big bag"):
        return "big_bag"
    if name.startswith("engradado"):
        return "crate"
    return "other"


def _restore_harvest_packaging(harvest):
    movements = harvest.packaging_movements.all()
    for movement in movements.order_by("lote_id"):
        lot = LoteEstoque.objects.select_for_update().get(pk=movement.lote_id)
        lot.quantidade_atual += movement.quantidade
        lot.save(update_fields=["quantidade_atual", "updated_at"])
    movements.delete()


def _save_harvest_packaging(serializer, request, **fields):
    previous = serializer.instance
    data = serializer.validated_data

    def value(key, default=None):
        return data.get(key, getattr(previous, key, default))

    item = value("package_item") if value("packaged") else None
    old_item_id = previous.package_item_id if previous else None
    plantation = value("planting_cycle")
    count = value("package_count")
    item_ids = {pk for pk in (old_item_id, item.pk if item else None) if pk}
    locked_items = {
        stock.pk: stock for stock in ItemEstoque.objects.select_for_update().filter(pk__in=item_ids).order_by("pk")
    }

    if value("packaged") and not item and (not previous or not previous.packaged or old_item_id):
        raise ValidationError({"package_item": translate_message("Selecione uma embalagem do estoque.")})

    if item and old_item_id == item.pk and previous.package_count == count:
        if item.organization_id != plantation.organization_id:
            raise ValidationError({"package_item": translate_message("Embalagem inválida para esta organização.")})
        if plantation.pk != previous.planting_cycle_id:
            previous.packaging_movements.update(farm=plantation.farm or plantation.field.farm)
        return serializer.save(package_type=previous.package_type, package_unit_cost=previous.package_unit_cost, **fields)

    if old_item_id:
        _restore_harvest_packaging(previous)
    if not item:
        return serializer.save(**fields)
    if (
        not packaging_items(plantation.organization_id).filter(pk=item.pk).exists()
        or not is_packaging_item(locked_items[item.pk])
    ):
        raise ValidationError({"package_item": translate_message("Selecione uma embalagem ativa na categoria Outros materiais.")})

    lots = list(item.lotes.select_for_update().filter(
        ativo=True, quantidade_atual__gt=0,
    ).order_by(F("data_validade").asc(nulls_last=True), "data_entrada", "pk"))
    available = sum((lot.quantidade_atual for lot in lots), Decimal("0"))
    if available < count:
        raise ValidationError({"package_count": translate_message("Saldo de embalagens insuficiente no estoque.")})
    if old_item_id == item.pk:
        unit_cost = previous.package_unit_cost
        package_type = previous.package_type
    else:
        unit_cost = sum(
            lot.quantidade_atual * (lot.custo_unitario or Decimal("0")) for lot in lots
        ) / available
        package_type = _stock_package_type(item)
    harvest = serializer.save(
        package_type=package_type, package_unit_cost=unit_cost.quantize(Decimal("0.01")), **fields,
    )
    remaining = Decimal(count)
    for lot in lots:
        if not remaining:
            break
        used = min(remaining, lot.quantidade_atual)
        registrar_movimentacao(
            item=item, lote=lot, tipo=TipoMovimentacao.CONSUMO, quantidade=used,
            responsavel=request.user, destino="Colheita", farm=plantation.farm or plantation.field.farm,
            observacao=f"Embalagem da colheita: {plantation} — {item.nome}", harvest=harvest,
        )
        remaining -= used
    return harvest


@transaction.atomic
def create_harvest(serializer, request):
    """Register a harvest and create revenue when production is sold."""
    harvest = _save_harvest_packaging(
        serializer, request, created_by=request.user if request.user.is_authenticated else None,
    )
    _sync_planting_cycle_harvest_state(harvest.planting_cycle)

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
            payment_date=harvest.harvest_date,
            status="paid",
            planting_cycle=plantation,
            reference=f"HARVEST-{harvest.id}",
            created_by=request.user if request.user.is_authenticated else None,
        )

    _sync_harvest_packing_transaction(harvest, request)
    return harvest


def _sync_harvest_packing_transaction(harvest, request=None):
    """Keep the packing expense ("Embalagem") aligned with the harvest."""
    from apps.finance.models import FinancialCategory, Transaction

    from .finance_sync import finance_enabled

    if not finance_enabled(harvest.planting_cycle.organization):
        return
    reference = f"HARVEST-PACK-{harvest.id}"
    existing = Transaction.objects.filter(reference=reference)
    amount = harvest.packing_cost
    if harvest.package_item_id:
        # The inventory purchase already accounts for the packaging material.
        amount -= harvest.package_count * harvest.package_unit_cost
    if not harvest.packaged or amount <= 0:
        existing.delete()
        return

    plantation = harvest.planting_cycle
    category, _ = FinancialCategory.objects.get_or_create(
        organization=plantation.organization,
        name="Embalagem",
        category_type="expense",
    )
    values = {
        "organization": plantation.organization,
        "farm": plantation.farm,
        "category": category,
        "description": f"Embalagem da colheita: {plantation} — {harvest.package_count} {harvest.package_item.nome if harvest.package_item_id else harvest.get_package_type_display()}",
        "amount": amount,
        "due_date": harvest.harvest_date,
        "payment_date": harvest.harvest_date,
        "status": "paid",
        "planting_cycle": plantation,
    }
    current = existing.order_by("created_at").first()
    if current:
        existing.exclude(id=current.id).delete()
        for field, value in values.items():
            setattr(current, field, value)
        current.save()
        return
    if request and request.user.is_authenticated:
        values["created_by"] = request.user
    Transaction.objects.create(reference=reference, **values)


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
        "payment_date": harvest.harvest_date,
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
    serializer.instance = type(serializer.instance).objects.select_for_update().get(pk=serializer.instance.pk)
    previous_plantation = serializer.instance.planting_cycle
    harvest = _save_harvest_packaging(serializer, request)
    _sync_harvest_transaction(harvest, request)
    _sync_harvest_packing_transaction(harvest, request)
    _sync_planting_cycle_harvest_state(harvest.planting_cycle)
    if previous_plantation.pk != harvest.planting_cycle_id:
        _sync_planting_cycle_harvest_state(previous_plantation)
    return harvest


@transaction.atomic
def delete_harvest(harvest):
    """Delete a harvest and its generated revenue transaction."""
    from apps.finance.models import Transaction

    harvest = type(harvest).objects.select_for_update().get(pk=harvest.pk)
    if harvest.package_item_id:
        ItemEstoque.objects.select_for_update().get(pk=harvest.package_item_id)
        _restore_harvest_packaging(harvest)
    plantation = harvest.planting_cycle
    Transaction.objects.filter(
        reference__in=[f"HARVEST-{harvest.id}", f"HARVEST-PACK-{harvest.id}"]
    ).delete()
    harvest.delete()
    _sync_planting_cycle_harvest_state(plantation)


# ── Production sales ──────────────────────────────────────────────────────


def _sync_crop_sale_transaction(sale, request=None):
    """Keep the revenue transaction ("Venda da produção") aligned with the sale."""
    from apps.finance.models import FinancialCategory, Transaction

    from .finance_sync import finance_enabled

    if not finance_enabled(sale.organization):
        return
    plantation = sale.planting_cycle
    category, _ = FinancialCategory.objects.get_or_create(
        organization=sale.organization,
        name="Venda da produção",
        category_type="revenue",
    )
    reference = f"CROPSALE-{sale.id}"
    values = {
        "organization": sale.organization,
        "farm": plantation.farm,
        "category": category,
        "description": f"Venda da produção: {plantation.crop_name} — {sale.buyer or plantation}",
        "amount": sale.total_amount,
        "due_date": sale.sale_date,
        "payment_date": sale.sale_date,
        "status": "paid",
        "planting_cycle": plantation,
    }
    existing = Transaction.objects.filter(organization=sale.organization, reference=reference)
    current = existing.order_by("created_at").first()
    if current:
        existing.exclude(id=current.id).delete()
        for field, value in values.items():
            setattr(current, field, value)
        current.save()
        return
    if request and request.user.is_authenticated:
        values["created_by"] = request.user
    Transaction.objects.create(reference=reference, **values)


@transaction.atomic
def create_crop_sale(serializer, request):
    sale = serializer.save(
        organization=request.user.organization,
        created_by=request.user if request.user.is_authenticated else None,
    )
    _sync_crop_sale_transaction(sale, request)
    return sale


@transaction.atomic
def update_crop_sale(serializer, request):
    sale = serializer.save()
    _sync_crop_sale_transaction(sale, request)
    return sale


@transaction.atomic
def delete_crop_sale(sale):
    from apps.finance.models import Transaction

    Transaction.objects.filter(
        organization=sale.organization, reference=f"CROPSALE-{sale.id}"
    ).delete()
    sale.delete()


# ── Edit / delete of crop operations keep the finance mirror aligned ─────


@transaction.atomic
def update_crop_operation(serializer, request):
    instance = serializer.save()
    sync_operation_transaction(instance, request.user)
    return instance


@transaction.atomic
def delete_crop_operation(instance):
    remove_operation_transaction(instance)
    instance.delete()
