from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from apps.farms.models import Farm
from apps.inventory.serializers import ConsumoRacaoSerializer

from .models import (
    Animal,
    AnimalBatch,
    Breed,
    CattleAnimalProfile,
    CattleGrazing,
    CattleManagement,
    CattleManagementEntry,
    CattleMilkRecord,
    CattleFeedPlan,
    CattleFeedDelivery,
    CattlePasture,
    Species,
)
from .serializers import AnimalSerializer, validate_tenant_relations

CATTLE_CATEGORIES = (
    "Bezerro",
    "Garrote",
    "Novilha",
    "Touro",
    "Matriz",
    "Vaca",
    "Terminação",
    "Reprodutor",
)


def past_date(value):
    if value > timezone.localdate():
        raise serializers.ValidationError("A data não pode estar no futuro.")
    return value


class CattleAnimalSerializer(AnimalSerializer):
    sire_identifier_input = serializers.CharField(write_only=True, required=False, allow_blank=True, max_length=50)
    dam_identifier_input = serializers.CharField(write_only=True, required=False, allow_blank=True, max_length=50)
    category = serializers.ChoiceField(choices=CATTLE_CATEGORIES)
    identifier = serializers.CharField(max_length=50, trim_whitespace=True)
    is_lactating = serializers.SerializerMethodField()
    is_castrated = serializers.BooleanField(
        source="cattle_profile.is_castrated", read_only=True, default=False
    )
    weaning_date = serializers.DateField(
        source="cattle_profile.weaning_date", read_only=True, default=None
    )
    management_group = serializers.CharField(
        source="cattle_profile.management_group", read_only=True, default=""
    )
    milk_withdrawal_until = serializers.DateField(read_only=True, default=None)
    meat_withdrawal_until = serializers.DateField(read_only=True, default=None)

    def get_is_lactating(self, obj):
        profile = getattr(obj, "cattle_profile", None)
        return (
            profile.is_lactating
            if profile
            else obj.gender == "F" and obj.reproductive_status == "lactante"
        )

    class Meta(AnimalSerializer.Meta):
        fields = [
            *AnimalSerializer.Meta.fields,
            "sire_identifier_input", "dam_identifier_input",
            "is_lactating",
            "is_castrated",
            "weaning_date",
            "management_group",
            "milk_withdrawal_until",
            "meat_withdrawal_until",
        ]
        read_only_fields = [
            *AnimalSerializer.Meta.read_only_fields,
            "current_weight_kg",
        ]

    @transaction.atomic
    def create(self, validated_data):
        from .models import WeightRecord

        animal = super().create(validated_data)
        CattleAnimalProfile.objects.create(
            animal=animal,
            is_lactating=animal.gender == "F"
            and animal.reproductive_status == "lactante",
        )
        if animal.initial_weight_kg:
            WeightRecord.objects.create(
                farm=animal.farm,
                species=animal.species,
                animal=animal,
                weight_kg=animal.initial_weight_kg,
                weighing_date=animal.entry_date or timezone.localdate(),
                notes="Peso de entrada no cadastro bovino.",
            )
            animal.refresh_from_db()
        return animal

    def validate(self, attrs):
        farm_id = attrs.get("farm_id", getattr(self.instance, "farm_id", None))
        for field, input_field in [("sire_ref", "sire_identifier_input"), ("dam_ref", "dam_identifier_input")]:
            identifier = attrs.pop(input_field, "").strip()
            if identifier:
                parent = Animal.objects.filter(farm_id=farm_id, farm__organization=self.context["request"].user.organization, species__code="bovinos", identifier=identifier).first()
                if not parent:
                    raise serializers.ValidationError({input_field: "Ascendente identificado não encontrado nesta fazenda."})
                if field in attrs and attrs[field] != parent:
                    raise serializers.ValidationError({input_field: "Os dados do ascendente são conflitantes."})
                attrs[field] = parent
        attrs = super().validate(attrs)
        from .cattle_genealogy import validate_cattle_parentage
        validate_cattle_parentage(self.instance, attrs, farm_id)
        organization = self.context["request"].user.organization
        farm_id = attrs.get("farm_id", getattr(self.instance, "farm_id", None))
        if (
            not farm_id
            or not Farm.objects.filter(pk=farm_id, organization=organization).exists()
        ):
            raise serializers.ValidationError(
                {"farm_id": "Selecione uma fazenda da sua organização."}
            )
        identifier = attrs.get("identifier", getattr(self.instance, "identifier", ""))
        duplicate = Animal.objects.filter(farm_id=farm_id, identifier=identifier)
        if self.instance:
            duplicate = duplicate.exclude(pk=self.instance.pk)
            if "farm_id" in attrs or "species_code_input" in attrs:
                raise serializers.ValidationError(
                    "A fazenda e a espécie não podem ser alteradas neste cadastro."
                )
        if duplicate.exists():
            raise serializers.ValidationError(
                {"identifier": "Este brinco já está cadastrado nesta fazenda."}
            )
        gender = attrs.get("gender", getattr(self.instance, "gender", "F"))
        category = attrs.get("category", getattr(self.instance, "category", None))
        if (category in ["Vaca", "Matriz", "Novilha"] and gender != "F") or (
            category in ["Touro", "Reprodutor"] and gender != "M"
        ):
            raise serializers.ValidationError(
                {"category": "A categoria não corresponde ao sexo do animal."}
            )
        for field in ("birth_date", "entry_date"):
            if attrs.get(field):
                past_date(attrs[field])
        birth = attrs.get("birth_date", getattr(self.instance, "birth_date", None))
        entry = attrs.get("entry_date", getattr(self.instance, "entry_date", None))
        if birth and entry and birth > entry:
            raise serializers.ValidationError(
                {"birth_date": "O nascimento não pode ser posterior à entrada."}
            )
        for field in ("initial_weight_kg", "current_weight_kg"):
            if attrs.get(field) is not None and attrs[field] <= 0:
                raise serializers.ValidationError(
                    {field: "Informe um peso maior que zero."}
                )
        for field in ("batch", "sire_ref", "dam_ref"):
            related = attrs.get(field)
            if related and (
                related.species.code != "bovinos" or related.farm_id != farm_id
            ):
                raise serializers.ValidationError(
                    {field: "Selecione bovinos da mesma fazenda."}
                )
        if not self.instance:
            attrs["species_code_input"] = "bovinos"
        return attrs


