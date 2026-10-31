"""
Finance domain models — transactions, categories, billing.
"""
from common.models import BaseModel
from django.db import models, transaction


class FinancialCategory(BaseModel):
    """Classification for financial transactions."""

    class CategoryType(models.TextChoices):
        REVENUE = "revenue", "Revenue"
        EXPENSE = "expense", "Expense"

    organization = models.ForeignKey(
        "organizations.Organization", on_delete=models.CASCADE, related_name="financial_categories"
    )
    name = models.CharField(max_length=100)
    category_type = models.CharField(max_length=10, choices=CategoryType.choices)
    parent = models.ForeignKey(
        "self", on_delete=models.SET_NULL, null=True, blank=True, related_name="subcategories"
    )
    is_active = models.BooleanField(default=True)

    class Meta(BaseModel.Meta):
        verbose_name = "Financial Category"
        verbose_name_plural = "Financial Categories"
        unique_together = [["organization", "name", "category_type"]]

    def __str__(self) -> str:
        return f"{self.name} ({self.category_type})"


class BankAccount(BaseModel):
    """A bank account or cash reserve for the organization."""
    class AccountType(models.TextChoices):
        CHECKING = "checking", "Checking Account"
        SAVINGS = "savings", "Savings Account"
        CASH = "cash", "Cash"

    organization = models.ForeignKey(
        "organizations.Organization", on_delete=models.CASCADE, related_name="bank_accounts"
    )
    name = models.CharField(max_length=100)
    account_type = models.CharField(max_length=20, choices=AccountType.choices, default=AccountType.CHECKING)
    initial_balance = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    current_balance = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    is_active = models.BooleanField(default=True)

    class Meta(BaseModel.Meta):
        verbose_name = "Bank Account"
        verbose_name_plural = "Bank Accounts"

    def __str__(self) -> str:
        return f"{self.name} - R$ {self.current_balance}"

    @transaction.atomic
    def save(self, *args, **kwargs):
        from .services import refresh_account_balances
        if not self._state.adding:
            type(self).objects.select_for_update().get(pk=self.pk)
        super().save(*args, **kwargs)
        refresh_account_balances([self.pk])
        self.refresh_from_db(fields=["current_balance"])



class Transaction(BaseModel):
    """A single financial transaction (revenue or expense)."""

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        PAID = "paid", "Paid"
        OVERDUE = "overdue", "Overdue"
        CANCELLED = "cancelled", "Cancelled"

    class PaymentMethod(models.TextChoices):
        PIX = "pix", "PIX"
        BOLETO = "boleto", "Boleto"
        CREDIT_CARD = "credit_card", "Cartão de Crédito"
        TRANSFER = "transfer", "Transferência"
        CASH = "cash", "Dinheiro"

    organization = models.ForeignKey(
        "organizations.Organization", on_delete=models.CASCADE, related_name="transactions"
    )
    farm = models.ForeignKey(
        "farms.Farm", on_delete=models.SET_NULL, null=True, blank=True, related_name="transactions"
    )
    category = models.ForeignKey(
        FinancialCategory, on_delete=models.PROTECT, related_name="transactions"
    )
    description = models.CharField(max_length=500)
    amount = models.DecimalField(max_digits=16, decimal_places=2)
    due_date = models.DateField()
    payment_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=15, choices=Status.choices, default=Status.PENDING)
    reference = models.CharField(max_length=100, blank=True, help_text="NF, contract, invoice number")
    notes = models.TextField(blank=True)
    
    payment_method = models.CharField(max_length=20, choices=PaymentMethod.choices, null=True, blank=True)
    attachment = models.FileField(upload_to="finance/receipts/%Y/%m/", null=True, blank=True)
    bank_account = models.ForeignKey(
        BankAccount, on_delete=models.SET_NULL, null=True, blank=True, related_name="transactions"
    )

    planting_cycle = models.ForeignKey(
        "crops.PlantingCycle", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="finance_transactions",
    )

    animal_batch = models.ForeignKey(
        "livestock.AnimalBatch", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="finance_transactions",
    )
    species = models.ForeignKey(
        "livestock.Species", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="finance_transactions",
    )

    series_id = models.UUIDField(null=True, blank=True, editable=False, db_index=True)
    series_kind = models.CharField(max_length=12, blank=True, editable=False)
    series_number = models.PositiveSmallIntegerField(null=True, blank=True, editable=False)
    series_count = models.PositiveSmallIntegerField(null=True, blank=True, editable=False)

    created_by = models.ForeignKey(
        "accounts.User", on_delete=models.SET_NULL, null=True, related_name="transactions"
    )

    class Meta(BaseModel.Meta):
        verbose_name = "Transaction"
        verbose_name_plural = "Transactions"
        constraints = [models.UniqueConstraint(fields=["organization", "series_id", "series_number"], name="unique_finance_series_number")]

    def __str__(self) -> str:
        return f"{self.description} — R$ {self.amount} ({self.status})"

    @transaction.atomic
    def save(self, *args, **kwargs):
        from .services import refresh_account_balances
        previous = type(self).objects.select_for_update().filter(pk=self.pk).first()
        if previous and self.payment_events.exists() and not getattr(self, "_settlement_operation", False):
            protected = ["amount", "category_id", "bank_account_id", "status", "payment_date", "payment_method", "farm_id", "animal_batch_id", "species_id", "planting_cycle_id"]
            if any(getattr(previous, key) != getattr(self, key) for key in protected):
                from rest_framework.exceptions import ValidationError
                raise ValidationError("Títulos com histórico de baixas exigem baixa/estorno; os valores liquidados não podem ser sobrescritos.")
        old_account = previous.bank_account_id if previous else None
        accounts = {pk for pk in [old_account, self.bank_account_id] if pk}
        list(BankAccount.objects.select_for_update().filter(pk__in=accounts).order_by("pk"))
        if self.status == self.Status.PAID and not self.payment_date:
            self.payment_date = self.due_date
        super().save(*args, **kwargs)
        refresh_account_balances(accounts)

    @property
    def is_revenue(self) -> bool:
        return self.category.category_type == FinancialCategory.CategoryType.REVENUE


class PaymentEvent(BaseModel):
    """Immutable full settlement/reversal history for a commercial document."""
    class Kind(models.TextChoices):
        PAYMENT = "payment", "Baixa"
        REVERSAL = "reversal", "Estorno"

    transaction = models.ForeignKey(Transaction, on_delete=models.PROTECT, related_name="payment_events")
    kind = models.CharField(max_length=10, choices=Kind.choices)
    amount = models.DecimalField(max_digits=16, decimal_places=2)
    bank_account = models.ForeignKey(BankAccount, null=True, on_delete=models.PROTECT, related_name="payment_events")
    payment_date = models.DateField()
    payment_method = models.CharField(max_length=20, blank=True)
    reason = models.CharField(max_length=1000, blank=True)
    reverses = models.OneToOneField("self", null=True, blank=True, on_delete=models.PROTECT, related_name="reversal")
    idempotency_key = models.UUIDField(null=True, blank=True)
    created_by = models.ForeignKey("accounts.User", null=True, on_delete=models.SET_NULL, related_name="financial_payment_events")

    class Meta(BaseModel.Meta):
        constraints = [
            models.CheckConstraint(condition=models.Q(amount__gt=0), name="positive_payment_event_amount"),
            models.UniqueConstraint(fields=["transaction", "idempotency_key"], name="unique_document_payment_key"),
        ]
