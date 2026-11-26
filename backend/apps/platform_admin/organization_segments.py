"""Backoffice view of an organization's contracted segments, discounts and final price.

Writes go through ``apps.billing.subscriptions`` and the price through ``apps.billing.pricing``
(the same path used by the client area, invoices and revenue totals).
"""
from decimal import Decimal

from django.db import transaction
from rest_framework import serializers
from rest_framework.exceptions import NotFound, ValidationError

from apps.billing import segments as catalog
from apps.billing.models import DiscountKind, PlanSegment, Subscription, SubscriptionDiscount
from apps.billing.pricing import breakdown
from apps.billing.subscriptions import add_discount, discount_row, item_snapshot, remove_segment, revoke_discount, set_segment_active, upsert_segment
from .services import record_platform_action


class SegmentChangeSerializer(serializers.Serializer):
    segment_code = serializers.ChoiceField(choices=catalog.ALL_SEGMENTS)
    contracted = serializers.BooleanField()
    # Only toggles an existing item: inactive = hidden and not charged, kept for reactivation.
    active = serializers.BooleanField(required=False, allow_null=True, default=None)
    tier = serializers.UUIDField(required=False, allow_null=True)
    quantity = serializers.IntegerField(required=False, allow_null=True, min_value=0)
    final_monthly_price = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0"), required=False, allow_null=True)
    reason = serializers.CharField(max_length=500, required=False, allow_blank=True, default="")


class DiscountCreateSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=DiscountKind.choices)
    value = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0"), required=False, default=Decimal("0"))
    segment_code = serializers.ChoiceField(choices=("", *catalog.ALL_SEGMENTS), required=False, default="")
    description = serializers.CharField(max_length=255)
    source = serializers.ChoiceField(choices=(SubscriptionDiscount.Source.MANUAL, SubscriptionDiscount.Source.CAMPAIGN), default=SubscriptionDiscount.Source.MANUAL)
    starts_at = serializers.DateTimeField(required=False, allow_null=True)
    ends_at = serializers.DateTimeField(required=False, allow_null=True)
    months = serializers.IntegerField(required=False, allow_null=True, min_value=1, max_value=120)


def _subscription(organization, lock=False):
    queryset = Subscription.objects.select_for_update() if lock else Subscription.objects
    subscription = queryset.filter(organization=organization).first()
    if subscription is None:
        raise ValidationError({"detail": "A organização não possui assinatura."})
    return subscription


def segment_overview(organization):
    subscription = Subscription.objects.filter(organization=organization).prefetch_related("items", "discounts").first()
    items = {item.segment_code: item for item in subscription.items.all()} if subscription else {}
    segments = PlanSegment.objects.filter(code__in=catalog.ALL_SEGMENTS, is_active=True).prefetch_related("tiers").order_by("sort_order", "name")
    return {
        "subscription": {"id": str(subscription.id), "status": subscription.status, "status_display": subscription.get_status_display()} if subscription else None,
        "price": breakdown(subscription) if subscription else None,
        "segments": [{
            "code": segment.code, "name": segment.name, "subtitle": segment.subtitle, "metric_label": segment.metric_label,
            "contracted": segment.code in items,
            "active": segment.code in items and items[segment.code].is_active,
            "item": item_snapshot(items[segment.code]) if segment.code in items else None,
            "tiers": [{
                "id": str(tier.id), "label": tier.label, "minimum_quantity": tier.minimum_quantity, "maximum_quantity": tier.maximum_quantity,
                "monthly_price": None if tier.monthly_price is None else str(tier.monthly_price), "requires_quote": tier.requires_quote,
            } for tier in segment.tiers.all() if tier.is_active],
        } for segment in segments],
    }


def change_segment(*, request, organization, data):
    serializer = SegmentChangeSerializer(data=data)
    serializer.is_valid(raise_exception=True)
    values = serializer.validated_data
    with transaction.atomic():
        subscription = _subscription(organization, lock=True)
        code = values["segment_code"]
        if values["contracted"] and values.get("active") is not None:
            item = set_segment_active(subscription, code, values["active"])
            action = "subscription.segment_reactivated" if values["active"] else "subscription.segment_deactivated"
            description = f"Segmento {item.segment_name} {'reativado' if values['active'] else 'inativado'}."
            extra = {"after": item_snapshot(item)}
        elif values["contracted"]:
            item, before = upsert_segment(subscription, code, tier_id=values.get("tier"), quantity=values.get("quantity"), final_monthly_price=values.get("final_monthly_price"))
            action = "subscription.segment_updated" if before else "subscription.segment_added"
            description = f"Segmento {item.segment_name} {'atualizado na' if before else 'contratado na'} assinatura."
            extra = {"before": before, "after": item_snapshot(item)}
        else:
            before = remove_segment(subscription, code)
            action, description, extra = "subscription.segment_removed", f"Segmento {before['segment_name']} removido da assinatura.", {"before": before}
        record_platform_action(
            request=request, action=action, organization=organization, object_type="Subscription",
            object_id=subscription.id, description=description, extra_data={**extra, "reason": values["reason"]},
        )
    return segment_overview(organization)


def discount_overview(organization):
    subscription = Subscription.objects.filter(organization=organization).prefetch_related("items", "discounts__coupon", "discounts__created_by").first()
    if subscription is None:
        return {"subscription": None, "price": None, "discounts": []}
    return {
        "subscription": {"id": str(subscription.id), "status": subscription.status, "status_display": subscription.get_status_display()},
        "price": breakdown(subscription),
        "discounts": [discount_row(row) for row in subscription.discounts.all().order_by("-created_at")],
    }


def create_discount(*, request, organization, data):
    serializer = DiscountCreateSerializer(data=data)
    serializer.is_valid(raise_exception=True)
    values = serializer.validated_data
    with transaction.atomic():
        subscription = _subscription(organization, lock=True)
        if values["segment_code"] and not subscription.items.filter(segment_code=values["segment_code"]).exists():
            raise ValidationError({"segment_code": "Este segmento não está contratado."})
        discount = add_discount(subscription, actor=request.user, **values)
        record_platform_action(
            request=request, action="subscription.discount_added", organization=organization, object_type="SubscriptionDiscount",
            object_id=discount.id, description=f"Desconto adicionado: {discount.description}.",
            extra_data={"kind": discount.kind, "value": str(discount.value), "segment_code": discount.segment_code, "ends_at": discount.ends_at.isoformat() if discount.ends_at else None},
        )
    return discount_overview(organization)


def revoke(*, request, organization, discount_id):
    with transaction.atomic():
        subscription = _subscription(organization, lock=True)
        discount = subscription.discounts.filter(pk=discount_id).first()
        if discount is None:
            raise NotFound("Desconto não encontrado.")
        revoke_discount(discount)
        record_platform_action(
            request=request, action="subscription.discount_revoked", organization=organization, object_type="SubscriptionDiscount",
            object_id=discount.id, description=f"Desconto encerrado: {discount.description}.",
        )
    return discount_overview(organization)