class CattleBatchSerializer(serializers.ModelSerializer):
    operations = serializers.SerializerMethodField()

    def get_operations(self, obj):
        from .cattle_operations import feed_forecast
        today = timezone.localdate()
        grazings = getattr(obj, "operational_grazings", [])
        return {"age_days": (today - obj.birth_date).days if obj.birth_date else None,
                "last_weighing_date": getattr(obj, "last_weighing_date", None),
                "identified_animals": getattr(obj, "identified_count", None) or 0,
                "pastures": [{"name": row.pasture.name, "entry_date": row.entry_date, "days": (today - row.entry_date).days} for row in grazings],
                "nutrition": [{"id": row.id, "product": row.item.nome, **feed_forecast(row)} for row in getattr(obj, "operational_feed_plans", [])]}

    farm_id = serializers.PrimaryKeyRelatedField(
        source="farm", queryset=Farm.objects.all()
    )
    farm_name = serializers.CharField(source="farm.name", read_only=True)
    breed_name = serializers.CharField(source="breed.name", read_only=True, default="")
    breed_name_input = serializers.CharField(
        write_only=True, required=False, allow_blank=True, max_length=100
    )
    category = serializers.ChoiceField(choices=CATTLE_CATEGORIES)
    phase = serializers.ChoiceField(
        choices=[
            ("creche", "Cria"),
            ("crescimento", "Recria"),
            ("engorda", "Engorda"),
            ("reproducao", "Reprodução"),
        ]
    )
    quantity = serializers.IntegerField(min_value=1)
    avg_weight_kg = serializers.DecimalField(
        max_digits=8,
        decimal_places=2,
        min_value=Decimal("0.01"),
        required=False,
        allow_null=True,
    )

    class Meta:
        model = AnimalBatch
        fields = [
            "id", "operations",
            "farm_id",
            "farm_name",
            "batch_code",
            "name",
            "category",
            "phase",
            "quantity",
            "gender",
            "origin",
            "purchase_value",
            "entry_date",
            "birth_date",
            "status",
            "avg_weight_kg",
            "breed_name",
            "breed_name_input",
            "notes",
        ]
        read_only_fields = ["status"]

    def validate(self, attrs):
        validate_tenant_relations(self, attrs, ("farm",))
        farm = attrs.get("farm", getattr(self.instance, "farm", None))
        duplicate = AnimalBatch.objects.filter(
            farm=farm,
            batch_code=attrs.get(
                "batch_code", getattr(self.instance, "batch_code", "")
            ),
        )
        if self.instance:
            duplicate = duplicate.exclude(pk=self.instance.pk)
            if farm != self.instance.farm:
                raise serializers.ValidationError(
                    {
                        "farm_id": "Não é possível transferir a fazenda do lote por edição."
                    }
                )
        if duplicate.exists():
            raise serializers.ValidationError(
                {"batch_code": "Código já utilizado nesta fazenda."}
            )
        for field in ("birth_date", "entry_date"):
            if attrs.get(field):
                past_date(attrs[field])
        birth = attrs.get("birth_date", getattr(self.instance, "birth_date", None))
        entry = attrs.get("entry_date", getattr(self.instance, "entry_date", None))
        if birth and entry and birth > entry:
            raise serializers.ValidationError(
                {"birth_date": "O nascimento não pode ser posterior à entrada."}
            )
        return attrs

    def create(self, validated_data):
        breed_name = validated_data.pop("breed_name_input", "")
        species, _ = Species.objects.get_or_create(
            code="bovinos", defaults={"name": "Bovinos"}
        )
        breed = (
            Breed.objects.get_or_create(species=species, name=breed_name)[0]
            if breed_name
            else None
        )
        from .services import open_batch_phase

        with transaction.atomic():
            batch = AnimalBatch.objects.create(
                species=species, breed=breed, **validated_data
            )
            open_batch_phase(batch, batch.phase, batch.entry_date)
            return batch

    def update(self, instance, validated_data):
        validated_data.pop("breed_name_input", None)
        return super().update(instance, validated_data)


