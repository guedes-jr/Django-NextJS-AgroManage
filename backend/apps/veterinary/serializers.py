from rest_framework import serializers

from . import selectors
from .models import (
    Category,
    VeterinaryAnimal,
    VeterinaryAttachment,
    VeterinaryClient,
    VeterinaryClientPrice,
    VeterinaryPrescription,
    VeterinaryProcedure,
    VeterinarySettings,
    VeterinaryTeamMember,
)

HERD_PURPOSES = ("unknown", "beef", "dairy", "dual")


class ClientSerializer(serializers.ModelSerializer):
    """``farm`` links the client to a farm of the organization (herd integration)."""

    herd_purpose = serializers.ChoiceField(choices=HERD_PURPOSES, required=False, write_only=True)

    class Meta:
        model = VeterinaryClient
        fields = ("id", "name", "farm_name", "phone", "farm", "herd_purpose", "created_at")
        read_only_fields = ("id", "created_at")

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        from apps.farms.models import Farm

        request = self.context.get("request")
        organization = getattr(getattr(request, "user", None), "organization", None)
        self.fields["farm"].queryset = Farm.objects.filter(organization=organization) if organization else Farm.objects.none()

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Informe o nome do cliente.")
        return value

    def _purpose(self, instance, validated_data):
        purpose = validated_data.pop("herd_purpose", None)
        if purpose is not None:
            instance.data = {**instance.data, "herd_purpose": purpose}
        return instance

    def create(self, validated_data):
        purpose = validated_data.pop("herd_purpose", None)
        client = super().create(validated_data)
        if purpose is not None:
            client.data = {**client.data, "herd_purpose": purpose}
            client.save(update_fields=["data", "updated_at"])
        return client

    def update(self, instance, validated_data):
        self._purpose(instance, validated_data)
        return super().update(instance, validated_data)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["farm"] = str(instance.farm_id) if instance.farm_id else None
        data["herd_purpose"] = instance.data.get("herd_purpose", "unknown")
        return data


class ClientPriceSerializer(serializers.ModelSerializer):
    class Meta:
        model = VeterinaryClientPrice
        fields = ("id", "client", "kind", "price")
        read_only_fields = ("id",)

    def validate_price(self, value):
        if value < 0:
            raise serializers.ValidationError("O preço não pode ser negativo.")
        return value


class TeamMemberSerializer(serializers.ModelSerializer):
    name = serializers.SerializerMethodField()
    email = serializers.EmailField(source="user.email", read_only=True)
    role = serializers.CharField(source="user.role", read_only=True)

    class Meta:
        model = VeterinaryTeamMember
        fields = ("id", "user", "name", "email", "role", "commission_percent", "active")
        read_only_fields = ("id", "name", "email", "role")

    def get_name(self, obj):
        return (obj.user.full_name or obj.user.email).strip()

    def validate_commission_percent(self, value):
        if value < 0 or value > 100:
            raise serializers.ValidationError("A comissão deve ficar entre 0% e 100%.")
        return value


class AttachmentSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()

    class Meta:
        model = VeterinaryAttachment
        fields = ("id", "animal", "procedure", "name", "kind", "size", "url", "created_at")
        read_only_fields = fields

    def get_url(self, obj):
        return f"/api/v1/veterinary/attachments/{obj.pk}/file/"


class PrescriptionItemSerializer(serializers.Serializer):
    product = serializers.CharField(max_length=150)
    dose = serializers.CharField(max_length=80, allow_blank=True, required=False, default="")
    route = serializers.CharField(max_length=60, allow_blank=True, required=False, default="")
    frequency = serializers.CharField(max_length=80, allow_blank=True, required=False, default="")
    duration = serializers.CharField(max_length=80, allow_blank=True, required=False, default="")


