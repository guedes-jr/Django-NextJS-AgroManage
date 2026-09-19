from rest_framework import serializers

from .models import Plan, PlanSegment, PlanTier, SubscriptionQuote, SubscriptionQuoteItem


class PublicPlanSerializer(serializers.ModelSerializer):
    class Meta:
        model = Plan
        fields = (
            "id",
            "code",
            "name",
            "description",
            "monthly_price",
            "yearly_price",
            "trial_days",
            "max_users",
            "max_farms",
            "max_storage_mb",
            "max_reports_per_month",
        )
        read_only_fields = fields


class PublicPlanTierSerializer(serializers.ModelSerializer):
    class Meta:
        model = PlanTier
        fields = ("id", "label", "minimum_quantity", "maximum_quantity", "monthly_price", "requires_quote")
        read_only_fields = fields


class PublicPlanSegmentSerializer(serializers.ModelSerializer):
    tiers = PublicPlanTierSerializer(many=True, read_only=True)

    class Meta:
        model = PlanSegment
        fields = (
            "id", "code", "name", "subtitle", "description", "image_path", "icon",
            "accent", "metric_label", "annual_discount_percent", "tiers",
        )
        read_only_fields = fields


class SubscriptionQuoteInputSerializer(serializers.Serializer):
    tier_ids = serializers.ListField(child=serializers.UUIDField(), min_length=1, max_length=20)
    billing_cycle = serializers.ChoiceField(choices=SubscriptionQuote.BillingCycle.choices)


class PublicSubscriptionQuoteItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = SubscriptionQuoteItem
        fields = (
            "segment_code", "segment_name", "segment_subtitle", "tier_label", "monthly_price",
            "discount_percent", "final_monthly_price", "requires_quote",
        )
        read_only_fields = fields


class PublicSubscriptionQuoteSerializer(serializers.ModelSerializer):
    items = PublicSubscriptionQuoteItemSerializer(many=True, read_only=True)

    class Meta:
        model = SubscriptionQuote
        fields = (
            "public_token", "status", "billing_cycle", "currency", "monthly_subtotal",
            "monthly_discount", "monthly_total", "billing_total", "requires_contact",
            "expires_at", "items",
        )
        read_only_fields = fields
