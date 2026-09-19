from common.models import BaseModel
from decimal import Decimal
import uuid

from django.db import models
from django.utils import timezone
from django.conf import settings
from cryptography.fernet import Fernet, InvalidToken
import base64
import hashlib
import json


class Plan(BaseModel):
    """Commercial plan offered by the AgroManage SaaS."""

    code = models.SlugField(max_length=60, unique=True)
    name = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    monthly_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    yearly_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    trial_days = models.PositiveSmallIntegerField(default=0)
    max_users = models.PositiveIntegerField(null=True, blank=True)
    max_farms = models.PositiveIntegerField(null=True, blank=True)
    max_storage_mb = models.PositiveIntegerField(null=True, blank=True)
    max_reports_per_month = models.PositiveIntegerField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    is_public = models.BooleanField(default=True)
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta(BaseModel.Meta):
        ordering = ("sort_order", "monthly_price", "name")

    def __str__(self):
        return self.name


class PlanSegment(BaseModel):
    """Public, composable product area offered in the plan builder."""

    class Accent(models.TextChoices):
        GREEN = "green", "Verde"
        WINE = "wine", "Vinho"

    code = models.SlugField(max_length=80, unique=True)
    name = models.CharField(max_length=120)
    subtitle = models.CharField(max_length=160)
    description = models.TextField()
    image_path = models.CharField(max_length=255, blank=True)
    icon = models.CharField(max_length=40, default="sprout")
    accent = models.CharField(max_length=12, choices=Accent.choices, default=Accent.GREEN)
    metric_label = models.CharField(max_length=80, blank=True)
    annual_discount_percent = models.DecimalField(max_digits=5, decimal_places=2, default=15)
    is_active = models.BooleanField(default=True)
    is_public = models.BooleanField(default=True)
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta(BaseModel.Meta):
        ordering = ("sort_order", "name", "subtitle")

    def __str__(self):
        return f"{self.name} — {self.subtitle}"


class PlanTier(BaseModel):
    """Price band for a segment, based on the size of the customer's operation."""

    segment = models.ForeignKey(PlanSegment, on_delete=models.CASCADE, related_name="tiers")
    label = models.CharField(max_length=120)
    minimum_quantity = models.PositiveIntegerField(null=True, blank=True)
    maximum_quantity = models.PositiveIntegerField(null=True, blank=True)
    monthly_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    requires_quote = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta(BaseModel.Meta):
        ordering = ("sort_order", "minimum_quantity", "label")
        constraints = [
            models.UniqueConstraint(fields=("segment", "label"), name="unique_plan_segment_tier_label"),
        ]

    def __str__(self):
        return f"{self.segment}: {self.label}"


class SubscriptionQuote(BaseModel):
    """Server-calculated snapshot of a plan-builder selection."""

    class Status(models.TextChoices):
        DRAFT = "draft", "Rascunho"
        CONVERTED = "converted", "Convertido"
        EXPIRED = "expired", "Expirado"

    class BillingCycle(models.TextChoices):
        MONTHLY = "monthly", "Mensal"
        YEARLY = "yearly", "Anual"

    public_token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    billing_cycle = models.CharField(max_length=20, choices=BillingCycle.choices)
    currency = models.CharField(max_length=3, default="BRL")
    monthly_subtotal = models.DecimalField(max_digits=14, decimal_places=2)
    monthly_discount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    monthly_total = models.DecimalField(max_digits=14, decimal_places=2)
    billing_total = models.DecimalField(max_digits=14, decimal_places=2)
    requires_contact = models.BooleanField(default=False)
    expires_at = models.DateTimeField(db_index=True)

    class Meta(BaseModel.Meta):
        ordering = ("-created_at",)

    @property
    def is_expired(self):
        return self.expires_at <= timezone.now()


class SubscriptionQuoteItem(BaseModel):
    quote = models.ForeignKey(SubscriptionQuote, on_delete=models.CASCADE, related_name="items")
    tier = models.ForeignKey(PlanTier, on_delete=models.PROTECT, related_name="quote_items")
    segment_code = models.SlugField(max_length=80)
    segment_name = models.CharField(max_length=120)
    segment_subtitle = models.CharField(max_length=160)
    tier_label = models.CharField(max_length=120)
    monthly_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    discount_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    final_monthly_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    requires_quote = models.BooleanField(default=False)

    class Meta(BaseModel.Meta):
        ordering = ("created_at",)


