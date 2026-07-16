"""
Accounts app serializers — auth, user, profile.
"""
from rest_framework import serializers
from common.authentication import is_active_platform_staff
from .models import User


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    def validate(self, data):
        email = data.get("email")
        password = data.get("password")

        if email and password:
            try:
                user = User.objects.get(email=email)
            except User.DoesNotExist:
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
        else:
            raise serializers.ValidationError("Email e senha são obrigatórios.")

        return data


class UserSerializer(serializers.ModelSerializer):
    avatar = serializers.ImageField(required=False, allow_null=True)
    
    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "full_name",
            "role",
            "phone",
            "avatar",
            "theme",
            "email_notifications",
            "stock_alerts",
            "default_unit",
            "min_stock_alert",
            "is_active",
            "force_password_change",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]
        extra_kwargs = {
            "avatar": {"required": False, "allow_null": True},
        }


class UserCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    password_confirm = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = [
            "email",
            "full_name",
            "password",
            "password_confirm",
            "role",
            "phone",
        ]

    def validate(self, data):
        if data.get("password") != data.get("password_confirm"):
            raise serializers.ValidationError({"password_confirm": "As senhas não conferem."})
        return data

    def create(self, validated_data):
        validated_data.pop("password_confirm")
        password = validated_data.pop("password")
        user = User.objects.create_user(password=password, **validated_data)
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

class OrganizationMemberSerializer(serializers.ModelSerializer):
    role_display = serializers.CharField(source='get_role_display', read_only=True)

    class Meta:
        model = User
        fields = [
            'id', 'email', 'full_name', 'role', 'role_display', 
            'phone', 'avatar', 'is_active', 'created_at'
        ]
        read_only_fields = ['id', 'email', 'created_at']


class CreateMemberSerializer(serializers.Serializer):
    email = serializers.EmailField()
    full_name = serializers.CharField(max_length=150)
    role = serializers.ChoiceField(choices=User.Role.choices, default='operator')
    phone = serializers.CharField(max_length=30, required=False, allow_blank=True)
    password = serializers.CharField(write_only=True, min_length=8)
    password_confirm = serializers.CharField(write_only=True)

    def validate(self, data):
        if data.get("password") != data.get("password_confirm"):
            raise serializers.ValidationError({"password_confirm": "As senhas não conferem."})
        return data
