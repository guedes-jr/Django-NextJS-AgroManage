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
    CattleMilkRecord, CattleMilkDailyTotal,
    CattleFeedPlan,
    CattleFeedDelivery,
    CattleTroughReading,
    CattlePasture,
    HistoricoEvento,
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
    cattle_purpose = serializers.ChoiceField(choices=["unknown", "beef", "dairy", "dual"], required=False)
    name = serializers.CharField(source="cattle_profile.name", required=False, allow_blank=True, default="", max_length=100)
    coat_color = serializers.CharField(source="cattle_profile.coat_color", required=False, allow_blank=True, default="", max_length=80)
    birth_weight_kg = serializers.DecimalField(source="cattle_profile.birth_weight_kg", max_digits=7, decimal_places=2, min_value=Decimal("0.01"), required=False, allow_null=True, default=None)
    genealogical_registration = serializers.CharField(source="cattle_profile.genealogical_registration", max_length=80, required=False, allow_blank=True, default="")
    dairy_aptitude = serializers.BooleanField(source="cattle_profile.dairy_aptitude", required=False, default=False)
    beef_aptitude = serializers.BooleanField(source="cattle_profile.beef_aptitude", required=False, default=False)
    embryo_role = serializers.ChoiceField(source="cattle_profile.embryo_role", choices=["", "donor", "recipient"], allow_blank=True, required=False, default="")
    historical_birth_count = serializers.IntegerField(source="cattle_profile.historical_birth_count", min_value=0, max_value=32767, required=False, default=0)
    historical_last_birth_date = serializers.DateField(source="cattle_profile.historical_last_birth_date", required=False, allow_null=True, default=None)
    last_mating_date = serializers.DateField(read_only=True, default=None)
    expected_birth_date = serializers.DateField(read_only=True, default=None)
    gestation_days = serializers.SerializerMethodField()
    initial_weaning_date = serializers.DateField(write_only=True, required=False, allow_null=True)
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

    def to_representation(self, instance):
        result = super().to_representation(instance)
        result["name"] = getattr(getattr(instance, "cattle_profile", None), "name", "")
        profile = getattr(instance, "cattle_profile", None)
        for field, default in {"coat_color": "", "genealogical_registration": "", "dairy_aptitude": False, "beef_aptitude": False, "embryo_role": "", "historical_birth_count": 0}.items():
            if profile is None:
                result[field] = default
        return result

    def get_is_lactating(self, obj):
        profile = getattr(obj, "cattle_profile", None)
        return (
            profile.is_lactating
            if profile
            else obj.gender == "F" and obj.reproductive_status == "lactante"
        )

    def get_gestation_days(self, obj):
        start = getattr(obj, "pregnancy_start_date", None)
        return max(0, (timezone.localdate() - start).days) if start else None

    class Meta(AnimalSerializer.Meta):
        fields = [
            *AnimalSerializer.Meta.fields,
            "name", "cattle_purpose",
            "coat_color", "birth_weight_kg", "genealogical_registration", "dairy_aptitude", "beef_aptitude", "embryo_role", "historical_birth_count", "historical_last_birth_date", "last_mating_date", "expected_birth_date",
            "initial_weaning_date",
            "gestation_days",
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

        Farm.objects.select_for_update().get(pk=validated_data["farm_id"])
        if Animal.objects.filter(farm_id=validated_data["farm_id"], identifier=validated_data["identifier"]).exists():
            raise serializers.ValidationError({"identifier": "Brinco já cadastrado nesta fazenda."})
        profile_data = validated_data.pop("cattle_profile", {})
        if "initial_weaning_date" in validated_data:
            profile_data["weaning_date"] = validated_data.pop("initial_weaning_date")
        animal = super().create(validated_data)
        CattleAnimalProfile.objects.create(
            animal=animal,
            **profile_data,
            is_lactating=animal.gender == "F"
            and animal.reproductive_status == "lactante",
        )
        from .cattle_improvements import remember_purpose
        remember_purpose(animal, "unknown", self.context["request"].user)
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

    @transaction.atomic
    def update(self, instance, validated_data):
        Farm.objects.select_for_update().get(pk=instance.farm_id)
        from .cattle_selectors import cattle_withdrawals, with_cattle_reproduction
        instance = cattle_withdrawals(with_cattle_reproduction(Animal.objects.select_for_update())).get(pk=instance.pk)
        linked_batch = validated_data.get("batch", instance.batch)
        if linked_batch and linked_batch.cattle_purpose != validated_data.get("cattle_purpose", instance.cattle_purpose):
            raise serializers.ValidationError({"cattle_purpose": "A finalidade do lote mudou. Confira a classificação antes de salvar."})
        profile_data = validated_data.pop("cattle_profile", {})
        previous_purpose = instance.cattle_purpose
        animal = super().update(instance, validated_data)
        from .cattle_improvements import remember_purpose
        remember_purpose(animal, previous_purpose, self.context["request"].user)
        if profile_data:
            from .cattle_services import cattle_profile
            profile = cattle_profile(animal)
            for field, value in profile_data.items():
                setattr(profile, field, value)
            profile.save(update_fields=[*profile_data, "updated_at"])
            animal.cattle_profile = profile
        return animal

    def validate(self, attrs):
        if "initial_weaning_date" in attrs:
            if self.instance:
                raise serializers.ValidationError({"initial_weaning_date": "Registre o desmame pelo manejo do animal."})
            day = attrs["initial_weaning_date"]
            if day:
                past_date(day)
                if attrs.get("birth_date") and day < attrs["birth_date"]:
                    raise serializers.ValidationError({"initial_weaning_date": "O desmame não pode anteceder o nascimento."})
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
        linked_batch = attrs.get("batch", getattr(self.instance, "batch", None))
        purpose = attrs.get("cattle_purpose", getattr(self.instance, "cattle_purpose", "unknown"))
        if linked_batch and linked_batch.cattle_purpose != purpose:
            raise serializers.ValidationError({"cattle_purpose": "Use a mesma finalidade do lote ou classifique o lote e seus participantes pela Central de manejo."})
        from .cattle_genealogy import validate_cattle_parentage
        validate_cattle_parentage(self.instance, attrs, farm_id)
        organization = self.context["request"].user.organization
        farm_id = attrs.get("farm_id", getattr(self.instance, "farm_id", None))
        import_farm = self.context.get('validated_import_farm')
        import_existing = self.context.get('import_existing_identifiers')
        bulk_preview = bool(import_farm is not None and isinstance(import_existing, set)
            and import_farm.pk == farm_id and import_farm.organization_id == organization.pk)
        if (
            not farm_id
            or not bulk_preview and not Farm.objects.filter(pk=farm_id, organization=organization).exists()
        ):
            raise serializers.ValidationError(
                {"farm_id": "Selecione uma fazenda da sua organização."}
            )
        identifier = attrs.get("identifier", getattr(self.instance, "identifier", ""))
        duplicate = Animal.objects.filter(farm_id=farm_id, identifier=identifier)
        if self.instance:
            bulk_preview = False
            duplicate = duplicate.exclude(pk=self.instance.pk)
            if "farm_id" in attrs or "species_code_input" in attrs:
                raise serializers.ValidationError(
                    "A fazenda e a espécie não podem ser alteradas neste cadastro."
                )
        duplicate_found = identifier in import_existing if bulk_preview else duplicate.exists()
        if duplicate_found:
            raise serializers.ValidationError(
                {"identifier": "Este brinco já está cadastrado nesta fazenda."}
            )
        gender = attrs.get("gender", getattr(self.instance, "gender", "F"))
        profile_values = attrs.get("cattle_profile", {})
        historical_last = profile_values.get("historical_last_birth_date", getattr(getattr(self.instance, "cattle_profile", None), "historical_last_birth_date", None))
        historical_count = profile_values.get("historical_birth_count", getattr(getattr(self.instance, "cattle_profile", None), "historical_birth_count", 0))
        embryo_role = profile_values.get("embryo_role", getattr(getattr(self.instance, "cattle_profile", None), "embryo_role", ""))
        if gender == "M" and (historical_last or historical_count or embryo_role):
            raise serializers.ValidationError("Partos anteriores e função embrionária são informações de fêmeas.")
        if historical_last:
            past_date(historical_last)
            if not historical_count:
                raise serializers.ValidationError({"historical_birth_count": "Informe a quantidade de partos anteriores."})
            birth_day = attrs.get("birth_date", getattr(self.instance, "birth_date", None))
            if birth_day and historical_last <= birth_day:
                raise serializers.ValidationError({"historical_last_birth_date": "O último parto deve ser posterior ao nascimento."})
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
    purchase_due_date = serializers.DateField(write_only=True, required=False)
    operations = serializers.SerializerMethodField()

    def get_operations(self, obj):
        today = timezone.localdate()
        grazings = getattr(obj, "operational_grazings", [])
        return {"age_days": (today - obj.birth_date).days if obj.birth_date else None,
                "last_weighing_date": getattr(obj, "last_weighing_date", None),
                "identified_animals": getattr(obj, "identified_count", None) or 0,
                "pastures": [{"name": row.pasture.name, "entry_date": row.entry_date, "days": (today - row.entry_date).days} for row in grazings]}

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
            "id", "operations", "cattle_purpose",
            "farm_id",
            "farm_name",
            "batch_code",
            "name",
            "category",
            "phase",
            "quantity",
            "gender",
            "origin",
            "purchase_value", "purchase_due_date",
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
        if self.instance and "purchase_due_date" in attrs:
            raise serializers.ValidationError({"purchase_due_date": "Altere o vencimento existente pelo título de compra no financeiro."})
        from .cattle_herd import validate_headcount_edit
        validate_headcount_edit(self.instance, attrs)
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
        purchase_due_date = validated_data.pop("purchase_due_date", None)
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
            if purchase_due_date:
                from apps.finance.models import Transaction
                Transaction.objects.filter(organization=batch.farm.organization, reference=f"PURCHASE-BATCH-{batch.pk}").update(due_date=purchase_due_date)
            from .cattle_improvements import remember_purpose
            remember_purpose(batch, "unknown", self.context["request"].user)
            open_batch_phase(batch, batch.phase, batch.entry_date)
            HistoricoEvento.objects.create(
                farm=batch.farm, lote=batch, tipo_evento="Entrada de Lote", data_evento=batch.entry_date,
                descricao=f"Entrada de {batch.quantity} animais no lote {batch.batch_code}.",
                metadata={"peso_medio_entrada": str(batch.avg_weight_kg) if batch.avg_weight_kg else None, "quantidade": batch.quantity, "quantity_before": 0, "quantity_after": batch.quantity,
                          "responsible_id": str(self.context["request"].user.pk)},
            )
            return batch

    def update(self, instance, validated_data):
        validated_data.pop("purchase_due_date", None)
        validated_data.pop("breed_name_input", None)
        with transaction.atomic():
            Farm.objects.select_for_update().get(pk=instance.farm_id)
            instance = AnimalBatch.objects.select_for_update().get(pk=instance.pk)
            previous = instance.cattle_purpose
            result = super().update(instance, validated_data)
            from .cattle_improvements import remember_purpose
            remember_purpose(result, previous, self.context["request"].user)
            return result


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
        from apps.farms.models import Farm
        from .models import CattleMilkDailyTotal
        animal = validated_data["animal"]
        Farm.objects.select_for_update().get(pk=animal.farm_id)
        Animal.objects.select_for_update().get(pk=animal.pk)
        from .cattle_milk import milk_totals_covering
        if milk_totals_covering(CattleMilkDailyTotal.objects.filter(farm_id=animal.farm_id), validated_data["date"]).exists():
            raise serializers.ValidationError({"date": "Já existe produção total nesta fazenda e data. Corrija ou remova o total antes de lançar por vaca."})
        if CattleMilkRecord.objects.filter(animal=animal, date=validated_data["date"], session=validated_data["session"]).exists():
            raise serializers.ValidationError({"session": "Já existe ordenha desta vaca na data e turno. Corrija o lançamento existente."})
        return super().create(self.validate(validated_data))

    @transaction.atomic
    def update(self, instance, validated_data):
        from apps.farms.models import Farm
        from .models import CattleMilkDailyTotal
        Farm.objects.select_for_update().get(pk=instance.animal.farm_id)
        Animal.objects.select_for_update().get(pk=instance.animal_id)
        from .cattle_milk import milk_totals_covering
        if milk_totals_covering(CattleMilkDailyTotal.objects.filter(farm_id=instance.animal.farm_id), validated_data.get("date", instance.date)).exists():
            raise serializers.ValidationError({"date": "Já existe produção total nesta fazenda e data."})
        if (
            "animal" in validated_data
            and validated_data["animal"].pk != instance.animal_id
        ):
            raise serializers.ValidationError(
                {"animal": "Não altere a vaca de uma ordenha existente."}
            )
        from .milk_tanks import protect_production
        old_day = instance.date
        result = super().update(instance, self.validate(validated_data))
        if not self.context.get('defer_milk_tank_check'):
            protect_production(result.animal.farm, old_day, result.date)
        return result


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
            or item.categoria not in ["racao", "suplemento", "nucleo"]
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
            "cost_per_animal", "inventory_lot", "inventory_quantity_per_animal", "inventory_movement", "inventory_cost_snapshot",
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
            "status", "inventory_movement", "inventory_cost_snapshot",
            "created_by",
            "confirmed_by",
            "confirmed_at",
            "cancellation_reason", "follow_up_status", "follow_up_execution", "follow_up_note", "follow_up_resolved_at", "follow_up_resolved_by",
        ]

    def validate(self, attrs):
        validate_tenant_relations(self, attrs, ("farm",))
        from .cattle_stock_management import validate_management_stock
        candidate = CattleManagement(**{key: attrs.get(key, getattr(self.instance, key, None)) for key in ["kind", "date", "inventory_lot", "inventory_quantity_per_animal", "milk_withdrawal_until", "meat_withdrawal_until"]})
        validate_management_stock(candidate, self.context["request"].user.organization)
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
        fields = ["id", "version", "batch", "batch_code", "farm", "farm_name", "item", "item_name", "kg_per_head_day", "start_date", "end_date", "is_active", "notes", "forecast"]
        read_only_fields = ["version"]

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
        if active and (item.categoria not in ["racao", "suplemento", "nucleo"] or item.unidade_medida != "kg" or item.especie_animal not in ["", "bovino", "multiplo"] or not item.ativo):
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
        fields = ["id", "plan", "plan_version", "date", "quantity_kg", "remaining_before_kg", "available_after_kg", "daily_requirement_kg", "head_count", "cost", "notes", "created_at"]
        read_only_fields = fields


