"""Recurring billing: cycle invoices, period rollover, delinquency and gateway settlement.

Everything here is off until ``BILLING_AUTO_INVOICING_ENABLED`` is true; the platform starts it per
subscription with ``manage.py start_billing --date`` (sets the first period end). Rules:

* a cycle invoice is issued ``BILLING_INVOICE_LEAD_DAYS`` before ``current_period_ends_at`` and
  charges the *next* period in advance (monthly = 1 month, yearly = 12); amounts come only from
  ``pricing.breakdown`` (annual discounts are already in each item's negotiated price). Segments
  "sob consulta" are left out and keep the pendency in the dossier;
* the invoice number is derived from subscription + period start, so a cycle is never billed twice;
* when the period ends it rolls over (or the subscription is cancelled if ``cancel_at_period_end``);
* an unpaid invoice past its due date becomes overdue and the subscription ``past_due``; after
  ``BILLING_SUSPEND_AFTER_DAYS`` it is ``suspended`` (segments close, see segments.ENABLED_STATUSES).
  Settling the last overdue invoice reactivates it.
"""
import logging
from datetime import datetime, time, timedelta
from decimal import Decimal

from dateutil.relativedelta import relativedelta
from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone

from .models import Invoice, InvoiceItem, Payment, PaymentAttempt, Subscription
from .pricing import ZERO, breakdown, money

logger = logging.getLogger(__name__)

CYCLE_MONTHS = {Subscription.BillingCycle.MONTHLY: 1, Subscription.BillingCycle.YEARLY: 12}
BILLABLE = {Subscription.Status.TRIALING, Subscription.Status.ACTIVE, Subscription.Status.PAST_DUE}


def enabled():
    return bool(getattr(settings, "BILLING_AUTO_INVOICING_ENABLED", False))


def lead_days():
    return int(getattr(settings, "BILLING_INVOICE_LEAD_DAYS", 7))


def suspend_after_days():
    return int(getattr(settings, "BILLING_SUSPEND_AFTER_DAYS", 15))


def _aware(day):
    return timezone.make_aware(datetime.combine(day, time.min))


def invoice_number(subscription, period_start):
    return f"AG-{subscription.pk.hex[:10].upper()}-{period_start:%Y%m%d}"


def next_cycle(subscription):
    """(period_start, period_end_exclusive, months) of the period the next invoice charges, or None."""
    months = CYCLE_MONTHS.get(subscription.billing_cycle)
    if not months or not subscription.current_period_ends_at:
        return None
    start = timezone.localtime(subscription.current_period_ends_at).date()
    return start, start + relativedelta(months=months), months


def cycle_preview(subscription):
    """What the next cycle invoice would contain (used by the dry-run and the generator)."""
    cycle = next_cycle(subscription)
    if cycle is None:
        return None
    start, end, months = cycle
    data = breakdown(subscription, _aware(start))
    lines = [line for line in data["lines"] if Decimal(line["total"]) > 0]
    subtotal = sum((money(Decimal(line["total"]) * months) for line in lines), ZERO)
    total = money(Decimal(data["total"]) * months)
    return {
        "number": invoice_number(subscription, start), "period_start": start, "period_end": end - timedelta(days=1),
        "due_date": start, "months": months, "lines": lines, "subtotal": subtotal,
        "discount_total": max(subtotal - total, ZERO), "total": total,
        "unpriced": [line["name"] for line in data["lines"] if line["on_request"]],
    }