class SubscriptionItem(BaseModel):
    """A price snapshot for each segment currently contracted by an organization."""

    subscription = models.ForeignKey("Subscription", on_delete=models.CASCADE, related_name="items")
    tier = models.ForeignKey(PlanTier, on_delete=models.PROTECT, related_name="subscription_items")
    segment_code = models.SlugField(max_length=80)
    segment_name = models.CharField(max_length=120)
    segment_subtitle = models.CharField(max_length=160)
    tier_label = models.CharField(max_length=120)
    monthly_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    discount_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    final_monthly_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)

    class Meta(BaseModel.Meta):
        ordering = ("created_at",)
        constraints = [
            models.UniqueConstraint(fields=("subscription", "segment_code"), name="unique_subscription_segment"),
        ]


class PaymentGatewayConfiguration(BaseModel):
    class Environment(models.TextChoices):
        SANDBOX = "sandbox", "Homologação"
        PRODUCTION = "production", "Produção"

    class HealthStatus(models.TextChoices):
        UNKNOWN = "unknown", "Não verificado"
        HEALTHY = "healthy", "Disponível"
        ERROR = "error", "Com erro"

    provider = models.SlugField(max_length=50, unique=True)
    display_name = models.CharField(max_length=100)
    environment = models.CharField(max_length=20, choices=Environment.choices, default=Environment.SANDBOX)
    is_enabled = models.BooleanField(default=False)
    is_default = models.BooleanField(default=False)
    encrypted_credentials = models.TextField(blank=True, editable=False)
    settings = models.JSONField(default=dict, blank=True)
    last_health_status = models.CharField(max_length=20, choices=HealthStatus.choices, default=HealthStatus.UNKNOWN)
    last_health_message = models.CharField(max_length=500, blank=True)
    last_health_check_at = models.DateTimeField(null=True, blank=True)

    class Meta(BaseModel.Meta):
        ordering = ("display_name",)
        constraints = [
            models.UniqueConstraint(fields=("is_default",), condition=models.Q(is_default=True), name="unique_default_payment_gateway"),
        ]

    @staticmethod
    def _credential_cipher():
        digest = hashlib.sha256(settings.SECRET_KEY.encode("utf-8")).digest()
        return Fernet(base64.urlsafe_b64encode(digest))

    def set_credentials(self, credentials):
        clean = {str(key): str(value).strip() for key, value in (credentials or {}).items() if str(value).strip()}
        self.encrypted_credentials = self._credential_cipher().encrypt(json.dumps(clean).encode()).decode("ascii") if clean else ""

    def get_credentials(self):
        if not self.encrypted_credentials:
            return {}
        try:
            return json.loads(self._credential_cipher().decrypt(self.encrypted_credentials.encode("ascii")).decode())
        except (InvalidToken, ValueError, json.JSONDecodeError):
            return {}

    def __str__(self):
        return self.display_name


class Feature(BaseModel):
    code = models.SlugField(max_length=80, unique=True)
    name = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta(BaseModel.Meta):
        ordering = ("name",)

    def __str__(self):
        return self.name


class PlanEntitlement(BaseModel):
    plan = models.ForeignKey(Plan, on_delete=models.CASCADE, related_name="entitlements")
    feature = models.ForeignKey(Feature, on_delete=models.CASCADE, related_name="plan_entitlements")
    is_enabled = models.BooleanField(default=True)
    limit_value = models.PositiveIntegerField(null=True, blank=True)
    config = models.JSONField(default=dict, blank=True)

    class Meta(BaseModel.Meta):
        constraints = [
            models.UniqueConstraint(fields=("plan", "feature"), name="unique_plan_feature")
        ]