class CattleFeedDeliveryInput(serializers.Serializer):
    date = serializers.DateField()
    quantity_kg = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal("0.01"))
    remaining_before_kg = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal(0))
    request_key = serializers.UUIDField()
    notes = serializers.CharField(required=False, allow_blank=True, max_length=1000)


class CattleTroughReadingSerializer(serializers.ModelSerializer):
    recorded_by = serializers.CharField(source="created_by.full_name", read_only=True, default="")
    batch_code = serializers.CharField(source="batch.batch_code", read_only=True)
    farm_name = serializers.CharField(source="batch.farm.name", read_only=True)

    class Meta:
        model = CattleTroughReading
        fields = ["id", "batch", "batch_code", "farm_name", "formula", "formula_name", "date", "session", "score", "remaining_kg", "head_count", "notes", "recorded_by", "created_at"]
        read_only_fields = fields


class CattleTroughReadingInput(serializers.Serializer):
    batch = serializers.UUIDField()
    formula = serializers.UUIDField(required=False, allow_null=True, default=None)
    date = serializers.DateField()
    session = serializers.ChoiceField(choices=["morning", "afternoon", "evening"])
    score = serializers.IntegerField(min_value=0, max_value=4)
    remaining_kg = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal(0), allow_null=True, required=False, default=None)
    request_key = serializers.UUIDField()
    notes = serializers.CharField(required=False, allow_blank=True, max_length=1000)


