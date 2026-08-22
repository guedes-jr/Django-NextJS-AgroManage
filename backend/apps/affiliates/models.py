import secrets
import string
import uuid
from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import Q

from common.models import BaseModel


def generate_affiliate_code():
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(12))


class AffiliateProfile(BaseModel):
    class Status(models.TextChoices):
        ACTIVE = "active", "Ativo"
        INACTIVE = "inactive", "Inativo"

    class CommissionType(models.TextChoices):
        PERCENTAGE = "percentage", "Percentual"
        FIXED_AMOUNT = "fixed_amount", "Valor fixo"

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="affiliate_profile",
    )
    code = models.CharField(
        max_length=24,
        unique=True,
        db_index=True,
        default=generate_affiliate_code,
        editable=False,
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.ACTIVE,
        db_index=True,
    )
    commission_type = models.CharField(
        max_length=20,
        choices=CommissionType.choices,
        default=CommissionType.PERCENTAGE,
    )
    commission_value = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    currency = models.CharField(max_length=3, default="BRL")
    activated_at = models.DateTimeField(null=True, blank=True)
    deactivated_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_affiliate_profiles",
    )

    class Meta(BaseModel.Meta):
        ordering = ("user__full_name",)
        verbose_name = "Perfil de afiliado"
        verbose_name_plural = "Perfis de afiliados"

    def clean(self):
        super().clean()
        if (
            self.commission_type == self.CommissionType.PERCENTAGE
            and self.commission_value > Decimal("100.00")
        ):
            raise ValidationError(
                {"commission_value": "A comissão percentual não pode ser maior que 100%."}
            )

    def __str__(self):
        return f"{self.user.full_name} ({self.code})"


class ReferralVisit(BaseModel):
    affiliate = models.ForeignKey(
        AffiliateProfile,
        on_delete=models.PROTECT,
        related_name="visits",
    )
    visitor_id = models.UUIDField(default=uuid.uuid4, db_index=True)
    landing_path = models.CharField(max_length=500, blank=True)
    referrer = models.URLField(max_length=1000, blank=True)
    utm_source = models.CharField(max_length=120, blank=True)
    utm_medium = models.CharField(max_length=120, blank=True)
    utm_campaign = models.CharField(max_length=120, blank=True)
    ip_hash = models.CharField(max_length=64, blank=True, db_index=True)
    user_agent = models.CharField(max_length=512, blank=True)
    occurred_at = models.DateTimeField(db_index=True)

    class Meta(BaseModel.Meta):
        ordering = ("-occurred_at",)
        indexes = [
            models.Index(fields=("affiliate", "occurred_at"), name="aff_visit_aff_time_idx"),
        ]


class ReferralAttribution(BaseModel):
    class Status(models.TextChoices):
        VISITED = "visited", "Visitou"
        REGISTERED = "registered", "Cadastrado"
        CONVERTED = "converted", "Convertido"
        INVALIDATED = "invalidated", "Invalidado"

    affiliate = models.ForeignKey(
        AffiliateProfile,
        on_delete=models.PROTECT,
        related_name="attributions",
    )
    visitor_id = models.UUIDField(db_index=True)
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="referral_attribution",
    )
    organization = models.OneToOneField(
        "organizations.Organization",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="referral_attribution",
    )
    first_visit = models.ForeignKey(
        ReferralVisit,
        on_delete=models.PROTECT,
        related_name="first_touch_attributions",
    )
    attributed_at = models.DateTimeField(db_index=True)
    registered_at = models.DateTimeField(null=True, blank=True)
    converted_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.VISITED,
        db_index=True,
    )
    metadata = models.JSONField(default=dict, blank=True)

    class Meta(BaseModel.Meta):
        ordering = ("-attributed_at",)
        constraints = [
            models.UniqueConstraint(
                fields=("visitor_id",),
                condition=~Q(status="invalidated"),
                name="unique_active_visitor_attribution",
            ),
        ]


class Commission(BaseModel):
    class Status(models.TextChoices):
        PENDING = "pending", "Pendente"
        APPROVED = "approved", "Aprovada"
        PAID = "paid", "Paga"
        CANCELLED = "cancelled", "Cancelada/estornada"

    affiliate = models.ForeignKey(
        AffiliateProfile,
        on_delete=models.PROTECT,
        related_name="commissions",
    )
    attribution = models.ForeignKey(
        ReferralAttribution,
        on_delete=models.PROTECT,
        related_name="commissions",
    )
    customer_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="affiliate_commissions_as_customer",
    )
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.PROTECT,
        related_name="affiliate_commissions",
    )
    subscription = models.ForeignKey(
        "billing.Subscription",
        on_delete=models.PROTECT,
        related_name="affiliate_commissions",
    )
    plan = models.ForeignKey(
        "billing.Plan",
        on_delete=models.PROTECT,
        related_name="affiliate_commissions",
    )
    invoice = models.OneToOneField(
        "billing.Invoice",
        on_delete=models.PROTECT,
        related_name="affiliate_commission",
    )
    payment = models.ForeignKey(
        "billing.Payment",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="affiliate_commissions",
    )
    transaction_amount = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    currency = models.CharField(max_length=3, default="BRL")
    commission_type_snapshot = models.CharField(
        max_length=20,
        choices=AffiliateProfile.CommissionType.choices,
    )
    commission_rate_snapshot = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    commission_amount = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    conversion_at = models.DateTimeField(db_index=True)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
        db_index=True,
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_affiliate_commissions",
    )
    paid_at = models.DateTimeField(null=True, blank=True)
    paid_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="paid_affiliate_commissions",
    )
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancelled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="cancelled_affiliate_commissions",
    )
    status_reason = models.TextField(blank=True)

    class Meta(BaseModel.Meta):
        ordering = ("-conversion_at",)
        constraints = [
            models.UniqueConstraint(
                fields=("organization",),
                name="unique_first_customer_commission",
            ),
        ]
        indexes = [
            models.Index(fields=("affiliate", "status"), name="aff_comm_aff_status_idx"),
            models.Index(fields=("organization", "conversion_at"), name="aff_comm_org_time_idx"),
        ]


class CommissionStatusHistory(BaseModel):
    commission = models.ForeignKey(
        Commission,
        on_delete=models.PROTECT,
        related_name="status_history",
    )
    previous_status = models.CharField(max_length=20, blank=True)
    new_status = models.CharField(max_length=20, choices=Commission.Status.choices)
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="affiliate_commission_status_changes",
    )
    reason = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta(BaseModel.Meta):
        ordering = ("created_at",)
        verbose_name = "Histórico de status de comissão"
        verbose_name_plural = "Históricos de status de comissões"


class CommissionAdjustment(BaseModel):
    class AdjustmentType(models.TextChoices):
        REVERSAL = "reversal", "Estorno"

    commission = models.ForeignKey(
        Commission,
        on_delete=models.PROTECT,
        related_name="adjustments",
    )
    payment = models.OneToOneField(
        "billing.Payment",
        on_delete=models.PROTECT,
        related_name="affiliate_commission_adjustment",
    )
    adjustment_type = models.CharField(
        max_length=20,
        choices=AdjustmentType.choices,
        default=AdjustmentType.REVERSAL,
    )
    amount = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
    )
    reason = models.TextField()
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="affiliate_commission_adjustments",
    )

    class Meta(BaseModel.Meta):
        ordering = ("-created_at",)
        verbose_name = "Ajuste de comissão"
        verbose_name_plural = "Ajustes de comissões"
