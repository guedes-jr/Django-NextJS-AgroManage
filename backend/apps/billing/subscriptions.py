"""Write operations on a subscription's segments and discounts (platform and client flows)."""
from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from . import segments as catalog
from .models import Coupon, DiscountKind, PlanSegment, PlanTier, Subscription, SubscriptionDiscount, SubscriptionItem

MONTH = timedelta(days=30)


def _months_end(start, months):
    return start + MONTH * months if months else None


def validate_discount(kind, value):
    value = Decimal(value or 0)
    if kind not in DiscountKind.values:
        raise ValidationError({"kind": "Tipo de desconto inválido."})
    if value < 0:
        raise ValidationError({"value": "O valor não pode ser negativo."})
    if kind == DiscountKind.PERCENTAGE and not Decimal("0") < value <= Decimal("100"):
        raise ValidationError({"value": "Informe um percentual entre 0 e 100."})
    if kind == DiscountKind.FIXED_AMOUNT and value <= 0:
        raise ValidationError({"value": "Informe o valor do desconto."})
    return Decimal("0") if kind == DiscountKind.EXEMPTION else value


def _tier_for(segment, tier_id=None, quantity=None):
    tiers = PlanTier.objects.filter(segment=segment, is_active=True).order_by("sort_order", "minimum_quantity")
    if tier_id:
        tier = tiers.filter(pk=tier_id).first()
        if tier is None:
            raise ValidationError({"tier": "Selecione uma faixa ativa do segmento."})
        return tier
    if quantity is not None:
        for tier in tiers:
            if (tier.minimum_quantity is None or quantity >= tier.minimum_quantity) and (tier.maximum_quantity is None or quantity <= tier.maximum_quantity):
                return tier
    tier = tiers.first()
    if tier is None:
        raise ValidationError({"tier": f"O segmento {segment.name} não tem faixa ativa."})
    return tier


def upsert_segment(subscription, code, *, tier_id=None, final_monthly_price=None, quantity=None):
    """Contract (or re-price) one segment. Returns (item, previous snapshot or None)."""
    segment = PlanSegment.objects.filter(code=code, is_active=True).first()
    if segment is None or code not in catalog.ALL_SEGMENTS:
        raise ValidationError({"segment_code": "Segmento inexistente ou inativo."})
    tier = _tier_for(segment, tier_id, quantity)
    item = subscription.items.filter(segment_code=code).first()
    previous = item_snapshot(item) if item else None
    item = item or SubscriptionItem(subscription=subscription, segment_code=code)
    annual = segment.annual_discount_percent if subscription.billing_cycle == Subscription.BillingCycle.YEARLY else Decimal("0")
    list_price = tier.monthly_price
    item.tier = tier
    item.segment_name = segment.name
    item.segment_subtitle = segment.subtitle
    item.tier_label = tier.label
    item.monthly_price = list_price
    if final_monthly_price is not None:
        item.final_monthly_price = Decimal(final_monthly_price)
        item.discount_percent = Decimal("0")
    else:
        item.discount_percent = annual
        item.final_monthly_price = None if list_price is None else (list_price - list_price * annual / Decimal("100")).quantize(Decimal("0.01"))
    item.save()
    catalog.forget(subscription.organization)
    return item, previous


def remove_segment(subscription, code):
    item = subscription.items.filter(segment_code=code).first()
    if item is None:
        raise ValidationError({"detail": "Este segmento não está contratado."})
    if subscription.items.count() <= 1:
        raise ValidationError({"detail": "A organização precisa manter ao menos um segmento contratado."})
    snapshot = item_snapshot(item)
    item.delete()
    catalog.forget(subscription.organization)
    _drop_member_scope(subscription.organization, code)
    return snapshot


def _drop_member_scope(organization, code):
    """Members lose a segment the organization no longer has."""
    from django.contrib.auth import get_user_model

    users = get_user_model().objects.filter(organization=organization)
    if code == catalog.CROPS:
        users.filter(can_operate_crops=True).update(can_operate_crops=False)
    elif code in catalog.LIVESTOCK_SEGMENTS:
        for user in users.filter(allowed_livestock__code=code).distinct():
            user.allowed_livestock.remove(*user.allowed_livestock.filter(code=code))


def item_snapshot(item):
    return {
        "segment_code": item.segment_code, "segment_name": item.segment_name, "tier": str(item.tier_id), "tier_label": item.tier_label,
        "monthly_price": None if item.monthly_price is None else str(item.monthly_price),
        "final_monthly_price": None if item.final_monthly_price is None else str(item.final_monthly_price),
    }


