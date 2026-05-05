from rest_framework import serializers
from .models import FinancialCategory, BankAccount, Transaction

class FinancialCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = FinancialCategory
        fields = ["id", "name", "category_type", "parent", "is_active", "created_at"]
        read_only_fields = ["id", "created_at"]


class BankAccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = BankAccount
        fields = ["id", "name", "account_type", "initial_balance", "current_balance", "is_active", "created_at"]
        read_only_fields = ["id", "current_balance", "created_at"]


class TransactionSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True)
    category_type = serializers.CharField(source="category.category_type", read_only=True)
    bank_account_name = serializers.CharField(source="bank_account.name", read_only=True)

    class Meta:
        model = Transaction
        fields = [
            "id", "farm", "category", "category_name", "category_type",
            "description", "amount", "due_date", "payment_date", "status",
            "reference", "notes", "payment_method", "attachment",
            "bank_account", "bank_account_name", "created_by", "created_at"
        ]
        read_only_fields = ["id", "created_by", "created_at"]

    def validate(self, attrs):
        # Allow only positive amounts, category dictates revenue/expense
        if attrs.get("amount") and attrs["amount"] < 0:
            raise serializers.ValidationError({"amount": "O valor deve ser positivo."})
        return attrs
