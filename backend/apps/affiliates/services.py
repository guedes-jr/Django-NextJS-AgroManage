from decimal import Decimal, ROUND_HALF_UP

from django.conf import settings
from django.core import signing
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone

from .models import (
    AffiliateProfile,
    Commission,
    CommissionStatusHistory,
    ReferralAttribution,
    ReferralVisit,
)

MONEY_QUANTUM = Decimal("0.01")
ATTRIBUTION_TOKEN_SALT = "affiliates.referral-attribution"


def issue_attribution_token(attribution):
    return signing.dumps(
        {
            "attribution_id": str(attribution.pk),
            "visitor_id": str(attribution.visitor_id),
        },
        salt=ATTRIBUTION_TOKEN_SALT,
        compress=True,
    )


def resolve_attribution_token(token):
    if not token:
        return None
    max_age = settings.AFFILIATE_ATTRIBUTION_MAX_AGE_SECONDS
    try:
        payload = signing.loads(token, salt=ATTRIBUTION_TOKEN_SALT, max_age=max_age)
        return ReferralAttribution.objects.select_related("affiliate").get(
            pk=payload["attribution_id"],
            visitor_id=payload["visitor_id"],
            status=ReferralAttribution.Status.VISITED,
            user__isnull=True,
            organization__isnull=True,
        )
    except (KeyError, signing.BadSignature, ReferralAttribution.DoesNotExist):
        return None


@transaction.atomic
def bind_attribution_to_customer(*, token, user, organization):
    attribution = resolve_attribution_token(token)
    if not attribution or attribution.affiliate.user_id == user.pk:
        return None

    attribution = ReferralAttribution.objects.select_for_update().filter(
        pk=attribution.pk,
        status=ReferralAttribution.Status.VISITED,
        user__isnull=True,
        organization__isnull=True,
    ).first()
    if not attribution:
        return None

    existing_customer_attribution = ReferralAttribution.objects.filter(
        Q(user=user) | Q(organization=organization)
    ).exclude(pk=attribution.pk).exists()
    if existing_customer_attribution:
        return None

    now = timezone.now()
    attribution.user = user
    attribution.organization = organization
    attribution.status = ReferralAttribution.Status.REGISTERED
    attribution.registered_at = now
    attribution.save(
        update_fields=["user", "organization", "status", "registered_at", "updated_at"]
    )
    return attribution


@transaction.atomic
def set_affiliate_status(*, affiliate, status):
    affiliate = AffiliateProfile.objects.select_for_update().get(pk=affiliate.pk)
    now = timezone.now()
    if status == AffiliateProfile.Status.ACTIVE:
        affiliate.status = status
        affiliate.activated_at = now
        affiliate.deactivated_at = None
    elif status == AffiliateProfile.Status.INACTIVE:
        affiliate.status = status
        affiliate.deactivated_at = now
    else:
        raise ValidationError("Status de afiliado inválido.")
    affiliate.save(
        update_fields=["status", "activated_at", "deactivated_at", "updated_at"]
    )
    return affiliate


def calculate_commission_amount(*, transaction_amount, commission_type, commission_value):
    transaction_amount = Decimal(transaction_amount)
    commission_value = Decimal(commission_value)
    if transaction_amount < 0 or commission_value < 0:
        raise ValidationError("Valores de contratação e comissão não podem ser negativos.")

    if commission_type == AffiliateProfile.CommissionType.PERCENTAGE:
        if commission_value > Decimal("100"):
            raise ValidationError("A comissão percentual não pode ser maior que 100%.")
        amount = transaction_amount * commission_value / Decimal("100")
    elif commission_type == AffiliateProfile.CommissionType.FIXED_AMOUNT:
        amount = min(transaction_amount, commission_value)
    else:
        raise ValidationError("Tipo de comissão inválido.")

    return amount.quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP)


