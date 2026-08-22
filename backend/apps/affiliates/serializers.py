from rest_framework import serializers

from .models import AffiliateProfile, Commission, ReferralAttribution


class ReferralTrackingSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=24, trim_whitespace=True)
    visitor_id = serializers.UUIDField()
    landing_path = serializers.CharField(max_length=500, required=False, allow_blank=True)
    referrer = serializers.URLField(max_length=1000, required=False, allow_blank=True)
    utm_source = serializers.CharField(max_length=120, required=False, allow_blank=True)
    utm_medium = serializers.CharField(max_length=120, required=False, allow_blank=True)
    utm_campaign = serializers.CharField(max_length=120, required=False, allow_blank=True)

    def validate_code(self, value):
        return value.upper()


class AffiliateProfileSerializer(serializers.ModelSerializer):
    commission_type_display = serializers.CharField(
        source="get_commission_type_display", read_only=True
    )
    referral_path = serializers.SerializerMethodField()

    class Meta:
        model = AffiliateProfile
        fields = (
            "code",
            "status",
            "commission_type",
            "commission_type_display",
            "commission_value",
            "currency",
            "referral_path",
            "activated_at",
        )

    def get_referral_path(self, affiliate):
        return f"/cadastro?ref={affiliate.code}"


def _customer_label(attribution):
    if not attribution.user_id:
        return "Visitante não cadastrado"
    name = (attribution.user.full_name or "Cliente").strip().split()
    if len(name) == 1:
        return name[0]
    return f"{name[0]} {name[-1][0]}."


class AffiliateReferralSerializer(serializers.ModelSerializer):
    customer = serializers.SerializerMethodField()
    plan = serializers.SerializerMethodField()
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = ReferralAttribution
        fields = (
            "id",
            "customer",
            "plan",
            "status",
            "status_display",
            "attributed_at",
            "registered_at",
            "converted_at",
        )

    def get_customer(self, attribution):
        return _customer_label(attribution)

    def get_plan(self, attribution):
        subscription = getattr(attribution.organization, "subscription", None)
        return subscription.plan.name if subscription else "—"


class AffiliateCommissionSerializer(serializers.ModelSerializer):
    customer = serializers.SerializerMethodField()
    organization = serializers.CharField(source="organization.name", read_only=True)
    plan = serializers.CharField(source="plan.name", read_only=True)
    invoice = serializers.CharField(source="invoice.number", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    reversed_amount = serializers.SerializerMethodField()

    class Meta:
        model = Commission
        fields = (
            "id",
            "customer",
            "organization",
            "plan",
            "invoice",
            "transaction_amount",
            "commission_type_snapshot",
            "commission_rate_snapshot",
            "commission_amount",
            "currency",
            "conversion_at",
            "status",
            "status_display",
            "reversed_amount",
        )

    def get_customer(self, commission):
        return _customer_label(commission.attribution)

    def get_reversed_amount(self, commission):
        return sum((adjustment.amount for adjustment in commission.adjustments.all()), 0)