class PrescriptionSerializer(serializers.ModelSerializer):
    items = PrescriptionItemSerializer(many=True)
    animal_identifier = serializers.CharField(source="animal.identifier", read_only=True, default="")
    client_name = serializers.CharField(source="client.name", read_only=True)

    class Meta:
        model = VeterinaryPrescription
        fields = ("id", "client", "client_name", "animal", "animal_identifier", "procedure", "date", "items", "notes", "withdrawal", "created_at")
        read_only_fields = ("id", "client_name", "animal_identifier", "created_at")

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        organization = getattr(getattr(request, "user", None), "organization", None)
        self.fields["client"].queryset = VeterinaryClient.objects.filter(organization=organization)
        self.fields["animal"].queryset = VeterinaryAnimal.objects.filter(organization=organization)
        self.fields["procedure"].queryset = VeterinaryProcedure.objects.filter(organization=organization)

    def validate(self, attrs):
        if not attrs.get("items"):
            raise serializers.ValidationError({"items": "Inclua ao menos um produto."})
        animal, client = attrs.get("animal"), attrs.get("client")
        if animal and client and animal.client_id != client.id:
            raise serializers.ValidationError({"animal": "O animal não pertence a este cliente."})
        return attrs


class AnimalCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = VeterinaryAnimal
        fields = ("id", "category")


class SettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = VeterinarySettings
        fields = (
            "price_insemination", "price_protocol", "price_iatf_insemination", "price_ultrasound",
            "price_palpation", "price_other", "last_responsible", "payment_days", "discount_min_animals",
            "discount_percent", "price_iatf_package", "vet_name", "vet_registry", "vet_phone",
        )
        read_only_fields = ("last_responsible",)

    def validate(self, attrs):
        for name, value in attrs.items():
            if name.startswith("price_") and value is not None and value < 0:
                raise serializers.ValidationError({name: "O preço não pode ser negativo."})
        if not 0 <= attrs.get("discount_percent", 0) <= 100:
            raise serializers.ValidationError({"discount_percent": "O desconto deve ficar entre 0% e 100%."})
        if attrs.get("payment_days", 0) > 365:
            raise serializers.ValidationError({"payment_days": "Use um prazo de até 365 dias."})
        return attrs


PROCEDURE_FIELDS = (
    "id", "date", "kind", "result", "semen", "value", "paid", "notes", "responsible", "category", "conduct",
    "cycling", "management_days", "protocol_start", "return_days", "discard_reason", "coverage_date",
    "gestation_days", "bull", "calving_date", "coverage_method", "step", "step_day", "rescheduled_to",
    "origin_kind", "not_done", "responsible_user",
)


class ProcedureSerializer(serializers.ModelSerializer):
    class Meta:
        model = VeterinaryProcedure
        fields = PROCEDURE_FIELDS
        read_only_fields = PROCEDURE_FIELDS


def procedure_data(procedure, today=None):
    data = ProcedureSerializer(procedure).data
    data["gestation_now"] = selectors.gestation_now(procedure, today or selectors.today_or())
    data["herd_synced"] = "herd" in (procedure.data or {})
    data["pricing"] = (procedure.data or {}).get("pricing")
    return data


def source_data(source):
    if not source:
        return None
    return {key: source[key] for key in ("kind", "insemination_date", "bull", "cycling", "management_days", "protocol_start")}


def animal_data(state, clients, today):
    animal, last = state.animal, state.last
    client = clients.get(animal.client_id)
    nxt = selectors.next_procedure(state)
    current = selectors.status(state)
    return {
        "id": str(animal.id), "client": str(animal.client_id), "client_name": client.name if client else "",
        "farm_name": client.farm_name if client else "", "identifier": animal.identifier, "name": animal.name,
        "category": animal.category, "status": current, "status_tone": selectors.STATUS_TONE[current],
        "next": nxt, "deadline": selectors.deadline(nxt, today), "procedures_count": len(state.procedures),
        "last": procedure_data(last, today) if last else None,
        "source": source_data(selectors.protocol_source(state)) if current in ("protocol", "inseminated") else None,
    }


