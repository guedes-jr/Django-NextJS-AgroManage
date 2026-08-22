from decimal import Decimal
from uuid import uuid4

from django.db import transaction
from django.utils import timezone

from .models import Invoice, InvoiceItem, Payment, PaymentAttempt


@transaction.atomic
def create_manual_invoice(*, organization, due_date, description, amount, notes=""):
    subscription = organization.subscription
    amount = Decimal(amount)
    discount_total = subscription.calculate_discount(amount)
    total = amount - discount_total
    number = f"AG-{timezone.now():%Y%m%d}-{uuid4().hex[:8].upper()}"
    invoice = Invoice.objects.create(
        number=number,
        organization=organization,
        subscription=subscription,
        status=Invoice.Status.OPEN,
        subtotal=amount,
        discount_total=discount_total,
        total=total,
        issued_at=timezone.now(),
        due_date=due_date,
        notes=notes,
    )
    InvoiceItem.objects.create(
        invoice=invoice,
        description=description,
        quantity=1,
        unit_amount=amount,
        total=amount,
    )
    return invoice


@transaction.atomic
def record_manual_payment(*, invoice, amount, payment_method="manual", external_id=""):
    invoice = Invoice.objects.select_for_update().get(pk=invoice.pk)
    remaining = invoice.total - invoice.amount_paid
    amount = min(Decimal(amount), remaining)
    payment = Payment.objects.create(
        invoice=invoice,
        organization=invoice.organization,
        amount=amount,
        status=Payment.Status.SUCCEEDED,
        payment_method=payment_method,
        provider="manual",
        external_id=external_id,
        paid_at=timezone.now(),
    )
    PaymentAttempt.objects.create(payment=payment, succeeded=True)
    invoice.amount_paid += amount
    if invoice.amount_paid >= invoice.total:
        invoice.status = Invoice.Status.PAID
        invoice.paid_at = timezone.now()
    invoice.save(update_fields=["amount_paid", "status", "paid_at", "updated_at"])
    if invoice.status == Invoice.Status.PAID:
        from apps.affiliates.services import create_commission_for_paid_invoice

        create_commission_for_paid_invoice(invoice=invoice, payment=payment)
    return payment


@transaction.atomic
def refund_manual_payment(*, payment, actor=None, reason=""):
    if not reason.strip():
        raise ValueError("O motivo do reembolso é obrigatório.")
    payment = Payment.objects.select_for_update().select_related("invoice").get(pk=payment.pk)
    if payment.status == Payment.Status.REFUNDED:
        return payment
    if payment.status != Payment.Status.SUCCEEDED:
        raise ValueError("Somente pagamentos confirmados podem ser reembolsados.")

    invoice = Invoice.objects.select_for_update().get(pk=payment.invoice_id)
    payment.status = Payment.Status.REFUNDED
    payment.save(update_fields=["status", "updated_at"])
    invoice.amount_paid = max(invoice.amount_paid - payment.amount, Decimal("0.00"))
    if invoice.amount_paid < invoice.total:
        invoice.status = Invoice.Status.OPEN
        invoice.paid_at = None
    invoice.save(update_fields=["amount_paid", "status", "paid_at", "updated_at"])

    from apps.affiliates.models import Commission, CommissionAdjustment
    from apps.affiliates.services import transition_commission_status

    commission = Commission.objects.filter(invoice=invoice).first()
    if commission and commission.status in {Commission.Status.PENDING, Commission.Status.APPROVED}:
        transition_commission_status(
            commission=commission,
            new_status=Commission.Status.CANCELLED,
            actor=actor,
            reason=reason,
            metadata={"payment_id": str(payment.pk), "event": "payment_refunded"},
        )
    elif commission and commission.status == Commission.Status.PAID:
        CommissionAdjustment.objects.get_or_create(
            payment=payment,
            defaults={
                "commission": commission,
                "amount": commission.commission_amount,
                "reason": reason,
                "created_by": actor,
            },
        )
    return payment
