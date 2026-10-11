"""
Accounts app serializers — auth, user, profile.
"""
from common.authentication import is_active_platform_staff
from django.core.exceptions import ObjectDoesNotExist
from rest_framework import serializers

from apps.livestock.models import Species

from .models import User


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    def validate(self, data):
        email = User.objects.normalize_email((data.get("email") or "").strip())
        password = data.get("password")

        if email and password:
            user = User.objects.filter(email__iexact=email).first()
            if not user:
                raise serializers.ValidationError("Credenciais inválidas.")

            if not user.check_password(password):
                raise serializers.ValidationError("Credenciais inválidas.")

            if not user.is_active:
                raise serializers.ValidationError("Usuário inativo.")

            if (
                user.organization
                and not user.organization.is_active
                and not is_active_platform_staff(user)
            ):
                raise serializers.ValidationError(
                    "Organização suspensa. Entre em contato com o suporte."
                )

            data["user"] = user
            data["email"] = user.email
        else:
            raise serializers.ValidationError("Email e senha são obrigatórios.")

        return data


class WhatsAppContactMixin:
    """Keep profile consent in the existing notification preference."""

    def validate(self, attrs):
        attrs = super().validate(attrs)
        instance = getattr(self, "instance", None)
        phone = attrs.get("phone", getattr(instance, "phone", ""))
        enabled = attrs.get("phone_is_whatsapp", getattr(instance, "phone_is_whatsapp", False))
        preference = attrs.get("notification_preference", {})
        if enabled and not phone.strip():
            raise serializers.ValidationError({"phone": "Informe o telefone que possui WhatsApp."})
        if preference.get("whatsapp_reproductive_alerts") and not enabled:
            raise serializers.ValidationError({"whatsapp_reproductive_alerts": "Marque que este contato possui WhatsApp para receber alertas."})
        if "phone_is_whatsapp" in attrs:
            # The contact checkbox authorizes the available WhatsApp alert channel;
            # the master preference gates every channel independently.
            if enabled:
                attrs.setdefault("notification_preference", {}).setdefault("whatsapp_reproductive_alerts", True)
            else:
                attrs.setdefault("notification_preference", {})["whatsapp_reproductive_alerts"] = False
        return attrs

    def update(self, instance, validated_data):
        from django.db import transaction

        from apps.notifications.models import NotificationPreference

        preference = validated_data.pop("notification_preference", None)
        with transaction.atomic():
            user = super().update(instance, validated_data)
            if preference is not None:
                user.notification_preference, _ = NotificationPreference.objects.update_or_create(user=user, defaults=preference)
        return user


class UserSerializer(WhatsAppContactMixin, serializers.ModelSerializer):
    whatsapp_reproductive_alerts = serializers.BooleanField(source="notification_preference.whatsapp_reproductive_alerts", required=False, default=False)
    avatar = serializers.ImageField(required=False, allow_null=True)
    is_platform_staff = serializers.SerializerMethodField()
    is_affiliate = serializers.SerializerMethodField()
    affiliate_portal_only = serializers.SerializerMethodField()
    access = serializers.SerializerMethodField()

    def get_access(self, user):
        from common.operator_access import effective_access
        return effective_access(user)

    def get_is_platform_staff(self, user):
        return is_active_platform_staff(user)

    def get_is_affiliate(self, user):
        try:
            return user.affiliate_profile.status == "active"
        except (AttributeError, ObjectDoesNotExist):
            return False

    def get_affiliate_portal_only(self, user):
        try:
            return user.affiliate_profile.portal_access_only
        except (AttributeError, ObjectDoesNotExist):
            return False
    
    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "full_name",
            "role", "can_operate_crops", "allowed_livestock", "operator_read_only", "organization_responsible", "access",
            "phone",
            "phone_is_whatsapp",
            "receive_system_alerts",
            "whatsapp_reproductive_alerts",
            "avatar",
            "theme",
            "email_notifications",
            "stock_alerts",
            "default_unit",
            "min_stock_alert",
            "is_active",
            "force_password_change",
            "is_platform_staff",
            "is_affiliate",
            "affiliate_portal_only",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "role", "can_operate_crops", "allowed_livestock", "operator_read_only", "organization_responsible", "access", "is_active", "created_at", "updated_at"]
        extra_kwargs = {
            "avatar": {"required": False, "allow_null": True},
        }


