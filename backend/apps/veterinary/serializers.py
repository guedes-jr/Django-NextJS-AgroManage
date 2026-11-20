from rest_framework import serializers

from . import selectors
from .models import Category, VeterinaryAnimal, VeterinaryClient, VeterinaryProcedure, VeterinarySettings


class ClientSerializer(serializers.ModelSerializer):
    class Meta:
        model = VeterinaryClient
        fields = ("id", "name", "farm_name", "phone", "created_at")
        read_only_fields = ("id", "created_at")

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Informe o nome do cliente.")
        return value


class AnimalCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = VeterinaryAnimal
        fields = ("id", "category")


class SettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = VeterinarySettings
        fields = (
            "price_insemination", "price_protocol", "price_iatf_insemination", "price_ultrasound",
            "price_palpation", "price_other", "last_responsible",
        )
        read_only_fields = ("last_responsible",)

    def validate(self, attrs):
        for name, value in attrs.items():
            if name.startswith("price_") and value < 0:
                raise serializers.ValidationError({name: "O preço não pode ser negativo."})
        return attrs


PROCEDURE_FIELDS = (
    "id", "date", "kind", "result", "semen", "value", "paid", "notes", "responsible", "category", "conduct",
    "cycling", "management_days", "protocol_start", "return_days", "discard_reason", "coverage_date",
    "gestation_days", "bull", "calving_date", "coverage_method", "step", "step_day", "rescheduled_to",
    "origin_kind", "not_done",
)


class ProcedureSerializer(serializers.ModelSerializer):
    class Meta:
        model = VeterinaryProcedure
        fields = PROCEDURE_FIELDS
        read_only_fields = PROCEDURE_FIELDS


def procedure_data(procedure, today=None):
    data = ProcedureSerializer(procedure).data
    data["gestation_now"] = selectors.gestation_now(procedure, today or selectors.today_or())
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


class BillingUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = VeterinaryProcedure
        fields = ("id", "value", "paid")

    def validate_value(self, value):
        if value < 0:
            raise serializers.ValidationError("O valor não pode ser negativo.")
        return value
