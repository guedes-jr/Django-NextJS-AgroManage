from rest_framework import serializers
from .models import FinancialCategory, BankAccount, Transaction

class FinancialCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = FinancialCategory
        fields = ["id", "name", "category_type", "parent", "is_active", "created_at"]
        read_only_fields = ["id", "created_at"]

    def validate_parent(self, value):
        organization = getattr(getattr(self.context.get("request"), "user", None), "organization", None)
        if value and (not organization or value.organization_id != organization.id):
            raise serializers.ValidationError("A categoria pai não pertence à sua organização.")
        return value


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
        organization = getattr(getattr(self.context.get("request"), "user", None), "organization", None)
        category = attrs.get("category", getattr(self.instance, "category", None))
        farm = attrs.get("farm", getattr(self.instance, "farm", None))
        bank_account = attrs.get("bank_account", getattr(self.instance, "bank_account", None))
        if not organization or not category or category.organization_id != organization.id:
            raise serializers.ValidationError({"category": "A categoria não pertence à sua organização."})
        if farm and farm.organization_id != organization.id:
            raise serializers.ValidationError({"farm": "A propriedade não pertence à sua organização."})
        if bank_account and bank_account.organization_id != organization.id:
            raise serializers.ValidationError({"bank_account": "A conta bancária não pertence à sua organização."})
        return attrs
