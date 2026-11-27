"""
Keeps the finance mirror of crop operations aligned with the operation records.

Every crop operation (planting, fertilization, fertigation, pesticides, irrigation,
mechanized services and labor) has one expense transaction in Finance identified
by ``<PREFIX>-<operation id>``, except for the input taken from a purchased stock
lot: that purchase (``LOTE-<lot>``) is already the expense. The operation record is the source of truth: its
cost is computed here once, and the mirror is created, updated or removed with it.
"""
from dataclasses import dataclass
from decimal import Decimal
from typing import Callable

from django.db import transaction

ZERO = Decimal("0")


def _decimal(value) -> Decimal:
    return Decimal(value) if value not in (None, "") else ZERO


@dataclass(frozen=True)
class OperationSpec:
    prefix: str
    category: str
    model_name: str
    date: Callable
    cost: Callable

    def reference(self, instance) -> str:
        return f"{self.prefix}-{instance.id}"


def _pesticide_cost(application) -> Decimal:
    equipments = sum((_decimal(item.total_price) for item in application.equipments.all()), ZERO)
    return _decimal(application.total_price) + equipments


SPECS = (
    OperationSpec("PLANTING", "Plantio", "Planting", lambda o: o.planting_date, lambda o: _decimal(o.total_price)),
    OperationSpec("FERTILIZATION", "Adubação", "Fertilization", lambda o: o.application_date, lambda o: _decimal(o.total_price)),
    OperationSpec("FERTIGATION", "Fertirrigação", "Fertigation", lambda o: o.application_date, lambda o: _decimal(o.total_price)),
    OperationSpec("PESTICIDE", "Defensivos", "PesticideApplication", lambda o: o.application_date, _pesticide_cost),
    OperationSpec("IRRIGATION", "Irrigação", "Irrigation", lambda o: o.start_date or o.date, lambda o: _decimal(o.energy_cost)),
    OperationSpec("LANDPREP", "Máquinas", "LandPreparation", lambda o: o.date, lambda o: _decimal(o.total_price)),
    OperationSpec("LABOR", "Mão de Obra", "LaborRecord", lambda o: o.activity_date, lambda o: _decimal(o.total_amount)),
)
SPEC_BY_MODEL = {spec.model_name: spec for spec in SPECS}


def spec_for(instance) -> OperationSpec | None:
    return SPEC_BY_MODEL.get(type(instance).__name__)


def operation_cost(instance) -> Decimal:
    """Cost of one crop operation, as every screen and report must show it."""
    spec = spec_for(instance)
    return spec.cost(instance).quantize(Decimal("0.01")) if spec else ZERO


# Operations whose input comes from a stock lot (``item``/``lot``) and is priced
# in ``total_price``. Pesticide equipment is not stock and stays in the mirror.
STOCK_INPUT_MODELS = {"Planting", "Fertilization", "Fertigation", "PesticideApplication"}


def stock_paid_cost(instance) -> Decimal:
    """Part of the operation cost already recorded in Finance by the stock purchase.

    The input was taken from a stock lot whose purchase generated ``LOTE-<lot>``.
    That purchase is the expense; consuming it is a crop cost (shown on the crop
    screens from the record) but not a new expense, as with livestock feed.
    """
    from apps.finance.models import Transaction

    spec = spec_for(instance)
    lot_id = getattr(instance, "lot_id", None)
    if spec is None or spec.model_name not in STOCK_INPUT_MODELS or not lot_id:
        return ZERO
    organization = instance.plantation.organization
    purchased = Transaction.all_objects.filter(organization=organization, reference=f"LOTE-{lot_id}").exclude(
        status=Transaction.Status.CANCELLED
    ).exists()
    return _decimal(instance.total_price).quantize(Decimal("0.01")) if purchased else ZERO


def mirror_cost(instance) -> Decimal:
    """Amount of the operation's finance mirror: its cost minus what the stock purchase already recorded."""
    return max(operation_cost(instance) - stock_paid_cost(instance), ZERO)


def _description(spec: OperationSpec, instance) -> str:
    detail = getattr(instance, "item", None) or getattr(instance, "worker", None)
    if spec.model_name == "LandPreparation":
        detail = instance.get_operation_type_display()
    suffix = f" — {detail}" if detail else ""
    return f"{spec.category}: {instance.plantation}{suffix}"