class CattleDailyFeedInput(serializers.Serializer):
    production = serializers.ChoiceField(choices=['beef', 'dairy'], required=False)
    farm = serializers.UUIDField(required=False)
    batch = serializers.UUIDField()
    formula = serializers.UUIDField(required=False, allow_null=True, default=None)
    item = serializers.UUIDField(required=False, allow_null=True, default=None)
    date = serializers.DateField()
    quantity_kg = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal("0.01"))
    request_key = serializers.UUIDField()
    notes = serializers.CharField(required=False, allow_blank=True, max_length=1000)


class CattleMilkDailyTotalSerializer(serializers.ModelSerializer):
    farm_name = serializers.CharField(source="farm.name", read_only=True)
    liters = serializers.DecimalField(max_digits=11, decimal_places=2, min_value=Decimal("0.01"))
    discarded_liters = serializers.DecimalField(max_digits=11, decimal_places=2, min_value=Decimal(0), default=0)

    class Meta:
        model = CattleMilkDailyTotal
        fields = ["id", "farm", "farm_name", "date", "period_start", "liters", "discarded_liters", "discard_reason", "notes"]

    def is_mobile(self):
        return getattr(self.context.get("request"), "query_params", {}).get("view") == "mobile"

    def validate(self, attrs):
        validate_tenant_relations(self, attrs, ("farm",))
        day = attrs.get("date", getattr(self.instance, "date", None))
        past_date(day)
        start = attrs.get("period_start", getattr(self.instance, "period_start", None)) or day
        past_date(start)
        if start > day:
            raise serializers.ValidationError({"period_start": "A data inicial não pode ser posterior à final."})
        if self.is_mobile():
            if start != day or (self.instance and (self.instance.period_start or self.instance.date) != self.instance.date):
                raise serializers.ValidationError({"period_start": "Totais por período são somente leitura no app. Confira o lançamento no sistema web."})
            if self.instance and day != self.instance.date:
                raise serializers.ValidationError({"date": "A data é preservada na correção pelo app."})
        liters = attrs.get("liters", getattr(self.instance, "liters", 0))
        discarded = attrs.get("discarded_liters", getattr(self.instance, "discarded_liters", 0))
        if discarded > liters:
            raise serializers.ValidationError({"discarded_liters": "O descarte não pode superar a produção."})
        if discarded and not attrs.get("discard_reason", getattr(self.instance, "discard_reason", "")).strip():
            raise serializers.ValidationError({"discard_reason": "Informe o motivo do descarte."})
        if self.instance and attrs.get("farm", self.instance.farm) != self.instance.farm:
            raise serializers.ValidationError({"farm": "Não altere a fazenda de um lançamento existente."})
        if self.instance and not self.context.get('dairy_worksheet'):
            state = getattr(self.instance, 'worksheet', None)
            if state and state.feed_allocations and (day != self.instance.date or start != (self.instance.period_start or self.instance.date)):
                raise serializers.ValidationError({"period_start": "Corrija o período na planilha leiteira para conferir também a alimentação vinculada."})
        return attrs

    def locked_save(self, attrs):
        from apps.farms.models import Farm
        farm = attrs.get("farm", getattr(self.instance, "farm", None))
        day = attrs.get("date", getattr(self.instance, "date", None))
        Farm.objects.select_for_update().get(pk=farm.pk)
        from .cattle_milk import milk_totals_covering
        start = attrs.get("period_start", getattr(self.instance, "period_start", None)) or day
        existing = milk_totals_covering(CattleMilkDailyTotal.objects.filter(farm=farm), start, day)
        if self.instance:
            existing = existing.exclude(pk=self.instance.pk)
        if existing.exists():
            raise serializers.ValidationError({"date": "Já existe um total nesta fazenda e data. Corrija o lançamento existente."})
        if CattleMilkRecord.objects.filter(animal__farm=farm, date__range=(start, day)).exists():
            raise serializers.ValidationError({"date": "Já existem ordenhas individuais nesta fazenda e data. Use o resumo das vacas; o total não pode ser somado novamente."})

    @transaction.atomic
    def create(self, validated_data):
        self.locked_save(validated_data)
        return super().create(validated_data)

    @transaction.atomic
    def update(self, instance, validated_data):
        if self.is_mobile():
            from django.shortcuts import get_object_or_404
            Farm.objects.select_for_update().get(pk=instance.farm_id)
            instance = get_object_or_404(CattleMilkDailyTotal.objects.select_for_update(), pk=instance.pk)
            self.instance = instance
            validated_data = self.validate(validated_data)
        self.locked_save(validated_data)
        from .milk_tanks import protect_production
        old_day = instance.date
        result = super().update(instance, validated_data)
        protect_production(result.farm, old_day, result.date)
        return result