class CattlePastureSerializer(serializers.ModelSerializer):
    farm_name = serializers.CharField(source="farm.name", read_only=True)
    area_ha = serializers.DecimalField(
        max_digits=10, decimal_places=2, min_value=Decimal("0.01")
    )
    max_stocking_ua_ha = serializers.DecimalField(
        max_digits=8,
        decimal_places=2,
        min_value=Decimal("0.01"),
        allow_null=True,
        required=False,
    )
    occupancy = serializers.SerializerMethodField()

    def get_occupancy(self, obj):
        grazings = getattr(obj, "active_grazings", None)
        if grazings is None:
            grazings = obj.grazings.filter(
                exit_date__isnull=True, batch__status="active"
            ).select_related("batch")
        heads = sum(row.batch.quantity for row in grazings)
        missing = sum(
            row.batch.quantity for row in grazings if not row.batch.avg_weight_kg
        )
        weight = sum(
            (
                row.batch.quantity * row.batch.avg_weight_kg
                for row in grazings
                if row.batch.avg_weight_kg
            ),
            Decimal(0),
        )
        stocking = (
            weight / Decimal(450) / obj.area_ha
            if obj.area_ha > 0 and not missing
            else None
        )
        return {
            "heads": heads,
            "missing_weight_heads": missing,
            "live_weight_kg": weight,
            "stocking_ua_ha": stocking,
            "occupied_days": max(((timezone.localdate() - row.entry_date).days for row in grazings), default=None),
            "last_exit_date": getattr(obj, "last_exit_date", None),
            "empty_days": (timezone.localdate() - obj.last_exit_date).days if not grazings and getattr(obj, "last_exit_date", None) else None,
            "state": "occupied" if grazings else obj.availability,
            "capacity_percent": stocking / obj.max_stocking_ua_ha * 100
            if stocking is not None and obj.max_stocking_ua_ha
            else None,
        }

    class Meta:
        model = CattlePasture
        fields = [
            "id",
            "farm",
            "farm_name",
            "name",
            "area_ha",
            "max_stocking_ua_ha",
            "occupancy",
            "notes", "availability", "availability_reason",
        ]

    def validate(self, attrs):
        validate_tenant_relations(self, attrs, ("farm",))
        if (
            self.instance
            and attrs.get("farm", self.instance.farm) != self.instance.farm
        ):
            raise serializers.ValidationError(
                {"farm": "A fazenda do pasto não pode ser alterada."}
            )
        state = attrs.get("availability", getattr(self.instance, "availability", "unknown"))
        reason = attrs.get("availability_reason", getattr(self.instance, "availability_reason", ""))
        if state in ["resting", "blocked"]:
            if not reason.strip():
                raise serializers.ValidationError({"availability_reason": "Informe o motivo da restrição do pasto."})
            if self.instance and self.instance.grazings.filter(exit_date__isnull=True, batch__status="active").exists():
                raise serializers.ValidationError({"availability": "Finalize as ocupações antes de restringir o pasto."})
        return attrs

    @transaction.atomic
    def update(self, instance, validated_data):
        self.instance = CattlePasture.objects.select_for_update().get(pk=instance.pk)
        self.validate(validated_data)
        return super().update(self.instance, validated_data)


