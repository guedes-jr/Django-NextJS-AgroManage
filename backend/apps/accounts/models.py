"""
Accounts app models — custom User model with role management.
"""
import uuid
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from common.models import BaseModel
from common.quotas import QuotaQuerySet, save_with_quotas
from django.utils import timezone


class UserManager(BaseUserManager.from_queryset(QuotaQuerySet)):
    def create_user(self, email: str, password: str = None, **extra_fields):
        if not email:
            raise ValueError("Email is required.")
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email: str, password: str, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("role", User.Role.ADMIN)
        return self.create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    class Role(models.TextChoices):
        ADMIN = "admin", "Administrador"
        MANAGER = "manager", "Gerente"
        OPERATOR = "operator", "Operador"

    class Theme(models.TextChoices):
        LIGHT = "light", "Padrão"
        DARK = "dark", "Escuro"
        CONTRAST = "contrast", "Alto contraste"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True, db_index=True)
    full_name = models.CharField(max_length=255)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.OPERATOR)
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="members",
    )
    avatar = models.ImageField(upload_to="avatars/", null=True, blank=True)
    organization_responsible = models.BooleanField(default=False)
    can_operate_crops = models.BooleanField(default=False)
    allowed_livestock = models.ManyToManyField("livestock.Species", blank=True, related_name="authorized_operators")
    operator_read_only = models.BooleanField(default=False)
    phone = models.CharField(max_length=30, blank=True)
    phone_is_whatsapp = models.BooleanField(default=False)
    receive_system_alerts = models.BooleanField(default=True)
    theme = models.CharField(max_length=20, choices=Theme.choices, default=Theme.LIGHT)
    email_notifications = models.BooleanField(default=True)
    stock_alerts = models.BooleanField(default=True)
    default_unit = models.CharField(max_length=20, default="kg")
    min_stock_alert = models.PositiveIntegerField(default=10)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    force_password_change = models.BooleanField(default=False)
    session_version = models.PositiveBigIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["full_name"]

    objects = UserManager()

    class Meta:
        verbose_name = "User"
        verbose_name_plural = "Users"
        ordering = ["full_name"]
        constraints = [
            models.UniqueConstraint(
                fields=["organization"], condition=models.Q(organization_responsible=True),
                name="unique_organization_responsible",
            ),
        ]

    def save(self, *args, **kwargs):
        if hasattr(self, "support_access_grant"):
            # The tenant and administrator role apply only to this support request.
            fields = kwargs.get("update_fields")
            if fields is None:
                deferred = self.get_deferred_fields()
                fields = {
                    field.name for field in self._meta.concrete_fields
                    if not field.primary_key and field.attname not in deferred
                }
            kwargs["update_fields"] = set(fields) - {"organization", "organization_id", "role"}
        return save_with_quotas(self, super().save, args, kwargs)

    def __str__(self) -> str:
        return f"{self.full_name} <{self.email}>"

    @property
    def is_admin(self) -> bool:
        return self.role == self.Role.ADMIN


class OrganizationAdministratorInvitation(BaseModel):
    class DeliveryStatus(models.TextChoices):
        PENDING = "pending", "Pendente"
        SENT = "sent", "Enviado"
        FAILED = "failed", "Falha no envio"

    organization = models.OneToOneField(
        "organizations.Organization", on_delete=models.CASCADE, related_name="administrator_invitation",
    )
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="organization_invitation")
    email = models.EmailField()
    token_digest = models.CharField(max_length=64, unique=True)
    expires_at = models.DateTimeField()
    accepted_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    delivery_status = models.CharField(max_length=10, choices=DeliveryStatus.choices, default=DeliveryStatus.PENDING)
    delivery_attempts = models.PositiveIntegerField(default=0)
    last_attempt_at = models.DateTimeField(null=True, blank=True)
    last_sent_at = models.DateTimeField(null=True, blank=True)
    delivery_error = models.CharField(max_length=255, blank=True)

    @property
    def state(self):
        if self.accepted_at:
            return "accepted"
        if self.revoked_at:
            return "revoked"
        if self.expires_at <= timezone.now():
            return "expired"
        return self.delivery_status


class OperatorRecordOwnership(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    organization = models.ForeignKey('organizations.Organization', on_delete=models.CASCADE)
    model_label = models.CharField(max_length=100)
    object_id = models.UUIDField()
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        constraints = [models.UniqueConstraint(fields=['user', 'model_label', 'object_id'], name='unique_operator_record_ownership')]