def issue_cycle_invoice(subscription, *, today=None):
    """Issue the next cycle invoice when inside the lead window. Returns the invoice or None."""
    today = today or timezone.localdate()
    if subscription.status not in BILLABLE or subscription.cancel_at_period_end:
        return None
    preview = cycle_preview(subscription)
    if preview is None or preview["period_start"] - timedelta(days=lead_days()) > today:
        return None
    if preview["total"] <= 0:
        return None
    existing = Invoice.objects.filter(number=preview["number"]).first()
    if existing:
        return existing
    try:
        with transaction.atomic():
            invoice = Invoice.objects.create(
                number=preview["number"], organization_id=subscription.organization_id, subscription=subscription,
                status=Invoice.Status.OPEN, subtotal=preview["subtotal"], discount_total=preview["discount_total"],
                total=preview["total"], issued_at=timezone.now(), due_date=preview["due_date"],
                notes=f"Ciclo {preview['period_start']:%d/%m/%Y} a {preview['period_end']:%d/%m/%Y}",
            )
            InvoiceItem.objects.bulk_create([InvoiceItem(
                invoice=invoice, description=f"{line['name']} — {line['tier_label']}", quantity=preview["months"],
                unit_amount=Decimal(line["total"]), total=money(Decimal(line["total"]) * preview["months"]),
                period_start=preview["period_start"], period_end=preview["period_end"],
            ) for line in preview["lines"]])
    except IntegrityError:  # Concurrent run issued the same cycle.
        return Invoice.objects.get(number=preview["number"])
    return invoice


def roll_period(subscription, *, now=None):
    """Advance an ended period (or cancel at its end). Returns True when the subscription changed."""
    now = now or timezone.now()
    if not subscription.current_period_ends_at or subscription.current_period_ends_at > now:
        return False
    if subscription.cancel_at_period_end:
        subscription.status, subscription.cancelled_at = Subscription.Status.CANCELLED, now
        subscription.save(update_fields=["status", "cancelled_at", "updated_at"])
        return True
    cycle = next_cycle(subscription)
    if cycle is None:
        return False
    # Never skip a billable cycle: roll only after its invoice exists (or nothing was due).
    preview = cycle_preview(subscription)
    if preview["total"] > 0 and not Invoice.objects.filter(number=preview["number"]).exists():
        return False
    subscription.current_period_ends_at = _aware(cycle[1])
    update = ["current_period_ends_at", "updated_at"]
    if subscription.status == Subscription.Status.TRIALING:
        subscription.status = Subscription.Status.ACTIVE
        update.append("status")
    subscription.save(update_fields=update)
    return True


def apply_delinquency(*, today=None):
    """Mark overdue invoices and move subscriptions to past_due / suspended."""
    today = today or timezone.localdate()
    from .selectors import unpaid_invoices

    overdue_invoices = lambda: unpaid_invoices().filter(due_date__lt=today)
    marked = overdue_invoices().filter(status=Invoice.Status.OPEN).update(status=Invoice.Status.OVERDUE, updated_at=timezone.now())
    changed = {"overdue_invoices": marked, "past_due": 0, "suspended": 0}
    limit = today - timedelta(days=suspend_after_days())
    for subscription in Subscription.objects.filter(status__in=[Subscription.Status.ACTIVE, Subscription.Status.TRIALING, Subscription.Status.PAST_DUE]):
        oldest = overdue_invoices().filter(subscription=subscription).order_by("due_date").values_list("due_date", flat=True).first()
        if oldest is None:
            continue
        target = Subscription.Status.SUSPENDED if oldest <= limit else Subscription.Status.PAST_DUE
        if subscription.status != target:
            subscription.status = target
            subscription.save(update_fields=["status", "updated_at"])
            changed["suspended" if target == Subscription.Status.SUSPENDED else "past_due"] += 1
    return changed


def reactivate_if_settled(subscription):
    from .selectors import overdue_invoices

    if subscription and subscription.status in {Subscription.Status.PAST_DUE, Subscription.Status.SUSPENDED} and not overdue_invoices().filter(subscription=subscription).exists():
        subscription.status = Subscription.Status.ACTIVE
        subscription.save(update_fields=["status", "updated_at"])
        return True
    return False


def settle_invoice(invoice, payment):
    """Add a confirmed payment to its invoice (caller holds the invoice lock)."""
    invoice.amount_paid += payment.amount
    if invoice.amount_paid >= invoice.total:
        invoice.status = Invoice.Status.PAID
        invoice.paid_at = max(invoice.payments.filter(status=Payment.Status.SUCCEEDED).values_list("paid_at", flat=True))
    invoice.save(update_fields=["amount_paid", "status", "paid_at", "updated_at"])
    if invoice.status == Invoice.Status.PAID:
        from apps.affiliates.services import create_commission_for_paid_invoice

        create_commission_for_paid_invoice(invoice=invoice, payment=payment)
        reactivate_if_settled(invoice.subscription)