class CattleGrazingSerializer(serializers.ModelSerializer):
    pasture_name = serializers.CharField(source="pasture.name", read_only=True)
    batch_code = serializers.CharField(source="batch.batch_code", read_only=True)
    quantity = serializers.IntegerField(source="batch.quantity", read_only=True)

    class Meta:
        model = CattleGrazing
        fields = [
            "id",
            "pasture",
            "pasture_name",
            "batch",
            "batch_code",
            "quantity",
            "entry_date",
            "exit_date",
            "notes",
        ]
        read_only_fields = ["exit_date"]
        validators = []

    def validate(self, attrs):
        request = self.context["request"]
        pasture, batch = attrs["pasture"], attrs["batch"]
        if (
            pasture.farm.organization_id != request.user.organization_id
            or batch.farm.organization_id != request.user.organization_id
        ):
            raise serializers.ValidationError(
                "Pasto e lote devem pertencer à sua organização."
            )
        if (
            batch.species.code != "bovinos"
            or batch.status != "active"
            or batch.quantity < 1
            or batch.farm_id != pasture.farm_id
        ):
            raise serializers.ValidationError(
                {"batch": "Selecione um lote bovino ativo da mesma fazenda."}
            )
        past_date(attrs["entry_date"])
        return attrs


class CattleMilkSerializer(serializers.ModelSerializer):
    identifier = serializers.CharField(source="animal.identifier", read_only=True)
    farm_name = serializers.CharField(source="animal.farm.name", read_only=True)
    liters = serializers.DecimalField(
        max_digits=9, decimal_places=2, min_value=Decimal("0.01")
    )
    discarded_liters = serializers.DecimalField(
        max_digits=9, decimal_places=2, min_value=Decimal(0), default=0
    )

    class Meta:
        model = CattleMilkRecord
        fields = [
            "id",
            "animal",
            "identifier",
            "farm_name",
            "date",
            "session",
            "liters",
            "discarded_liters",
            "discard_reason",
            "notes",
        ]

    def validate(self, attrs):
        validate_tenant_relations(self, attrs, ("animal",))
        animal = attrs.get("animal", getattr(self.instance, "animal", None))
        if (
            animal.species.code != "bovinos"
            or animal.gender != "F"
            or animal.status != "active"
            or animal.category not in ["Vaca", "Matriz"]
        ):
            raise serializers.ValidationError(
                {"animal": "Selecione uma vaca ou matriz bovina ativa."}
            )
        day = attrs.get("date", getattr(self.instance, "date", None))
        past_date(day)
        if animal.entry_date and day < animal.entry_date:
            raise serializers.ValidationError(
                {"date": "A ordenha não pode anteceder a entrada."}
            )
        if animal.birth_date and day < animal.birth_date:
            raise serializers.ValidationError(
                {"date": "A ordenha não pode anteceder o nascimento."}
            )
        liters = attrs.get("liters", getattr(self.instance, "liters", 0))
        discarded = attrs.get(
            "discarded_liters", getattr(self.instance, "discarded_liters", 0)
        )
        if discarded > liters:
            raise serializers.ValidationError(
                {"discarded_liters": "O descarte não pode superar a produção."}
            )
        from .cattle_selectors import milk_withdrawal_for

        if milk_withdrawal_for(animal, day) and discarded != liters:
            raise serializers.ValidationError(
                {
                    "discarded_liters": "Animal em carência de leite nesta data: registre o descarte integral."
                }
            )
        reason = attrs.get(
            "discard_reason", getattr(self.instance, "discard_reason", "")
        )
        if discarded > 0 and not reason.strip():
            raise serializers.ValidationError(
                {"discard_reason": "Informe o motivo do descarte."}
            )
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        Animal.objects.select_for_update().get(pk=validated_data["animal"].pk)
        return super().create(self.validate(validated_data))

    @transaction.atomic
    def update(self, instance, validated_data):
        Animal.objects.select_for_update().get(pk=instance.animal_id)
        if (
            "animal" in validated_data
            and validated_data["animal"].pk != instance.animal_id
        ):
            raise serializers.ValidationError(
                {"animal": "Não altere a vaca de uma ordenha existente."}
            )
        return super().update(instance, self.validate(validated_data))