@transaction.atomic
def create_commission_for_paid_invoice(*, invoice, payment=None):
    from apps.billing.models import Invoice

    invoice = Invoice.objects.select_for_update().select_related(
        "organization",
        "subscription__plan",
    ).get(pk=invoice.pk)
    existing = Commission.objects.filter(invoice=invoice).first()
    if existing:
        return existing, False

    plan = invoice.subscription.plan
    transaction_amount = Decimal(invoice.total)
    is_paid_plan = Decimal(plan.monthly_price) > 0 or Decimal(plan.yearly_price) > 0
    if (
        invoice.status != Invoice.Status.PAID
        or Decimal(invoice.amount_paid) < transaction_amount
        or transaction_amount <= 0
        or not is_paid_plan
    ):
        return None, False

    attribution = ReferralAttribution.objects.select_for_update().select_related(
        "affiliate",
        "user",
    ).filter(
        organization=invoice.organization,
        status__in=(
            ReferralAttribution.Status.REGISTERED,
            ReferralAttribution.Status.CONVERTED,
        ),
        user__isnull=False,
    ).first()
    if not attribution:
        return None, False

    affiliate = attribution.affiliate
    paid_commissions_count = Commission.objects.filter(
        organization=invoice.organization,
        affiliate=affiliate,
    ).exclude(status=Commission.Status.CANCELLED).count()
    commission_limit = {
        AffiliateProfile.CommissionDuration.FIRST_PAYMENT: 1,
        AffiliateProfile.CommissionDuration.FIRST_THREE_PAYMENTS: 3,
        AffiliateProfile.CommissionDuration.PERMANENT: None,
    }[affiliate.commission_duration]
    if commission_limit is not None and paid_commissions_count >= commission_limit:
        return None, False

    commission_amount = calculate_commission_amount(
        transaction_amount=transaction_amount,
        commission_type=affiliate.commission_type,
        commission_value=affiliate.commission_value,
    )
    conversion_at = invoice.paid_at or timezone.now()
    try:
        with transaction.atomic():
            commission = Commission.objects.create(
                affiliate=affiliate,
                attribution=attribution,
                customer_user=attribution.user,
                organization=invoice.organization,
                subscription=invoice.subscription,
                plan=plan,
                invoice=invoice,
                payment=payment,
                transaction_amount=transaction_amount,
                currency=invoice.currency,
                commission_type_snapshot=affiliate.commission_type,
                commission_rate_snapshot=affiliate.commission_value,
                commission_duration_snapshot=affiliate.commission_duration,
                commission_amount=commission_amount,
                conversion_at=conversion_at,
            )
            CommissionStatusHistory.objects.create(
                commission=commission,
                previous_status="",
                new_status=Commission.Status.PENDING,
                reason="Comissão gerada automaticamente após confirmação do pagamento.",
            )
    except IntegrityError:
        existing = Commission.objects.filter(invoice=invoice).first()
        return existing, False

    attribution.status = ReferralAttribution.Status.CONVERTED
    attribution.converted_at = conversion_at
    attribution.save(update_fields=["status", "converted_at", "updated_at"])
    return commission, True


@transaction.atomic
def record_first_touch(*, affiliate, visitor_id, occurred_at=None, **visit_data):
    affiliate = AffiliateProfile.objects.get(pk=affiliate.pk)
    if affiliate.status != AffiliateProfile.Status.ACTIVE:
        raise ValidationError("O afiliado está inativo.")

    occurred_at = occurred_at or timezone.now()
    visit = ReferralVisit.objects.create(
        affiliate=affiliate,
        visitor_id=visitor_id,
        occurred_at=occurred_at,
        **visit_data,
    )
    attribution = ReferralAttribution.objects.filter(
        visitor_id=visitor_id
    ).exclude(status=ReferralAttribution.Status.INVALIDATED).first()
    if attribution:
        return visit, attribution, False

    try:
        with transaction.atomic():
            attribution = ReferralAttribution.objects.create(
                affiliate=affiliate,
                visitor_id=visitor_id,
                first_visit=visit,
                attributed_at=occurred_at,
            )
        return visit, attribution, True
    except IntegrityError:
        attribution = ReferralAttribution.objects.get(
            visitor_id=visitor_id
        )
        return visit, attribution, False


@transaction.atomic
def transition_commission_status(*, commission, new_status, actor=None, reason="", metadata=None):
    allowed_transitions = {
        Commission.Status.PENDING: {Commission.Status.APPROVED, Commission.Status.CANCELLED},
        Commission.Status.APPROVED: {Commission.Status.PAID, Commission.Status.CANCELLED},
        Commission.Status.PAID: set(),
        Commission.Status.CANCELLED: set(),
    }
    commission = Commission.objects.select_for_update().get(pk=commission.pk)
    previous_status = commission.status
    if new_status not in allowed_transitions[previous_status]:
        raise ValidationError(
            f"Transição de {previous_status} para {new_status} não permitida."
        )

    now = timezone.now()
    commission.status = new_status
    commission.status_reason = reason
    update_fields = ["status", "status_reason", "updated_at"]
    if new_status == Commission.Status.APPROVED:
        commission.approved_at = now
        commission.approved_by = actor
        update_fields.extend(["approved_at", "approved_by"])
    elif new_status == Commission.Status.PAID:
        commission.paid_at = now
        commission.paid_by = actor
        update_fields.extend(["paid_at", "paid_by"])
    elif new_status == Commission.Status.CANCELLED:
        commission.cancelled_at = now
        commission.cancelled_by = actor
        update_fields.extend(["cancelled_at", "cancelled_by"])
    commission.save(update_fields=update_fields)
    CommissionStatusHistory.objects.create(
        commission=commission,
        previous_status=previous_status,
        new_status=new_status,
        changed_by=actor,
        reason=reason,
        metadata=metadata or {},
    )
    return commission