# --- Gateway charges -------------------------------------------------------------------------

def _customer(organization):
    return {"name": organization.name, "document": organization.document, "email": organization.email, "external_reference": str(organization.pk)}


def _payment_method(gateway, chosen=""):
    """The customer's preferred method when the gateway supports it, else the configured default."""
    for preferred in (chosen, getattr(settings, "BILLING_DEFAULT_PAYMENT_METHOD", "any")):
        if preferred and preferred in gateway.supported_methods:
            return preferred
    return gateway.supported_methods[0]


def charge_invoice(invoice):
    """Create the gateway charge of an open invoice once. Returns the pending Payment or None."""
    from .gateways.base import PaymentGatewayError
    from .gateways.registry import get_default_gateway
    from .gateways.base import GatewayChargeRequest

    if invoice.status not in {Invoice.Status.OPEN, Invoice.Status.OVERDUE} or invoice.total <= invoice.amount_paid:
        return None
    existing = invoice.payments.filter(status=Payment.Status.PENDING).exclude(provider="manual").first()
    if existing:
        return existing
    try:
        gateway = get_default_gateway()
    except PaymentGatewayError:
        return None
    method = _payment_method(gateway, getattr(invoice.subscription, "preferred_payment_method", "") if invoice.subscription_id else "")
    amount = invoice.total - invoice.amount_paid
    payment = Payment.objects.create(invoice=invoice, organization_id=invoice.organization_id, amount=amount, currency=invoice.currency,
                                     status=Payment.Status.PENDING, payment_method=method, provider=gateway.provider_code)
    try:
        result = gateway.create_charge(GatewayChargeRequest(
            reference=invoice.number, idempotency_key=invoice.number, amount=amount, currency=invoice.currency,
            customer=_customer(invoice.organization), payment_method=method,
            metadata={"description": f"Fazenda+ — fatura {invoice.number}", "due_date": str(max(invoice.due_date, timezone.localdate()))},
        ))
    except PaymentGatewayError as exc:
        PaymentAttempt.objects.create(payment=payment, succeeded=False, error_message=str(exc)[:2000])
        payment.status, payment.failure_message = Payment.Status.FAILED, str(exc)[:2000]
        payment.save(update_fields=["status", "failure_message", "updated_at"])
        logger.warning("Gateway charge failed for invoice %s: %s", invoice.number, exc)
        return None
    raw = result.raw or {}
    payment.external_id = result.external_id
    payment.metadata = {
        "payment_url": raw.get("invoiceUrl") or raw.get("bankSlipUrl") or "",
        "pix_copy_paste": (raw.get("pix_qr_code") or {}).get("payload") or raw.get("pixCopiaECola") or "",
        "pix_qr_image": (raw.get("pix_qr_code") or {}).get("encodedImage") or "",
    }
    payment.save(update_fields=["external_id", "metadata", "updated_at"])
    PaymentAttempt.objects.create(payment=payment, succeeded=True, response_data={"status": result.status, "id": result.external_id})
    Invoice.objects.filter(pk=invoice.pk).update(external_id=result.external_id)
    if result.status != "pending":
        apply_gateway_status(gateway.provider_code, result.external_id, result.status)
    return payment


@transaction.atomic
def apply_gateway_status(provider, external_id, status, *, paid_at=None):
    """Idempotent update of a gateway payment from a webhook or reconciliation."""
    payment = Payment.objects.select_for_update().filter(provider=provider, external_id=external_id).first()
    if not external_id or payment is None or payment.status == status:
        return payment
    invoice = Invoice.objects.select_for_update().get(pk=payment.invoice_id)
    if status == "succeeded" and payment.status == Payment.Status.PENDING:
        if invoice.status in {Invoice.Status.PAID, Invoice.Status.VOID}:
            payment.status, payment.failure_message = Payment.Status.CANCELLED, "Fatura já quitada ou cancelada ao confirmar."
            payment.save(update_fields=["status", "failure_message", "updated_at"])
            return payment
        payment.status, payment.paid_at = Payment.Status.SUCCEEDED, paid_at or timezone.now()
        payment.save(update_fields=["status", "paid_at", "updated_at"])
        settle_invoice(invoice, payment)
    elif status == "refunded" and payment.status == Payment.Status.SUCCEEDED:
        from .services import refund_manual_payment

        refund_manual_payment(payment=payment, reason="Estorno confirmado pelo gateway.")
    elif status in {"cancelled", "failed"} and payment.status == Payment.Status.PENDING:
        payment.status = status
        payment.save(update_fields=["status", "updated_at"])
    return payment


