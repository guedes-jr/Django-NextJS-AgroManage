"""Removing and re-activating a segment of the subscription without deleting the organization's data.

Rules (agreed with the product owner):

* removing a segment never deletes rows. The segment's operational data (animals, batches,
  handling, plantations, veterinary records…) is hidden from the organization and cannot be fed
  (``common.operator_access.segment_scoped_queryset`` / ``ensure_in_segment_scope``); the platform
  audit keeps seeing it. Activating the segment again shows that data again;
* the segment's finance launches are archived (``Transaction.archived_at``): they leave the
  Financeiro, the balances and every dashboard **for good** — they are not restored on
  re-activation. The client confirms this explicitly (``confirm_finance``);
* billing stops at removal: the next cycle no longer charges the segment and an issued, unpaid
  invoice of a future period is recalculated. The period already started is still charged;
* a segment never contracted before simply starts empty.
"""
from decimal import Decimal

from django.db import transaction
from django.db.models import Count, Q, Sum
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from . import segments as catalog
from .models import Invoice, InvoiceItem, Payment, SegmentStatusEvent, Subscription
from .subscriptions import _drop_member_scope, _ensure_another_active, set_segment_active

ZERO = Decimal("0.00")


def _finance_rows(organization, code):
    from apps.finance.models import Transaction

    return Transaction.objects.filter(organization=organization, segmento__in=catalog.stored_codes({code}))


def _finance_totals(rows):
    totals = rows.aggregate(
        count=Count("id"),
        revenue=Sum("amount", filter=Q(category__category_type="revenue")),
        expense=Sum("amount", filter=Q(category__category_type="expense")),
    )
    return {"count": totals["count"] or 0, "revenue": totals["revenue"] or ZERO, "expense": totals["expense"] or ZERO}


def _kept_records(organization, code):
    """Operational rows that stay (hidden while inactive, shown again on re-activation)."""
    segment = catalog.BY_CODE[code]
    if code == catalog.CROPS:
        from apps.crops.models import PlantingCycle

        return {"plantings": PlantingCycle.objects.filter(Q(organization=organization) | Q(farm__organization=organization)).count()}
    if code == catalog.VETERINARY:
        from apps.veterinary.models import VeterinaryProcedure

        return {"procedures": VeterinaryProcedure.objects.filter(organization=organization).count()}
    if segment.species:
        from apps.livestock.models import Animal, AnimalBatch
        from common.operator_access import segment_rows_q

        animals = Animal.objects.filter(farm__organization=organization).filter(segment_rows_q(Animal, {code}))
        batches = AnimalBatch.objects.filter(farm__organization=organization).filter(segment_rows_q(AnimalBatch, {code}))
        if segment.production:
            # "dual"/"unknown" cattle also belong to the other cattle segment: count only this purpose.
            animals, batches = animals.filter(cattle_purpose=segment.production), batches.filter(cattle_purpose=segment.production)
        return {"animals": animals.count(), "batches": batches.count()}
    return {}


def deactivation_impact(organization, code):
    """What the client must know before removing a segment (shown in the confirmation)."""
    totals = _finance_totals(_finance_rows(organization, code))
    return {
        "segment_code": code,
        "segment_name": catalog.BY_CODE[code].name if code in catalog.BY_CODE else code,
        "finance": {"count": totals["count"], "revenue": f"{totals['revenue']:.2f}", "expense": f"{totals['expense']:.2f}"},
        "kept": _kept_records(organization, code),
    }


def adjust_upcoming_invoice(subscription, *, today=None):
    """Recalculate an issued, unpaid invoice of a period that has not started yet.

    Returns "" (nothing to adjust), "updated", "voided", "kept_paid" or "kept_gateway" (a charge
    already sent to the payment provider: left for the platform, recorded in the event)."""
    from . import recurring

    today = today or timezone.localdate()
    preview = recurring.cycle_preview(subscription)
    if preview is None or preview["period_start"] <= today:
        return ""
    invoice = Invoice.objects.select_for_update().filter(number=preview["number"], subscription=subscription).first()
    if invoice is None or invoice.status not in {Invoice.Status.OPEN, Invoice.Status.OVERDUE}:
        return ""
    if invoice.amount_paid > 0:
        return "kept_paid"
    if invoice.payments.filter(status=Payment.Status.PENDING).exclude(provider="manual").exists():
        return "kept_gateway"
    if preview["total"] <= 0:
        invoice.status = Invoice.Status.VOID
        invoice.save(update_fields=["status", "updated_at"])
        return "voided"
    invoice.items.all().delete()
    InvoiceItem.objects.bulk_create([InvoiceItem(
        invoice=invoice, description=f"{line['name']} — {line['tier_label']}", quantity=preview["months"],
        unit_amount=Decimal(line["total"]), total=recurring.money(Decimal(line["total"]) * preview["months"]),
        period_start=preview["period_start"], period_end=preview["period_end"],
    ) for line in preview["lines"]])
    invoice.subtotal, invoice.discount_total, invoice.total = preview["subtotal"], preview["discount_total"], preview["total"]
    invoice.save(update_fields=["subtotal", "discount_total", "total", "updated_at"])
    return "updated"


@transaction.atomic
def deactivate(subscription, code, *, actor=None, confirm_finance=False, drop_member_scope=False):
    """Remove a segment from use (see module docstring). Returns the SegmentStatusEvent."""
    from apps.finance.models import Transaction
    from apps.finance.services import refresh_account_balances

    subscription = Subscription.objects.select_for_update().get(pk=subscription.pk)
    item = subscription.items.filter(segment_code=code).first()
    if item is None or not item.is_active:
        raise ValidationError({"detail": "Este segmento não está ativo."})
    _ensure_another_active(subscription, code)
    rows = _finance_rows(subscription.organization, code)
    totals = _finance_totals(rows)
    if totals["count"] and not confirm_finance:
        raise ValidationError({
            "confirm_finance_removal": "Confirme que os lançamentos financeiros deste segmento serão removidos e não poderão ser recuperados.",
            "impact": deactivation_impact(subscription.organization, code),
        })
    now = timezone.now()
    accounts = set(rows.exclude(bank_account__isnull=True).values_list("bank_account_id", flat=True))
    # update() on purpose: archiving must not run the model save rules (segment guard, balances per row).
    Transaction.objects.filter(pk__in=rows.values("pk")).update(archived_at=now, archived_segment=code, updated_at=now)
    if accounts:
        refresh_account_balances(accounts)
    set_segment_active(subscription, code, False)
    if drop_member_scope:
        _drop_member_scope(subscription.organization, code)
    adjustment = adjust_upcoming_invoice(subscription)
    return SegmentStatusEvent.objects.create(
        organization=subscription.organization, segment_code=code, action=SegmentStatusEvent.Action.DEACTIVATED, actor=actor,
        occurred_at=now, archived_transactions=totals["count"], archived_revenue=totals["revenue"], archived_expense=totals["expense"],
        invoice_adjustment=adjustment,
    )


def record_activation(subscription, code, *, actor=None):
    """History entry when a segment becomes active (new or re-activated). Its operational data,
    if any, is visible again; archived finance launches stay archived."""
    return SegmentStatusEvent.objects.create(
        organization=subscription.organization, segment_code=code, action=SegmentStatusEvent.Action.ACTIVATED, actor=actor,
    )