class Subscription(BaseModel):
    class Status(models.TextChoices):
        TRIALING = "trialing", "Em teste"
        ACTIVE = "active", "Ativa"
        PAST_DUE = "past_due", "Pagamento pendente"
        SUSPENDED = "suspended", "Suspensa"
        CANCELLED = "cancelled", "Cancelada"

    class BillingCycle(models.TextChoices):
        MONTHLY = "monthly", "Mensal"
        YEARLY = "yearly", "Anual"
        CUSTOM = "custom", "Personalizado"

    class DiscountType(models.TextChoices):
        PERCENTAGE = "percentage", "Percentual"
        FIXED_AMOUNT = "fixed_amount", "Valor fixo"

    organization = models.OneToOneField(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="subscription",
    )
    plan = models.ForeignKey(Plan, on_delete=models.PROTECT, related_name="subscriptions")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    billing_cycle = models.CharField(
        max_length=20,
        choices=BillingCycle.choices,
        default=BillingCycle.MONTHLY,
    )
    started_at = models.DateTimeField()
    trial_ends_at = models.DateTimeField(null=True, blank=True)
    current_period_ends_at = models.DateTimeField(null=True, blank=True)
    cancel_at_period_end = models.BooleanField(default=False)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    custom_limits = models.JSONField(default=dict, blank=True)
    notes = models.TextField(blank=True)
    discount_type = models.CharField(
        max_length=20,
        choices=DiscountType.choices,
        blank=True,
    )
    discount_value = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    discount_starts_at = models.DateTimeField(null=True, blank=True)
    discount_ends_at = models.DateTimeField(null=True, blank=True)

    class Meta(BaseModel.Meta):
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.organization} — {self.plan}"

    @property
    def has_active_discount(self):
        if not self.discount_type or Decimal(self.discount_value) <= 0:
            return False
        now = timezone.now()
        if self.discount_starts_at and self.discount_starts_at > now:
            return False
        return not self.discount_ends_at or self.discount_ends_at > now

    def calculate_discount(self, amount):
        amount = Decimal(amount)
        if not self.has_active_discount:
            return Decimal("0.00")
        discount_value = Decimal(self.discount_value)
        if self.discount_type == self.DiscountType.PERCENTAGE:
            discount = amount * discount_value / Decimal("100")
        else:
            discount = discount_value
        return min(discount, amount).quantize(Decimal("0.01"))


class Invoice(BaseModel):
    class Status(models.TextChoices):
        DRAFT = "draft", "Rascunho"
        OPEN = "open", "Em aberto"
        PAID = "paid", "Paga"
        OVERDUE = "overdue", "Vencida"
        VOID = "void", "Cancelada"
        UNCOLLECTIBLE = "uncollectible", "Incobrável"

    number = models.CharField(max_length=50, unique=True, db_index=True)
    organization = models.ForeignKey(
        "organizations.Organization", on_delete=models.PROTECT, related_name="billing_invoices"
    )
    subscription = models.ForeignKey(
        Subscription, on_delete=models.PROTECT, related_name="invoices"
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    currency = models.CharField(max_length=3, default="BRL")
    subtotal = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    discount_total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    amount_paid = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    issued_at = models.DateTimeField(null=True, blank=True)
    due_date = models.DateField()
    paid_at = models.DateTimeField(null=True, blank=True)
    external_id = models.CharField(max_length=120, blank=True, db_index=True)
    notes = models.TextField(blank=True)

    class Meta(BaseModel.Meta):
        ordering = ("-due_date", "-created_at")

    @property
    def amount_due(self):
        return max(self.total - self.amount_paid, 0)

    def __str__(self):
        return self.number


class InvoiceItem(BaseModel):
    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name="items")
    description = models.CharField(max_length=255)
    quantity = models.PositiveIntegerField(default=1)
    unit_amount = models.DecimalField(max_digits=14, decimal_places=2)
    total = models.DecimalField(max_digits=14, decimal_places=2)
    period_start = models.DateField(null=True, blank=True)
    period_end = models.DateField(null=True, blank=True)


class Payment(BaseModel):
    class Status(models.TextChoices):
        PENDING = "pending", "Pendente"
        SUCCEEDED = "succeeded", "Confirmado"
        FAILED = "failed", "Falhou"
        REFUNDED = "refunded", "Reembolsado"
        CANCELLED = "cancelled", "Cancelado"

    invoice = models.ForeignKey(Invoice, on_delete=models.PROTECT, related_name="payments")
    organization = models.ForeignKey(
        "organizations.Organization", on_delete=models.PROTECT, related_name="billing_payments"
    )
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    currency = models.CharField(max_length=3, default="BRL")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    payment_method = models.CharField(max_length=40, blank=True)
    provider = models.CharField(max_length=40, default="manual")
    external_id = models.CharField(max_length=120, blank=True, db_index=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    failure_code = models.CharField(max_length=80, blank=True)
    failure_message = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta(BaseModel.Meta):
        ordering = ("-created_at",)


class PaymentAttempt(BaseModel):
    payment = models.ForeignKey(Payment, on_delete=models.CASCADE, related_name="attempts")
    attempted_at = models.DateTimeField(auto_now_add=True)
    succeeded = models.BooleanField(default=False)
    provider_response_code = models.CharField(max_length=80, blank=True)
    error_message = models.TextField(blank=True)
    response_data = models.JSONField(default=dict, blank=True)
