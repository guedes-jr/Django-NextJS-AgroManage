from decimal import Decimal
from uuid import uuid4

from django.db import transaction
from django.utils import timezone

from .models import Invoice, InvoiceItem, Payment, PaymentAttempt


@transaction.atomic
def create_manual_invoice(*, organization, due_date, description, amount, notes=""):
    subscription = organization.subscription
    number = f"AG-{timezone.now():%Y%m%d}-{uuid4().hex[:8].upper()}"
    invoice = Invoice.objects.create(
        number=number,
        organization=organization,
        subscription=subscription,
        status=Invoice.Status.OPEN,
        subtotal=amount,
        total=amount,
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
    return payment
