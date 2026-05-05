"""
Finance domain models — transactions, categories, billing.
"""
from common.models import BaseModel
from django.db import models


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

    created_by = models.ForeignKey(
        "accounts.User", on_delete=models.SET_NULL, null=True, related_name="transactions"
    )

    class Meta(BaseModel.Meta):
        verbose_name = "Transaction"
        verbose_name_plural = "Transactions"

    def __str__(self) -> str:
        return f"{self.description} — R$ {self.amount} ({self.status})"

    @property
    def is_revenue(self) -> bool:
        return self.category.category_type == FinancialCategory.CategoryType.REVENUE