class CattleSaleInput(serializers.Serializer):
    mode = serializers.ChoiceField(choices=["whole", "partial"])
    quantity = serializers.IntegerField(min_value=1, required=False)
    date = serializers.DateField(validators=[past_date])
    due_date = serializers.DateField(required=False)
    buyer = serializers.CharField(max_length=200)
    responsible = serializers.CharField(required=False, allow_blank=True, max_length=200)
    notes = serializers.CharField(required=False, allow_blank=True)
    weight_kg = serializers.DecimalField(max_digits=12, decimal_places=3, min_value=Decimal(".001"))
    pricing_basis = serializers.ChoiceField(choices=["live_kg", "carcass_arroba"], default="live_kg")
    price_per_kg = serializers.DecimalField(max_digits=12, decimal_places=6, min_value=Decimal(".000001"), required=False)
    price_per_arroba = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal(".01"), required=False)
    carcass_weight_kg = serializers.DecimalField(max_digits=12, decimal_places=3, min_value=Decimal(".001"), required=False)
    yield_percent = serializers.DecimalField(max_digits=5, decimal_places=2, min_value=Decimal(".01"), max_value=100, required=False)
    deductions = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0, default=0)
    deduction_description = serializers.CharField(max_length=500, required=False, allow_blank=True)
    slaughter_reference = serializers.CharField(max_length=200, required=False, allow_blank=True)

    def validate(self, attrs):
        if attrs["mode"] == "partial" and "quantity" not in attrs:
            raise serializers.ValidationError({"quantity": "Informe a quantidade vendida."})
        if attrs["date"] < self.context["batch"].entry_date:
            raise serializers.ValidationError({"date": "A venda não pode anteceder a entrada."})
        if attrs["pricing_basis"] == "carcass_arroba":
            if not attrs.get("price_per_arroba") or not (attrs.get("carcass_weight_kg") or attrs.get("yield_percent")):
                raise serializers.ValidationError("Informe preço por arroba e peso de carcaça ou rendimento.")
            carcass = attrs.get("carcass_weight_kg") or attrs["weight_kg"] * attrs["yield_percent"] / 100
            if carcass > attrs["weight_kg"]:
                raise serializers.ValidationError({"carcass_weight_kg": "Carcaça não pode superar o peso vivo."})
            attrs["carcass_estimated"] = not bool(attrs.get("carcass_weight_kg"))
            attrs["carcass_weight_kg"] = carcass
            gross = carcass / 15 * attrs["price_per_arroba"]
            attrs["price_per_kg"] = gross / attrs["weight_kg"]
        else:
            if not attrs.get("price_per_kg"):
                raise serializers.ValidationError({"price_per_kg": "Informe o preço por kg vivo."})
            gross = attrs["weight_kg"] * attrs["price_per_kg"]
        attrs["gross_amount"] = gross.quantize(Decimal(".01"))
        if attrs["deductions"] and not attrs.get("deduction_description"):
            raise serializers.ValidationError({"deduction_description": "Descreva os descontos informados."})
        if attrs["deductions"] >= attrs["gross_amount"]:
            raise serializers.ValidationError({"deductions": "Descontos devem ser menores que a receita bruta."})
        attrs["net_amount"] = attrs["gross_amount"] - attrs["deductions"]
        return attrs