class RegisterSerializer(serializers.Serializer):
    client = serializers.PrimaryKeyRelatedField(queryset=VeterinaryClient.objects.none(), required=False, allow_null=True)
    new_client_name = serializers.CharField(required=False, allow_blank=True, max_length=150)
    date = serializers.DateField()
    responsible = serializers.CharField(required=False, allow_blank=True, max_length=120)
    animal = serializers.CharField(max_length=60, allow_blank=True)
    category = serializers.ChoiceField(choices=Category.choices, required=False, allow_blank=True)
    diagnosis = serializers.ChoiceField(choices=("pregnant", "open"), required=False, allow_blank=True)
    conduct = serializers.ChoiceField(choices=VeterinaryProcedure.Conduct.choices, required=False, allow_blank=True)
    cycling = serializers.ChoiceField(choices=VeterinaryProcedure.Cycling.choices, required=False, allow_blank=True)
    management_days = serializers.IntegerField(required=False, allow_null=True)
    protocol_start = serializers.DateField(required=False, allow_null=True)
    return_days = serializers.IntegerField(required=False, allow_null=True, min_value=0, max_value=365)
    discard_reason = serializers.ChoiceField(choices=("", "repeat_open", "age", "low_production", "health", "other"), required=False, allow_blank=True)
    coverage_date = serializers.DateField(required=False, allow_null=True)
    gestation_days = serializers.IntegerField(required=False, allow_null=True, min_value=0, max_value=320)
    bull = serializers.CharField(required=False, allow_blank=True, max_length=120)
    calving_date = serializers.DateField(required=False, allow_null=True)
    coverage_method = serializers.ChoiceField(choices=VeterinaryProcedure.CoverageMethod.choices, required=False, allow_blank=True)
    confirm_pregnancy = serializers.BooleanField(required=False, default=False)
    edit = serializers.BooleanField(required=False, default=False)
    step_done = serializers.ChoiceField(choices=("yes", "no"), required=False, allow_blank=True)
    step_date = serializers.DateField(required=False, allow_null=True)
    step_bull = serializers.CharField(required=False, allow_blank=True, max_length=120)
    notes = serializers.CharField(required=False, allow_blank=True, max_length=500)
    inputs = serializers.ListField(child=serializers.DictField(), required=False, max_length=20)
    responsible_user = serializers.UUIDField(required=False, allow_null=True)

    def __init__(self, *args, organization=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["client"].queryset = VeterinaryClient.objects.filter(organization=organization)


class QuickSerializer(serializers.Serializer):
    date = serializers.DateField()
    action = serializers.ChoiceField(choices=("", "insemination", "diagnosis", "protocol"), required=False, allow_blank=True)
    step_done = serializers.ChoiceField(choices=("yes", "no"), required=False, allow_blank=True)
    bull = serializers.CharField(required=False, allow_blank=True, max_length=120)
    notes = serializers.CharField(required=False, allow_blank=True, max_length=500)
    reschedule_to = serializers.DateField(required=False, allow_null=True)
    diagnosis = serializers.ChoiceField(choices=("pregnant", "open"), required=False, allow_blank=True)
    conduct = serializers.ChoiceField(choices=VeterinaryProcedure.Conduct.choices, required=False, allow_blank=True)
    cycling = serializers.ChoiceField(choices=VeterinaryProcedure.Cycling.choices, required=False, allow_blank=True)
    management_days = serializers.IntegerField(required=False, allow_null=True)
    gestation_days = serializers.IntegerField(required=False, allow_null=True, min_value=0, max_value=320)
    coverage_method = serializers.ChoiceField(choices=VeterinaryProcedure.CoverageMethod.choices, required=False, allow_blank=True)
    inputs = serializers.ListField(child=serializers.DictField(), required=False, max_length=20)
    responsible_user = serializers.UUIDField(required=False, allow_null=True)


class BillingUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = VeterinaryProcedure
        fields = ("id", "value", "paid")

    def validate_value(self, value):
        if value < 0:
            raise serializers.ValidationError("O valor não pode ser negativo.")
        return value
