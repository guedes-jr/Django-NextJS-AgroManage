from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import serializers

from .models import AffiliateProfile, Commission, ReferralAttribution

User = get_user_model()


def validate_commission_rule(attrs, instance=None):
    commission_type = attrs.get(
        "commission_type",
        getattr(instance, "commission_type", AffiliateProfile.CommissionType.PERCENTAGE),
    )
    commission_value = attrs.get(
        "commission_value",
        getattr(instance, "commission_value", 0),
    )
    if (
        commission_type == AffiliateProfile.CommissionType.PERCENTAGE
        and commission_value > 100
    ):
        raise serializers.ValidationError(
            {"commission_value": "A comissão percentual não pode ser maior que 100%."}
        )
    return attrs


class PlatformAffiliateSerializer(serializers.ModelSerializer):
    user_id = serializers.UUIDField(source="user.id", read_only=True)
    full_name = serializers.CharField(source="user.full_name", read_only=True)
    email = serializers.EmailField(source="user.email", read_only=True)
    commission_type_display = serializers.CharField(source="get_commission_type_display", read_only=True)
    clicks = serializers.IntegerField(read_only=True, default=0)
    registrations = serializers.IntegerField(read_only=True, default=0)
    conversions = serializers.IntegerField(read_only=True, default=0)
    commissions_total = serializers.DecimalField(
        max_digits=14, decimal_places=2, read_only=True, default=0
    )

    class Meta:
        model = AffiliateProfile
        fields = (
            "id", "user_id", "full_name", "email", "code", "status",
            "commission_type", "commission_type_display", "commission_value", "currency",
            "commission_duration",
            "portal_access_only",
            "activated_at", "deactivated_at", "clicks", "registrations", "conversions",
            "commissions_total", "created_at", "updated_at",
        )
        read_only_fields = (
            "id", "code", "status", "activated_at", "deactivated_at", "created_at", "updated_at",
        )


class PlatformAffiliateCreateSerializer(serializers.ModelSerializer):
    user_id = serializers.PrimaryKeyRelatedField(
        source="user",
        queryset=User.objects.filter(is_active=True),
        required=False,
        allow_null=True,
    )
    full_name = serializers.CharField(max_length=255, write_only=True, required=False)
    email = serializers.EmailField(write_only=True, required=False)
    initial_password = serializers.CharField(
        min_length=8,
        max_length=128,
        write_only=True,
        required=False,
    )

    class Meta:
        model = AffiliateProfile
        fields = (
            "user_id", "full_name", "email", "initial_password", "portal_access_only",
            "commission_type", "commission_value", "currency",
            "commission_duration",
        )

    def validate_user_id(self, user):
        if AffiliateProfile.objects.filter(user=user).exists():
            raise serializers.ValidationError("Este usuário já possui um perfil de afiliado.")
        return user

    def validate(self, attrs):
        attrs = validate_commission_rule(attrs)
        user = attrs.get("user")
        dedicated_fields = (attrs.get("full_name"), attrs.get("email"), attrs.get("initial_password"))
        if user and any(dedicated_fields):
            raise serializers.ValidationError(
                "Escolha um usuário existente ou informe os dados da conta dedicada."
            )
        if not user and not all(dedicated_fields):
            raise serializers.ValidationError(
                "Nome, e-mail e senha inicial são obrigatórios para uma conta dedicada."
            )
        if not user and User.objects.filter(email__iexact=attrs["email"]).exists():
            raise serializers.ValidationError({"email": "Já existe uma conta com este e-mail."})
        if user:
            attrs["portal_access_only"] = False
        else:
            attrs["portal_access_only"] = True
        return attrs

    def create(self, validated_data):
        full_name = validated_data.pop("full_name", "")
        email = validated_data.pop("email", "")
        password = validated_data.pop("initial_password", "")
        user = validated_data.get("user")
        if not user:
            user = User.objects.create_user(
                email=email,
                password=password,
                full_name=full_name,
                role=User.Role.VIEWER,
            )
            validated_data["user"] = user
        validated_data["created_by"] = self.context["request"].user
        validated_data["activated_at"] = timezone.now()
        affiliate = AffiliateProfile(**validated_data)
        affiliate.full_clean()
        affiliate.save()
        return affiliate


class PlatformAffiliateUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = AffiliateProfile
        fields = ("commission_type", "commission_value", "commission_duration", "currency")

    def validate(self, attrs):
        return validate_commission_rule(attrs, self.instance)

    def update(self, instance, validated_data):
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.full_clean()
        instance.save(update_fields=[*validated_data.keys(), "updated_at"])
        return instance


class PlatformReferralSerializer(serializers.ModelSerializer):
    affiliate_name = serializers.CharField(source="affiliate.user.full_name", read_only=True)
    affiliate_code = serializers.CharField(source="affiliate.code", read_only=True)
    customer_name = serializers.CharField(source="user.full_name", read_only=True, default="")
    customer_email = serializers.EmailField(source="user.email", read_only=True, default="")
    organization_name = serializers.CharField(source="organization.name", read_only=True, default="")
    plan_name = serializers.SerializerMethodField()
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = ReferralAttribution
        fields = (
            "id", "affiliate", "affiliate_name", "affiliate_code", "customer_name",
            "customer_email", "organization", "organization_name", "plan_name", "status",
            "status_display", "attributed_at", "registered_at", "converted_at",
        )

    def get_plan_name(self, attribution):
        subscription = getattr(attribution.organization, "subscription", None)
        return subscription.plan.name if subscription else ""


class PlatformCommissionSerializer(serializers.ModelSerializer):
    affiliate_name = serializers.CharField(source="affiliate.user.full_name", read_only=True)
    affiliate_code = serializers.CharField(source="affiliate.code", read_only=True)
    customer_name = serializers.CharField(source="customer_user.full_name", read_only=True)
    customer_email = serializers.EmailField(source="customer_user.email", read_only=True)
    organization_name = serializers.CharField(source="organization.name", read_only=True)
    plan_name = serializers.CharField(source="plan.name", read_only=True)
    invoice_number = serializers.CharField(source="invoice.number", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    reversed_amount = serializers.SerializerMethodField()

    class Meta:
        model = Commission
        fields = (
            "id", "affiliate", "affiliate_name", "affiliate_code", "customer_name",
            "customer_email", "organization", "organization_name", "plan", "plan_name",
            "invoice", "invoice_number", "transaction_amount", "commission_type_snapshot",
            "commission_rate_snapshot", "commission_amount", "currency", "conversion_at",
            "commission_duration_snapshot",
            "status", "status_display", "status_reason", "approved_at", "paid_at",
            "cancelled_at", "reversed_amount", "created_at",
        )

    def get_reversed_amount(self, commission):
        return sum((adjustment.amount for adjustment in commission.adjustments.all()), 0)


class CommissionTransitionSerializer(serializers.Serializer):
    reason = serializers.CharField(min_length=3, max_length=1000)