def reconcile_pending_payments(*, older_than=timedelta(hours=1)):
    """Ask the gateway about pending charges (covers lost webhooks)."""
    from .gateways.base import PaymentGatewayError
    from .gateways.registry import gateway_registry
    from .models import PaymentGatewayConfiguration

    checked = 0
    for configuration in PaymentGatewayConfiguration.objects.filter(is_enabled=True):
        gateway = gateway_registry.create(configuration)
        pending = Payment.objects.filter(provider=configuration.provider, status=Payment.Status.PENDING, created_at__lte=timezone.now() - older_than).exclude(external_id="")
        for payment in pending[:200]:
            try:
                result = gateway.get_charge(payment.external_id)
            except PaymentGatewayError as exc:
                logger.warning("Reconciliation failed for payment %s: %s", payment.pk, exc)
                continue
            apply_gateway_status(configuration.provider, payment.external_id, result.status)
            checked += 1
    return checked


def run_cycle(*, today=None):
    """Daily job: issue invoices, charge them, roll periods and apply delinquency."""
    if not enabled():
        return {"enabled": False}
    today = today or timezone.localdate()
    result = {"enabled": True, "issued": 0, "charged": 0, "rolled": 0}
    for subscription in Subscription.objects.filter(status__in=BILLABLE, current_period_ends_at__isnull=False).select_related("organization"):
        try:
            preview = cycle_preview(subscription)
            already = preview is not None and Invoice.objects.filter(number=preview["number"]).exists()
            invoice = issue_cycle_invoice(subscription, today=today)
            if invoice is not None and not already:
                result["issued"] += 1
            if roll_period(subscription, now=_aware(today) + timedelta(hours=23, minutes=59)):
                result["rolled"] += 1
        except Exception:
            logger.exception("Recurring billing failed for subscription %s", subscription.pk)
    # Charge every unpaid invoice (cycle or manual) still without a pending gateway charge; a
    # charge that failed yesterday is retried here.
    pending = Payment.objects.filter(status=Payment.Status.PENDING).exclude(provider="manual").values("invoice_id")
    for invoice in Invoice.objects.filter(status__in=[Invoice.Status.OPEN, Invoice.Status.OVERDUE]).exclude(pk__in=pending).select_related("organization"):
        try:
            if charge_invoice(invoice):
                result["charged"] += 1
        except Exception:
            logger.exception("Gateway charge failed for invoice %s", invoice.pk)
    result.update(apply_delinquency(today=today))
    return result


def payment_options(invoice, method):
    """Payment page: make sure the invoice has a gateway charge and return how to pay it now.
    An overdue charge gets a new due date (tomorrow) so the boleto/PIX can still be paid."""
    from .gateways.base import PaymentGatewayError
    from .gateways.registry import gateway_registry
    from .models import PaymentGatewayConfiguration

    if invoice.status not in {Invoice.Status.OPEN, Invoice.Status.OVERDUE} or invoice.total <= invoice.amount_paid:
        raise PaymentGatewayError("Esta fatura não tem saldo em aberto.")
    payment = charge_invoice(invoice)
    if payment is None:
        raise PaymentGatewayError("Pagamento online indisponível no momento. Fale com o suporte.")
    configuration = PaymentGatewayConfiguration.objects.filter(provider=payment.provider, is_enabled=True).first()
    if configuration is None:
        raise PaymentGatewayError("Pagamento online indisponível no momento. Fale com o suporte.")
    tomorrow = timezone.localdate() + timedelta(days=1)
    options = gateway_registry.create(configuration).payment_options(payment.external_id, method, due_date=tomorrow)
    return {**options, "invoice_id": str(invoice.pk), "number": invoice.number, "amount": str(invoice.total - invoice.amount_paid)}
