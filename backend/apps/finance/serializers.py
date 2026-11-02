from django.db import transaction
from django.utils import timezone
from rest_framework import serializers
from .models import FinancialCategory, BankAccount, Transaction, PaymentEvent

class FinancialCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = FinancialCategory
        fields = ["id", "name", "category_type", "parent", "is_active", "created_at"]
        read_only_fields = ["id", "created_at"]

    def validate(self, attrs):
        if self.instance and attrs.get("category_type", self.instance.category_type) != self.instance.category_type and self.instance.transactions.exists():
            raise serializers.ValidationError({"category_type": "Não altere o tipo de uma categoria com lançamentos. Crie uma nova categoria."})
        return attrs

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


    def validate(self, attrs):
        if self.instance and "initial_balance" in attrs and attrs["initial_balance"] != self.instance.initial_balance and self.instance.transactions.exists():
            raise serializers.ValidationError({"initial_balance": "O saldo inicial não pode ser alterado após registrar títulos. Use lançamentos de receita ou despesa."})
        return attrs


class PaymentEventSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True)
    bank_account_name = serializers.CharField(source="bank_account.name", read_only=True)
    class Meta:
        model = PaymentEvent
        fields = ["id", "kind", "amount", "bank_account", "bank_account_name", "payment_date", "payment_method", "reason", "reverses", "created_by_name", "created_at"]
        read_only_fields = fields


class SettlementSerializer(serializers.Serializer):
    bank_account = serializers.PrimaryKeyRelatedField(queryset=BankAccount.objects.all())
    payment_date = serializers.DateField()
    payment_method = serializers.ChoiceField(choices=Transaction.PaymentMethod.choices)
    idempotency_key = serializers.UUIDField()

    def validate_bank_account(self, account):
        if account.organization_id != self.context["request"].user.organization_id:
            raise serializers.ValidationError("A conta não pertence à sua organização.")
        return account


class ReversalSerializer(serializers.Serializer):
    payment = serializers.UUIDField(required=False)
    reason = serializers.CharField(max_length=1000, trim_whitespace=True)
    idempotency_key = serializers.UUIDField()


class SeriesSerializer(serializers.Serializer):
    series_id = serializers.UUIDField()
    kind = serializers.ChoiceField(choices=["installment", "recurrence"])
    count = serializers.IntegerField(min_value=2, max_value=120)
    transaction = serializers.DictField()


class TransactionSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True)
    category_type = serializers.CharField(source="category.category_type", read_only=True)
    bank_account_name = serializers.CharField(source="bank_account.name", read_only=True)
    farm_name = serializers.CharField(source="farm.name", read_only=True)
    species_name = serializers.CharField(source="species.name", read_only=True)
    animal_batch_purpose = serializers.CharField(source="animal_batch.cattle_purpose", read_only=True, default="unknown")
    animal_batch_name = serializers.CharField(source="animal_batch.batch_code", read_only=True)
    planting_cycle_name = serializers.CharField(source="planting_cycle.name", read_only=True)
    payment_events = PaymentEventSerializer(many=True, read_only=True)

    class Meta:
        model = Transaction
        fields = [
            "id", "farm", "category", "category_name", "category_type",
            "description", "amount", "due_date", "payment_date", "status",
            "reference", "notes", "payment_method", "attachment",
            "bank_account", "bank_account_name", "planting_cycle",
            "animal_batch", "species", "created_by", "created_at",
            "farm_name", "species_name", "animal_batch_name", "animal_batch_purpose", "planting_cycle_name", "payment_events",
            "series_id", "series_kind", "series_number", "series_count"
        ]
        read_only_fields = ["id", "created_by", "created_at", "series_id", "series_kind", "series_number", "series_count"]

    @transaction.atomic
    def create(self, validated_data):
        document = super().create(validated_data)
        if document.status == "paid":
            PaymentEvent.objects.create(transaction=document, kind="payment", amount=document.amount, bank_account=document.bank_account, payment_date=document.payment_date, payment_method=document.payment_method or "", created_by=document.created_by, reason="Baixa informada no cadastro do título.")
        return document

    def validate(self, attrs):
        # Allow only positive amounts, category dictates revenue/expense
        if attrs.get("amount") is not None and attrs["amount"] <= 0:
            raise serializers.ValidationError({"amount": "O valor deve ser positivo."})
        if not self.instance and attrs.get("status") == "paid" and (attrs.get("payment_date") or attrs.get("due_date")) > timezone.localdate():
            raise serializers.ValidationError({"payment_date": "A baixa não pode ter data futura."})
        organization = getattr(getattr(self.context.get("request"), "user", None), "organization", None)
        category = attrs.get("category", getattr(self.instance, "category", None))
        farm = attrs.get("farm", getattr(self.instance, "farm", None))
        bank_account = attrs.get("bank_account", getattr(self.instance, "bank_account", None))
        animal_batch = attrs.get("animal_batch", getattr(self.instance, "animal_batch", None))
        if not organization or not category or category.organization_id != organization.id:
            raise serializers.ValidationError({"category": "A categoria não pertence à sua organização."})
        if farm and farm.organization_id != organization.id:
            raise serializers.ValidationError({"farm": "A propriedade não pertence à sua organização."})
        if bank_account and bank_account.organization_id != organization.id:
            raise serializers.ValidationError({"bank_account": "A conta bancária não pertence à sua organização."})
        if animal_batch and animal_batch.farm.organization_id != organization.id:
            raise serializers.ValidationError({"animal_batch": "O lote não pertence à sua organização."})
        if self.instance and self.instance.payment_events.exists():
            protected = {"amount", "category", "bank_account", "status", "payment_date", "payment_method", "farm", "animal_batch", "species", "planting_cycle"}
            changed = [key for key in protected if key in attrs and attrs[key] != getattr(self.instance, key)]
            if changed:
                raise serializers.ValidationError({key: "Este título possui histórico de baixas. Use as ações de baixa/estorno." for key in changed})
        planting_cycle = attrs.get("planting_cycle", getattr(self.instance, "planting_cycle", None))
        if planting_cycle and animal_batch:
            raise serializers.ValidationError({"planting_cycle": "Selecione uma origem produtiva: plantação ou lote animal."})
        if planting_cycle and (planting_cycle.organization_id or planting_cycle.field.farm.organization_id) != getattr(organization, "id", None):
            raise serializers.ValidationError({"planting_cycle": "A plantação não pertence à sua organização."})
        for target_farm in [animal_batch.farm_id if animal_batch else None, (planting_cycle.farm_id or planting_cycle.field.farm_id) if planting_cycle else None]:
            if farm and target_farm and target_farm != farm.pk:
                raise serializers.ValidationError({"farm": "A propriedade deve corresponder ao vínculo produtivo."})
        if not farm:
            if animal_batch:
                attrs["farm"] = animal_batch.farm
            elif planting_cycle:
                attrs["farm"] = planting_cycle.farm or planting_cycle.field.farm
        species = attrs.get("species", getattr(self.instance, "species", None))
        if animal_batch and species and animal_batch.species_id != species.id:
            raise serializers.ValidationError({"species": "A espécie não corresponde ao lote informado."})
        return attrs
