from common.models import BaseModel
from django.db import models


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

    class Meta(BaseModel.Meta):
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.organization} — {self.plan}"


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