class UserCreateSerializer(WhatsAppContactMixin, serializers.ModelSerializer):
    receive_system_alerts = serializers.BooleanField(required=False, default=False)
    whatsapp_reproductive_alerts = serializers.BooleanField(source="notification_preference.whatsapp_reproductive_alerts", required=False)
    password = serializers.CharField(write_only=True, min_length=8)
    password_confirm = serializers.CharField(write_only=True)
    referral_token = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = User
        fields = [
            "email",
            "full_name",
            "password",
            "password_confirm",
            "role",
            "phone",
            "phone_is_whatsapp",
            "receive_system_alerts",
            "whatsapp_reproductive_alerts",
            "referral_token",
        ]

    def validate(self, data):
        if data.get("password") != data.get("password_confirm"):
            raise serializers.ValidationError({"password_confirm": "As senhas não conferem."})
        return super().validate(data)

    def create(self, validated_data):
        validated_data.pop("password_confirm")
        validated_data.pop("referral_token", None)
        password = validated_data.pop("password")
        from django.db import transaction

        from apps.notifications.models import NotificationPreference

        preference = validated_data.pop("notification_preference", {})
        with transaction.atomic():
            livestock = validated_data.pop("allowed_livestock", [])
            user = User.objects.create_user(password=password, **validated_data)
            user.allowed_livestock.set(livestock)
            if preference is not None:
                user.notification_preference, _ = NotificationPreference.objects.update_or_create(user=user, defaults=preference)
        return user


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=8)
    new_password_confirm = serializers.CharField(write_only=True)

    def validate(self, data):
        if data.get("new_password") != data.get("new_password_confirm"):
            raise serializers.ValidationError({"new_password_confirm": "As senhas não conferem."})
        return data


class UserPreferencesSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [
            "theme",
            "email_notifications",
            "stock_alerts",
            "default_unit",
            "min_stock_alert",
        ]

    def validate_default_unit(self, value):
        allowed_units = {"kg", "ton", "head", "liters"}
        if value not in allowed_units:
            raise serializers.ValidationError("Unidade padrão inválida.")
        return value

class OperatorScopeValidationMixin:
    def validate(self, attrs):
        attrs = super().validate(attrs)
        role = attrs.get("role", getattr(self.instance, "role", "operator"))
        if role != "operator" and (attrs.get("can_operate_crops") or attrs.get("allowed_livestock") or attrs.get("operator_read_only")):
            raise serializers.ValidationError("As restrições de área são exclusivas do operador.")
        if role != "operator":
            attrs.update(can_operate_crops=False, allowed_livestock=[], operator_read_only=False)
        return attrs


class OrganizationMemberSerializer(OperatorScopeValidationMixin, WhatsAppContactMixin, serializers.ModelSerializer):
    whatsapp_reproductive_alerts = serializers.BooleanField(source="notification_preference.whatsapp_reproductive_alerts", required=False, default=False)
    role_display = serializers.CharField(source='get_role_display', read_only=True)

    class Meta:
        model = User
        fields = [
            'id', 'email', 'full_name', 'role', 'role_display', 'can_operate_crops', 'allowed_livestock', 'operator_read_only', 'organization_responsible',
            'phone', 'phone_is_whatsapp', 'receive_system_alerts', 'whatsapp_reproductive_alerts', 'avatar', 'is_active', 'created_at'
        ]
        read_only_fields = ['id', 'email', 'created_at', 'organization_responsible']


class CreateMemberSerializer(OperatorScopeValidationMixin, UserCreateSerializer):
    can_operate_crops = serializers.BooleanField(default=False)
    operator_read_only = serializers.BooleanField(default=False)
    allowed_livestock = serializers.PrimaryKeyRelatedField(queryset=Species.objects.all(), many=True, required=False)

    class Meta(UserCreateSerializer.Meta):
        fields = [*UserCreateSerializer.Meta.fields, "can_operate_crops", "allowed_livestock", "operator_read_only"]
    email = serializers.EmailField()
    full_name = serializers.CharField(max_length=150)
    role = serializers.ChoiceField(choices=User.Role.choices, default='operator')
    phone = serializers.CharField(max_length=30, required=False, allow_blank=True)
    password = serializers.CharField(write_only=True, min_length=8)
    password_confirm = serializers.CharField(write_only=True)

    def validate(self, data):
        if data.get("password") != data.get("password_confirm"):
            raise serializers.ValidationError({"password_confirm": "As senhas não conferem."})
        return super().validate(data)
