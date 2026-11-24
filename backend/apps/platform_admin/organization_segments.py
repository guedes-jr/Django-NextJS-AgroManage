"""Contract or remove product segments on an organization's subscription from the backoffice.

Segment access (for example the Área do veterinário) is granted by a ``SubscriptionItem`` with the
segment code, the same record written when the customer accepts a quote. The platform MRR still
comes from the subscription plan, so changing items here does not alter platform revenue totals.
"""
from decimal import Decimal

from django.db import transaction
from rest_framework import serializers
from rest_framework.exceptions import ValidationError

from apps.billing.models import PlanSegment, PlanTier, Subscription, SubscriptionItem
from .services import record_platform_action


class SegmentChangeSerializer(serializers.Serializer):
    segment_code = serializers.SlugField(max_length=80)
    contracted = serializers.BooleanField()
    tier = serializers.UUIDField(required=False, allow_null=True)
    final_monthly_price = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0"), required=False, allow_null=True)
    reason = serializers.CharField(max_length=500, required=False, allow_blank=True, default="")


def _money(value):
    return None if value is None else str(value)


def _item_row(item):
    return {
        "segment_code": item.segment_code, "segment_name": item.segment_name, "segment_subtitle": item.segment_subtitle,
        "tier": str(item.tier_id), "tier_label": item.tier_label,
        "monthly_price": _money(item.monthly_price), "final_monthly_price": _money(item.final_monthly_price),
    }


def segment_overview(organization):
    subscription = Subscription.objects.filter(organization=organization).first()
    items = {item.segment_code: item for item in subscription.items.all()} if subscription else {}
    segments = PlanSegment.objects.filter(is_active=True).prefetch_related("tiers").order_by("sort_order", "name")
    return {
        "subscription": {"id": str(subscription.id), "status": subscription.status, "status_display": subscription.get_status_display()} if subscription else None,
        "segments": [{
            "code": segment.code, "name": segment.name, "subtitle": segment.subtitle,
            "contracted": segment.code in items,
            "item": _item_row(items[segment.code]) if segment.code in items else None,
            "tiers": [{"id": str(tier.id), "label": tier.label, "monthly_price": _money(tier.monthly_price), "requires_quote": tier.requires_quote}
                      for tier in segment.tiers.all() if tier.is_active],
        } for segment in segments],
    }


def change_segment(*, request, organization, data):
    serializer = SegmentChangeSerializer(data=data)
    serializer.is_valid(raise_exception=True)
    values = serializer.validated_data
    with transaction.atomic():
        subscription = Subscription.objects.select_for_update().filter(organization=organization).first()
        if subscription is None:
            raise ValidationError({"detail": "A organização não possui assinatura. Crie a assinatura antes de contratar segmentos."})
        current = subscription.items.filter(segment_code=values["segment_code"]).first()
        if not values["contracted"]:
            if current is None:
                raise ValidationError({"detail": "Este segmento não está contratado."})
            if subscription.items.count() == 1:
                raise ValidationError({"detail": "A assinatura precisa manter ao menos um segmento contratado."})
            before = _item_row(current)
            current.delete()
            action, description, extra = "subscription.segment_removed", f"Segmento {before['segment_name']} removido da assinatura.", {"before": before}
        else:
            segment = PlanSegment.objects.filter(code=values["segment_code"], is_active=True).first()
            if segment is None:
                raise ValidationError({"segment_code": "Segmento inexistente ou inativo."})
            tiers = PlanTier.objects.filter(segment=segment, is_active=True)
            tier = tiers.filter(pk=values["tier"]).first() if values.get("tier") else tiers.first()
            if tier is None:
                raise ValidationError({"tier": "Selecione uma faixa ativa do segmento."})
            final_price = values.get("final_monthly_price")
            if final_price is None:
                final_price = tier.monthly_price
            before = _item_row(current) if current else None
            item = current or SubscriptionItem(subscription=subscription, segment_code=segment.code)
            item.tier = tier
            item.segment_name = segment.name
            item.segment_subtitle = segment.subtitle
            item.tier_label = tier.label
            item.monthly_price = tier.monthly_price
            item.final_monthly_price = final_price
            item.discount_percent = Decimal("0")
            if tier.monthly_price and final_price is not None and final_price < tier.monthly_price:
                item.discount_percent = ((tier.monthly_price - final_price) / tier.monthly_price * 100).quantize(Decimal("0.01"))
            item.save()
            action = "subscription.segment_updated" if current else "subscription.segment_added"
            description = f"Segmento {segment.name} {'atualizado na' if current else 'contratado na'} assinatura."
            extra = {"before": before, "after": _item_row(item)}
        record_platform_action(
            request=request, action=action, organization=organization, object_type="Subscription",
            object_id=subscription.id, description=description, extra_data={**extra, "reason": values["reason"]},
        )
    return segment_overview(organization)