class CattleWeightInput(serializers.Serializer):
    weight_kg = serializers.DecimalField(
        max_digits=8, decimal_places=2, min_value=Decimal("0.01")
    )
    weighing_date = serializers.DateField(validators=[past_date])
    notes = serializers.CharField(required=False, allow_blank=True)


class CattleBirthInput(serializers.Serializer):
    date = serializers.DateField(validators=[past_date])
    outcome = serializers.ChoiceField(choices=["alive", "stillborn"])
    calf_identifier = serializers.CharField(
        max_length=50, required=False, allow_blank=True
    )
    calf_gender = serializers.ChoiceField(choices=["M", "F"], default="F")
    weight_kg = serializers.DecimalField(
        max_digits=8, decimal_places=2, min_value=Decimal("0.01"), required=False
    )
    notes = serializers.CharField(required=False, allow_blank=True)


class CattleEventInput(serializers.Serializer):
    date = serializers.DateField(validators=[past_date])
    kind = serializers.ChoiceField(
        choices=[
            "weaning",
            "castration",
            "dry_off",
            "start_lactation",
            "death",
            "abortion",
        ]
    )
    notes = serializers.CharField(required=False, allow_blank=True)
    weight_kg = serializers.DecimalField(
        max_digits=8, decimal_places=2, min_value=Decimal("0.01"), required=False
    )
    destination_group = serializers.CharField(
        max_length=100, required=False, allow_blank=True
    )