@transaction.atomic
def finance_enabled(organization) -> bool:
    """Configurações › Recursos dos segmentos › Plantações › Financeiro (on by default)."""
    from apps.organizations import segment_features as features

    return features.enabled(organization, features.CROPS, features.FINANCE)


def sync_operation_transaction(instance, user=None) -> str:
    """Create, update or remove the finance mirror of one operation.

    The mirror carries only what is not already in Finance through the stock
    purchase of its input (see ``mirror_cost``); the operation cost itself is unchanged.

    Returns what happened: "created", "updated", "unchanged", "removed" or "skipped".
    Mirrors cancelled by the user in Finance are left untouched.
    """
    from apps.finance.models import FinancialCategory, Transaction

    spec = spec_for(instance)
    if spec is None:
        return "skipped"
    plantation = instance.plantation
    organization = plantation.organization
    if not finance_enabled(organization):
        # Recursos dos segmentos › Plantações › Financeiro is off: existing mirrors stay as they are.
        return "skipped"
    reference = spec.reference(instance)
    existing = Transaction.all_objects.filter(organization=organization, reference=reference).order_by("created_at")
    current = existing.first()
    cost = mirror_cost(instance)

    if cost <= 0:
        if current and current.status != Transaction.Status.CANCELLED:
            existing.delete()
            return "removed"
        return "unchanged"

    if current and current.status == Transaction.Status.CANCELLED:
        return "skipped"

    category, _ = FinancialCategory.objects.get_or_create(
        organization=organization, name=spec.category, category_type="expense"
    )
    when = spec.date(instance)
    values = {
        "farm": plantation.farm,
        "category": category,
        "description": _description(spec, instance)[:255],
        "amount": cost,
        "due_date": when,
        "planting_cycle": plantation,
    }
    if current:
        existing.exclude(id=current.id).delete()
        if current.status == Transaction.Status.PAID:
            values["payment_date"] = when
        changed = [field for field, value in values.items() if getattr(current, field) != value]
        if not changed:
            return "unchanged"
        for field in changed:
            setattr(current, field, values[field])
        current.save(update_fields=[*changed, "updated_at"])
        return "updated"

    Transaction.objects.create(
        organization=organization,
        reference=reference,
        status=Transaction.Status.PAID,
        payment_date=when,
        created_by=user if getattr(user, "is_authenticated", False) else None,
        **values,
    )
    return "created"


def remove_operation_transaction(instance) -> None:
    """Remove the finance mirror when its operation is deleted."""
    from apps.finance.models import Transaction

    spec = spec_for(instance)
    if spec is None:
        return
    Transaction.all_objects.filter(
        organization=instance.plantation.organization, reference=spec.reference(instance)
    ).exclude(status=Transaction.Status.CANCELLED).delete()


def resync_organization(organization, dry_run: bool = False) -> dict:
    """Realign every crop operation mirror of an organization (old records included).

    - creates missing mirrors and fixes amounts, dates and categories;
    - cancels (does not delete) mirrors whose operation no longer exists.
    """
    from apps.crops import models as crop_models
    from apps.finance.models import Transaction

    report = {"created": 0, "updated": 0, "unchanged": 0, "removed": 0, "skipped": 0, "orphans_cancelled": 0}
    if not finance_enabled(organization):
        report["disabled"] = True
        return report
    with transaction.atomic():
        for spec in SPECS:
            model = getattr(crop_models, spec.model_name)
            queryset = model.objects.filter(plantation__organization=organization).select_related(
                "plantation", "plantation__farm", "plantation__organization"
            )
            if spec.model_name == "PesticideApplication":
                queryset = queryset.prefetch_related("equipments")
            ids = set()
            for instance in queryset:
                ids.add(spec.reference(instance))
                report[sync_operation_transaction(instance)] += 1

            mirrors = Transaction.all_objects.filter(
                organization=organization, reference__startswith=f"{spec.prefix}-"
            ).exclude(status=Transaction.Status.CANCELLED)
            if spec.prefix == "LABOR":
                mirrors = mirrors.exclude(reference__startswith="LABOR-SWINE-")
            orphans = [mirror.id for mirror in mirrors.only("id", "reference") if mirror.reference not in ids]
            if orphans:
                report["orphans_cancelled"] += Transaction.objects.filter(id__in=orphans).update(
                    status=Transaction.Status.CANCELLED
                )
        if dry_run:
            transaction.set_rollback(True)
    return report
