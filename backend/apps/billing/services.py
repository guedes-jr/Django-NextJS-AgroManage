from decimal import Decimal
from uuid import uuid4

from django.db import transaction
from django.utils import timezone

from datetime import timedelta

from rest_framework.exceptions import ValidationError

from .models import Invoice, InvoiceItem, Payment, PaymentAttempt, PlanTier, SubscriptionQuote, SubscriptionQuoteItem


@transaction.atomic
def create_subscription_quote(*, tier_ids, billing_cycle):
    if billing_cycle not in SubscriptionQuote.BillingCycle.values:
        raise ValidationError({"billing_cycle": "Ciclo de cobrança inválido."})
    if not tier_ids:
        raise ValidationError({"tier_ids": "Selecione ao menos uma faixa."})

    tiers = list(PlanTier.objects.select_related("segment").filter(
        id__in=tier_ids,
        is_active=True,
        segment__is_active=True,
        segment__is_public=True,
    ))
    if len(tiers) != len(set(tier_ids)):
        raise ValidationError({"tier_ids": "Uma ou mais faixas não estão disponíveis."})
    segment_ids = [tier.segment_id for tier in tiers]
    if len(segment_ids) != len(set(segment_ids)):
        raise ValidationError({"tier_ids": "Selecione somente uma faixa por segmento."})

    subtotal = Decimal("0.00")
    discount = Decimal("0.00")
    item_values = []
    requires_contact = False
    for tier in tiers:
        requires_quote = tier.requires_quote or tier.monthly_price is None
        requires_contact = requires_contact or requires_quote
        price = tier.monthly_price
        discount_percent = tier.segment.annual_discount_percent if billing_cycle == SubscriptionQuote.BillingCycle.YEARLY else Decimal("0.00")
        item_discount = (price * discount_percent / Decimal("100")).quantize(Decimal("0.01")) if price is not None else Decimal("0.00")
        final_price = price - item_discount if price is not None else None
        subtotal += price or Decimal("0.00")
        discount += item_discount
        item_values.append((tier, discount_percent, final_price, requires_quote))

    monthly_total = subtotal - discount
    billing_total = monthly_total * (12 if billing_cycle == SubscriptionQuote.BillingCycle.YEARLY else 1)
    quote = SubscriptionQuote.objects.create(
        billing_cycle=billing_cycle,
        monthly_subtotal=subtotal,
        monthly_discount=discount,
        monthly_total=monthly_total,
        billing_total=billing_total,
        requires_contact=requires_contact,
        expires_at=timezone.now() + timedelta(days=7),
    )
    SubscriptionQuoteItem.objects.bulk_create([
        SubscriptionQuoteItem(
            quote=quote,
            tier=tier,
            segment_code=tier.segment.code,
            segment_name=tier.segment.name,
            segment_subtitle=tier.segment.subtitle,
            tier_label=tier.label,
            monthly_price=tier.monthly_price,
            discount_percent=discount_percent,
            final_monthly_price=final_price,
            requires_quote=requires_quote,
        )
        for tier, discount_percent, final_price, requires_quote in item_values
    ])
    return quote


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