class CattleFeedSerializer(ConsumoRacaoSerializer):
    quantidade = serializers.DecimalField(
        max_digits=10, decimal_places=2, min_value=Decimal("0.01")
    )

    def validate(self, attrs):
        organization = self.context["request"].user.organization
        item = attrs.get("item_estoque")
        batch = attrs.get("lote_animal")
        animals = attrs.get("animais", [])
        if bool(batch) == bool(animals):
            raise serializers.ValidationError(
                "Selecione um lote ou animais identificados."
            )
        if (
            not item
            or item.organization_id != organization.pk
            or item.categoria not in ["racao", "suplemento"]
            or item.especie_animal not in ["", "bovino", "multiplo"]
            or item.unidade_medida != "kg"
        ):
            raise serializers.ValidationError(
                {
                    "item_estoque": "Selecione uma ração ou suplemento em kg indicado para bovinos da sua organização."
                }
            )
        targets = [batch] if batch else animals
        for target in targets:
            if (
                target.farm.organization_id != organization.pk
                or target.species.code != "bovinos"
                or target.status != "active"
            ):
                raise serializers.ValidationError(
                    "Selecione apenas bovinos ativos da sua organização."
                )
        if len({target.farm_id for target in targets}) != 1:
            raise serializers.ValidationError(
                "Os animais devem pertencer à mesma fazenda."
            )
        start, end = attrs["data_inicio"], attrs["data_fim"]
        past_date(start)
        past_date(end)
        if end < start:
            raise serializers.ValidationError(
                {"data_fim": "A data final não pode anteceder a inicial."}
            )
        attrs["categoria_destino"] = "lotes" if batch else "bovinos"
        attrs["fase_destino"] = (
            (batch.phase or "outro") if batch else animals[0].reproductive_status
        )
        return attrs


class CattleVaccinationInput(serializers.Serializer):
    vaccine_name = serializers.CharField(
        max_length=100, required=False, allow_blank=True
    )
    vaccine_item_id = serializers.UUIDField(required=False)
    application_date = serializers.DateField(validators=[past_date])
    dose_type = serializers.ChoiceField(
        choices=["unica", "primeira", "segunda", "terceira", "reforco"], required=False
    )
    dosage_ml = serializers.DecimalField(
        max_digits=8, decimal_places=2, min_value=Decimal("0.01"), required=False
    )
    notes = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        if not attrs.get("vaccine_name") and not attrs.get("vaccine_item_id"):
            raise serializers.ValidationError(
                "Selecione uma vacina do estoque ou informe o nome da vacina aplicada."
            )
        return attrs


class CattleManagementEntrySerializer(serializers.ModelSerializer):
    identifier = serializers.CharField(source="animal.identifier", read_only=True)
    weight_kg = serializers.DecimalField(
        max_digits=8,
        decimal_places=2,
        min_value=Decimal("0.01"),
        allow_null=True,
        required=False,
    )

    class Meta:
        model = CattleManagementEntry
        fields = ["animal", "identifier", "weight_kg"]
        validators = []

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request:
            self.fields["animal"].queryset = Animal.objects.filter(
                farm__organization=request.user.organization, species__code="bovinos"
            ).select_related("farm", "species")