def provision_segments(subscription, codes):
    """Contract the given segments (at least one) on a new subscription."""
    codes = [code for code in dict.fromkeys(codes or []) if code in catalog.ALL_SEGMENTS]
    if not codes:
        raise ValidationError({"segments": "Selecione ao menos um segmento."})
    for code in codes:
        upsert_segment(subscription, code)


def add_discount(subscription, *, kind, value=0, description, source=SubscriptionDiscount.Source.MANUAL, segment_code="",
                 starts_at=None, ends_at=None, months=None, cumulative=True, coupon=None, affiliate=None, actor=None):
    value = validate_discount(kind, value)
    if segment_code and segment_code not in catalog.ALL_SEGMENTS:
        raise ValidationError({"segment_code": "Segmento inválido."})
    if not (description or "").strip():
        raise ValidationError({"description": "Descreva o motivo do desconto."})
    starts_at = starts_at or timezone.now()
    ends_at = ends_at or _months_end(starts_at, months)
    if ends_at and ends_at <= starts_at:
        raise ValidationError({"ends_at": "O fim precisa ser depois do início."})
    return SubscriptionDiscount.objects.create(
        subscription=subscription, source=source, kind=kind, value=value, segment_code=segment_code or "",
        description=description.strip()[:255], starts_at=starts_at, ends_at=ends_at, cumulative=cumulative,
        coupon=coupon, affiliate=affiliate, created_by=actor,
    )


def revoke_discount(discount):
    if discount.revoked_at is None:
        discount.revoked_at = timezone.now()
        discount.save(update_fields=["revoked_at", "updated_at"])
    return discount


@transaction.atomic
def redeem_coupon(subscription, code, *, actor=None):
    coupon = Coupon.objects.select_for_update().filter(code=(code or "").strip().upper()).first()
    now = timezone.now()
    if coupon is None or not coupon.is_active or (coupon.valid_from and coupon.valid_from > now) or (coupon.valid_until and coupon.valid_until <= now):
        raise ValidationError({"coupon": "Cupom inválido ou expirado."})
    if coupon.max_redemptions is not None and coupon.discounts.count() >= coupon.max_redemptions:
        raise ValidationError({"coupon": "Este cupom atingiu o limite de usos."})
    if coupon.discounts.filter(subscription=subscription).exists():
        raise ValidationError({"coupon": "Este cupom já foi usado por esta organização."})
    if coupon.first_contract_only and SubscriptionDiscount.objects.filter(subscription=subscription, source=SubscriptionDiscount.Source.COUPON).exists():
        raise ValidationError({"coupon": "Cupom válido apenas na primeira contratação."})
    if coupon.segment_code and not subscription.items.filter(segment_code=coupon.segment_code).exists():
        raise ValidationError({"coupon": "O cupom vale para um segmento que não está contratado."})
    return add_discount(
        subscription, kind=coupon.kind, value=coupon.value, description=f"Cupom {coupon.code}" + (f" — {coupon.description}" if coupon.description else ""),
        source=SubscriptionDiscount.Source.COUPON, segment_code=coupon.segment_code, months=coupon.duration_months,
        cumulative=coupon.cumulative, coupon=coupon, actor=actor,
    )


def grant_referral_discount(*, organization, affiliate):
    """Customer discount configured on the affiliate, once per organization."""
    subscription = Subscription.objects.filter(organization=organization).first()
    if subscription is None or not affiliate.customer_discount_kind:
        return None
    if subscription.discounts.filter(source=SubscriptionDiscount.Source.REFERRAL).exists():
        return None
    return add_discount(
        subscription, kind=affiliate.customer_discount_kind, value=affiliate.customer_discount_value,
        description=f"Indicação de {affiliate.user.full_name or affiliate.code}", source=SubscriptionDiscount.Source.REFERRAL,
        months=affiliate.customer_discount_months, affiliate=affiliate,
    )


def discount_row(discount, moment=None):
    return {
        "id": str(discount.id), "source": discount.source, "source_display": discount.get_source_display(),
        "kind": discount.kind, "kind_display": discount.get_kind_display(), "value": str(discount.value),
        "segment_code": discount.segment_code, "description": discount.description,
        "starts_at": discount.starts_at, "ends_at": discount.ends_at, "cumulative": discount.cumulative,
        "coupon_code": discount.coupon.code if discount.coupon_id else None,
        "revoked_at": discount.revoked_at, "is_active": discount.is_active_at(moment),
        "created_by_name": discount.created_by.full_name if discount.created_by_id else None,
        "created_at": discount.created_at,
    }