class CattleManagementSerializer(serializers.ModelSerializer):
    farm_name = serializers.CharField(source="farm.name", read_only=True)
    entries = CattleManagementEntrySerializer(
        many=True, allow_empty=False, max_length=1000
    )
    date = serializers.DateField(validators=[past_date])
    cost_per_animal = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal(0), required=False
    )
    treatment_type = serializers.ChoiceField(
        choices=["medication", "exam", "surgery", "other"], required=False
    )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request:
            self.fields["entries"].child.fields[
                "animal"
            ].queryset = Animal.objects.filter(
                farm__organization=request.user.organization, species__code="bovinos"
            ).select_related("farm", "species")

    class Meta:
        model = CattleManagement
        fields = [
            "id",
            "farm",
            "farm_name",
            "kind",
            "date",
            "description",
            "responsible",
            "treatment_type",
            "cost_per_animal",
            "next_procedure_date",
            "milk_withdrawal_until",
            "meat_withdrawal_until",
            "notes",
            "status",
            "created_by",
            "confirmed_by",
            "confirmed_at",
            "cancellation_reason", "follow_up_status", "follow_up_execution", "follow_up_note", "follow_up_resolved_at", "follow_up_resolved_by",
            "entries",
        ]
        read_only_fields = [
            "status",
            "created_by",
            "confirmed_by",
            "confirmed_at",
            "cancellation_reason", "follow_up_status", "follow_up_execution", "follow_up_note", "follow_up_resolved_at", "follow_up_resolved_by",
        ]

    def validate(self, attrs):
        validate_tenant_relations(self, attrs, ("farm",))
        if self.instance and self.instance.status != "draft":
            raise serializers.ValidationError("Somente rascunhos podem ser editados.")
        farm = attrs.get("farm", getattr(self.instance, "farm", None))
        kind = attrs.get("kind", getattr(self.instance, "kind", None))
        day = attrs.get("date", getattr(self.instance, "date", None))
        entries = attrs.get("entries")
        if entries is None and self.instance:
            entries = [
                {"animal": row.animal, "weight_kg": row.weight_kg}
                for row in self.instance.entries.select_related(
                    "animal__farm", "animal__species"
                )
            ]
        seen = set()
        for row in entries or []:
            animal = row["animal"]
            if animal.pk in seen:
                raise serializers.ValidationError(
                    {"entries": "Um animal não pode ser repetido no manejo."}
                )
            seen.add(animal.pk)
            if (
                animal.farm_id != farm.pk
                or animal.species.code != "bovinos"
                or animal.status != "active"
                or (animal.entry_date and day < animal.entry_date)
            ):
                raise serializers.ValidationError(
                    {
                        "entries": f"Revise a fazenda, a situação e a data de {animal.identifier}."
                    }
                )
            if kind == "weighing" and not row.get("weight_kg"):
                raise serializers.ValidationError(
                    {"entries": f"Informe o peso de {animal.identifier}."}
                )
            if kind != "weighing" and row.get("weight_kg"):
                raise serializers.ValidationError(
                    {"entries": "Peso individual pertence ao manejo de pesagem."}
                )
            if kind == "castration" and animal.gender != "M":
                raise serializers.ValidationError(
                    {"entries": "Castração disponível apenas para machos."}
                )
        for field in (
            "next_procedure_date",
            "milk_withdrawal_until",
            "meat_withdrawal_until",
        ):
            value = attrs.get(field, getattr(self.instance, field, None))
            if value and (kind != "sanitary" or value < day):
                raise serializers.ValidationError(
                    {field: "Use uma data igual ou posterior ao manejo sanitário."}
                )
        if kind != "sanitary" and attrs.get(
            "cost_per_animal", getattr(self.instance, "cost_per_animal", 0)
        ):
            raise serializers.ValidationError(
                {"cost_per_animal": "Custo por aplicação pertence ao manejo sanitário."}
            )
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        entries = validated_data.pop("entries")
        management = CattleManagement.objects.create(
            created_by=self.context["request"].user, **validated_data
        )
        CattleManagementEntry.objects.bulk_create(
            [CattleManagementEntry(management=management, **row) for row in entries]
        )
        return management

    @transaction.atomic
    def update(self, instance, validated_data):
        # Serialize editing with confirmation/cancellation; recheck after the lock.
        instance = CattleManagement.objects.select_for_update().get(pk=instance.pk)
        if instance.status != "draft":
            raise serializers.ValidationError("Somente rascunhos podem ser editados.")
        entries = validated_data.pop("entries", None)
        instance = super().update(instance, validated_data)
        if entries is not None:
            instance.entries.all().delete()
            CattleManagementEntry.objects.bulk_create(
                [CattleManagementEntry(management=instance, **row) for row in entries]
            )
        return instance


class CattleAgendaQuery(serializers.Serializer):
    farm = serializers.UUIDField(required=False)
    period = serializers.ChoiceField(choices=["all", "overdue", "today", "upcoming", "current"], default="all")
    kind = serializers.ChoiceField(choices=["all", "birth", "diagnosis", "sanitary"], default="all")


class CattleFollowUpInput(serializers.Serializer):
    status = serializers.ChoiceField(choices=["done", "cancelled"])
    note = serializers.CharField(max_length=500, trim_whitespace=True)
    execution = serializers.PrimaryKeyRelatedField(queryset=CattleManagement.objects.all(), required=False, allow_null=True)

    def validate_execution(self, execution):
        if execution and execution.farm.organization_id != self.context["request"].user.organization_id:
            raise serializers.ValidationError("Manejo fora da sua organização.")
        return execution


class CattleFeedPlanSerializer(serializers.ModelSerializer):
    batch_code = serializers.CharField(source="batch.batch_code", read_only=True)
    farm = serializers.UUIDField(source="batch.farm_id", read_only=True)
    farm_name = serializers.CharField(source="batch.farm.name", read_only=True)
    item_name = serializers.CharField(source="item.nome", read_only=True)
    forecast = serializers.SerializerMethodField()
    kg_per_head_day = serializers.DecimalField(max_digits=8, decimal_places=3, min_value=Decimal("0.001"))

    class Meta:
        model = CattleFeedPlan
        fields = ["id", "batch", "batch_code", "farm", "farm_name", "item", "item_name", "kg_per_head_day", "start_date", "end_date", "is_active", "notes", "forecast"]

    def get_forecast(self, obj):
        from .cattle_operations import feed_forecast
        if not hasattr(obj, "ordered_deliveries"):
            obj.ordered_deliveries = list(obj.deliveries.order_by("-date", "-created_at")[:1])
        return feed_forecast(obj)

    def validate(self, attrs):
        org = self.context["request"].user.organization
        batch = attrs.get("batch", getattr(self.instance, "batch", None))
        item = attrs.get("item", getattr(self.instance, "item", None))
        if not batch or batch.farm.organization_id != org.id or batch.species.code != "bovinos":
            raise serializers.ValidationError({"batch": "Selecione um lote bovino da sua organização."})
        if self.instance and (("batch" in attrs and batch != self.instance.batch) or ("item" in attrs and item != self.instance.item)):
            raise serializers.ValidationError("Não altere a origem de um plano. Encerre-o e cadastre outro.")
        active = attrs.get("is_active", getattr(self.instance, "is_active", True))
        if not item or item.organization_id != org.id:
            raise serializers.ValidationError({"item": "O produto deve pertencer à sua organização."})
        if active and (item.categoria not in ["racao", "suplemento"] or item.unidade_medida != "kg" or item.especie_animal not in ["", "bovino", "multiplo"] or not item.ativo):
            raise serializers.ValidationError({"item": "Selecione ração ou suplemento bovino ativo em kg da sua organização."})
        start = attrs.get("start_date", getattr(self.instance, "start_date", None))
        end = attrs.get("end_date", getattr(self.instance, "end_date", None))
        if active and batch.status != "active":
            raise serializers.ValidationError({"batch": "O lote não está ativo."})
        if end and start and end < start:
            raise serializers.ValidationError({"end_date": "A data final não pode anteceder a inicial."})
        duplicate = CattleFeedPlan.objects.filter(batch=batch, item=item, is_active=True)
        if self.instance: duplicate = duplicate.exclude(pk=self.instance.pk)
        if active and duplicate.exists():
            raise serializers.ValidationError("Já existe um plano ativo deste produto para o lote.")
        return attrs


class CattleFeedDeliverySerializer(serializers.ModelSerializer):
    class Meta:
        model = CattleFeedDelivery
        fields = ["id", "plan", "date", "quantity_kg", "remaining_before_kg", "available_after_kg", "daily_requirement_kg", "head_count", "cost", "notes", "created_at"]
        read_only_fields = fields


class CattleFeedDeliveryInput(serializers.Serializer):
    date = serializers.DateField()
    quantity_kg = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal("0.01"))
    remaining_before_kg = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal(0))
    request_key = serializers.UUIDField()
    notes = serializers.CharField(required=False, allow_blank=True, max_length=1000)
