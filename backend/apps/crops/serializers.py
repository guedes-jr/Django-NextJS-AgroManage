"""
Serializers for the crops app.
"""
from rest_framework import serializers

from .models import (
    Field,
    PlantingCycle,
    Planting,
    Fertilization,
    Fertigation,
    PesticideApplication,
    Irrigation,
    IrrigationPump,
    SoilAnalysis,
    AgronomistRecommendation,
    AgronomistRecommendationProduct,
    Harvest,
    Tractor,
    LandPreparation,
    LaborWorker,
    LaborRecord,
)


class FieldSerializer(serializers.ModelSerializer):
    farm_name = serializers.CharField(source="farm.name", read_only=True)
    sector_name = serializers.CharField(source="sector.name", read_only=True)

    class Meta:
        model = Field
        fields = [
            "id", "farm", "farm_name", "sector", "sector_name",
            "name", "area_ha", "soil_type", "is_active",
            "irrigation_type", "latitude", "longitude",
            "estimated_yield_capacity_kg",
            "notes", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class PlantingCycleListSerializer(serializers.ModelSerializer):
    field_name = serializers.CharField(source="field.name", read_only=True)
    farm_name = serializers.CharField(source="farm.name", read_only=True)
    crop_type_display = serializers.CharField(source="get_crop_type_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    responsible_name = serializers.SerializerMethodField()

    class Meta:
        model = PlantingCycle
        fields = [
            "id", "name", "field", "field_name", "farm", "farm_name",
            "crop_type", "crop_type_display", "crop_name", "variety",
            "planted_area_ha", "seed_quantity_used",
            "planting_date", "expected_harvest_date",
            "status", "status_display",
            "estimated_production_kg", "estimated_bags",
            "responsible_user", "responsible_name",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_responsible_name(self, obj):
        if not obj.responsible_user:
            return None
        return obj.responsible_user.full_name or obj.responsible_user.email


class PlantingCycleDetailSerializer(serializers.ModelSerializer):
    field_name = serializers.CharField(source="field.name", read_only=True)
    farm_name = serializers.CharField(source="farm.name", read_only=True)
    sector_name = serializers.CharField(source="sector.name", read_only=True)
    crop_type_display = serializers.CharField(source="get_crop_type_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    responsible_name = serializers.SerializerMethodField()

    days_in_cultivation = serializers.IntegerField(read_only=True)
    days_remaining = serializers.IntegerField(read_only=True)
    investment_total = serializers.DecimalField(max_digits=16, decimal_places=2, read_only=True)

    class Meta:
        model = PlantingCycle
        fields = [
            "id", "organization", "farm", "farm_name",
            "field", "field_name", "sector", "sector_name",
            "name", "crop_type", "crop_type_display",
            "crop_name", "variety", "hybrid",
            "planted_area_ha", "seed_quantity_used", "population", "spacing",
            "planting_date", "expected_harvest_date", "actual_harvest_date",
            "status", "status_display",
            "estimated_production_kg", "estimated_bags", "estimated_revenue",
            "responsible_user", "responsible_name",
            "days_in_cultivation", "days_remaining", "investment_total",
            "notes", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_responsible_name(self, obj):
        if not obj.responsible_user:
            return None
        return obj.responsible_user.full_name or obj.responsible_user.email


class PlantingSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source="item.nome", read_only=True)
    supplier_name = serializers.CharField(source="supplier.nome", read_only=True)

    class Meta:
        model = Planting
        fields = [
            "id", "plantation", "item", "item_name",
            "supplier", "supplier_name", "lot",
            "quantity", "unit", "quantity_per_ha",
            "unit_price", "total_price",
            "population", "spacing", "depth",
            "planting_date", "operator", "notes",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class FertilizationSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source="item.nome", read_only=True)
    supplier_name = serializers.CharField(source="supplier.nome", read_only=True)
    application_method_display = serializers.CharField(source="get_application_method_display", read_only=True)

    class Meta:
        model = Fertilization
        fields = [
            "id", "plantation", "item", "item_name",
            "supplier", "supplier_name", "lot",
            "quantity", "unit", "dose_per_ha",
            "unit_price", "total_price",
            "application_method", "application_method_display",
            "area_applied_ha", "application_date",
            "operator", "notes", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class FertigationSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source="item.nome", read_only=True)

    class Meta:
        model = Fertigation
        fields = [
            "id", "plantation", "item", "item_name",
            "lot", "quantity", "unit",
            "syrup_liters", "concentration",
            "application_time_hours", "area_applied_ha",
            "unit_price", "total_price",
            "application_date", "operator", "notes",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class PesticideApplicationSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source="item.nome", read_only=True)
    supplier_name = serializers.CharField(source="supplier.nome", read_only=True)
    pesticide_type_display = serializers.CharField(source="get_pesticide_type_display", read_only=True)

    class Meta:
        model = PesticideApplication
        fields = [
            "id", "plantation", "item", "item_name",
            "pesticide_type", "pesticide_type_display",
            "active_ingredient", "dose",
            "quantity", "unit",
            "supplier", "supplier_name", "lot",
            "unit_price", "total_price",
            "area_applied_ha", "application_date",
            "operator", "target", "equipment",
            "withholding_days", "notes",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class IrrigationSerializer(serializers.ModelSerializer):
    pump_name = serializers.CharField(source="pump_equipment.name", read_only=True)
    pump_power_cv = serializers.DecimalField(source="pump_equipment.power_cv", max_digits=8, decimal_places=2, read_only=True)
    irrigation_system_display = serializers.CharField(source="get_irrigation_system_display", read_only=True)

    class Meta:
        model = Irrigation
        fields = [
            "id", "plantation",
            "date", "start_date", "end_date", "irrigation_system", "irrigation_system_display",
            "start_time", "end_time",
            "pump_equipment", "pump_name", "pump", "pump_power_cv", "pump_power_kw",
            "hours_per_day", "operating_days", "hours",
            "flow_rate_l_per_h", "liters_used",
            "energy_kwh", "kwh_value", "energy_cost",
            "operator", "notes",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "pump_name", "pump_power_cv", "pump_power_kw", "flow_rate_l_per_h",
            "operating_days", "hours", "liters_used", "energy_kwh", "energy_cost",
            "created_at", "updated_at",
        ]

    def validate(self, attrs):
        start_date = attrs.get("start_date") or attrs.get("date")
        end_date = attrs.get("end_date") or start_date
        if start_date and end_date and end_date < start_date:
            raise serializers.ValidationError({"end_date": "A data final não pode ser anterior à data inicial."})

        plantation = attrs.get("plantation") or getattr(self.instance, "plantation", None)
        pump = attrs.get("pump_equipment") or getattr(self.instance, "pump_equipment", None)
        if plantation and pump and pump.organization_id != plantation.organization_id:
            raise serializers.ValidationError({"pump_equipment": "Bomba inválida para esta organização."})

        return attrs


class IrrigationPumpSerializer(serializers.ModelSerializer):
    class Meta:
        model = IrrigationPump
        fields = [
            "id", "organization", "name", "power_cv", "power_kw",
            "flow_rate_l_per_h", "is_active", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "organization", "power_kw", "created_at", "updated_at"]


class SoilAnalysisSerializer(serializers.ModelSerializer):
    field_name = serializers.CharField(source="field.name", read_only=True)
    plantation_name = serializers.CharField(source="plantation.name", read_only=True)
    uploaded_by_name = serializers.SerializerMethodField()
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = SoilAnalysis
        fields = [
            "id", "plantation", "plantation_name", "field", "field_name",
            "file", "file_url", "original_name", "uploaded_by", "uploaded_by_name",
            "notes", "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "field", "original_name", "uploaded_by", "uploaded_by_name",
            "file_url", "created_at", "updated_at",
        ]

    def get_uploaded_by_name(self, obj):
        if not obj.uploaded_by:
            return None
        return obj.uploaded_by.full_name or obj.uploaded_by.email

    def get_file_url(self, obj):
        request = self.context.get("request")
        if not obj.file:
            return None
        url = obj.file.url
        return request.build_absolute_uri(url) if request else url

    def validate_file(self, value):
        max_size = 10 * 1024 * 1024
        if value.size > max_size:
            raise serializers.ValidationError("O arquivo deve ter no máximo 10MB.")
        allowed_extensions = (".pdf", ".jpg", ".jpeg", ".png")
        name = value.name.lower()
        if not name.endswith(allowed_extensions):
            raise serializers.ValidationError("Formatos aceitos: PDF, JPG ou PNG.")
        return value


class AgronomistRecommendationProductSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source="item.nome", read_only=True)

    class Meta:
        model = AgronomistRecommendationProduct
        fields = [
            "id", "item", "item_name", "dose_per_ha", "dose_unit",
            "total_quantity", "total_unit", "notes", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "item_name", "created_at", "updated_at"]


class AgronomistRecommendationSerializer(serializers.ModelSerializer):
    products = AgronomistRecommendationProductSerializer(many=True, required=False)
    field_name = serializers.CharField(source="field.name", read_only=True)
    plantation_name = serializers.CharField(source="plantation.name", read_only=True)
    priority_display = serializers.CharField(source="get_priority_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = AgronomistRecommendation
        fields = [
            "id", "plantation", "plantation_name", "field", "field_name",
            "title", "objective", "recommendation_date", "suggested_application_date",
            "priority", "priority_display", "status", "status_display",
            "area_ha", "created_by", "created_by_name", "products",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "field", "created_by", "created_by_name",
            "priority_display", "status_display", "created_at", "updated_at",
        ]

    def get_created_by_name(self, obj):
        if not obj.created_by:
            return None
        return obj.created_by.full_name or obj.created_by.email

    def validate(self, attrs):
        plantation = attrs.get("plantation") or getattr(self.instance, "plantation", None)
        request = self.context.get("request")
        organization = getattr(getattr(request, "user", None), "organization", None)
        if plantation and organization and plantation.organization_id != organization.id:
            raise serializers.ValidationError({"plantation": "Plantação inválida para esta organização."})
        return attrs

    def create(self, validated_data):
        products_data = validated_data.pop("products", [])
        plantation = validated_data["plantation"]
        request = self.context.get("request")
        recommendation = AgronomistRecommendation.objects.create(
            field=plantation.field,
            area_ha=plantation.planted_area_ha or plantation.field.area_ha,
            created_by=getattr(request, "user", None),
            **validated_data,
        )
        for product_data in products_data:
            AgronomistRecommendationProduct.objects.create(
                recommendation=recommendation,
                **product_data,
            )
        return recommendation

    def update(self, instance, validated_data):
        products_data = validated_data.pop("products", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if products_data is not None:
            instance.products.all().delete()
            for product_data in products_data:
                AgronomistRecommendationProduct.objects.create(
                    recommendation=instance,
                    **product_data,
                )
        return instance


class HarvestSerializer(serializers.ModelSerializer):
    class Meta:
        model = Harvest
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]


class TractorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tractor
        fields = [
            "id", "organization", "name", "brand", "model",
            "power_cv", "plate", "created_at", "updated_at"
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class LandPreparationSerializer(serializers.ModelSerializer):
    tractor_name = serializers.CharField(source="tractor.name", read_only=True)
    tractor_brand = serializers.CharField(source="tractor.brand", read_only=True)
    total_price = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    operation_type_display = serializers.CharField(source="get_operation_type_display", read_only=True)
    execution_type_display = serializers.CharField(source="get_execution_type_display", read_only=True)

    class Meta:
        model = LandPreparation
        fields = [
            "id", "plantation", "date", "operation_type", "operation_type_display",
            "execution_type", "execution_type_display",
            "tractor", "tractor_name", "tractor_brand",
            "hours_worked", "hourly_rate",
            "fuel_liters", "fuel_price",
            "operator", "notes", "total_price",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "total_price", "created_at", "updated_at"]


class LaborWorkerSerializer(serializers.ModelSerializer):
    worker_type_display = serializers.CharField(source="get_worker_type_display", read_only=True)

    class Meta:
        model = LaborWorker
        fields = [
            "id", "organization", "name", "worker_type", "worker_type_display",
            "document", "phone", "is_active", "notes",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "organization", "worker_type_display", "created_at", "updated_at"]


class LaborRecordSerializer(serializers.ModelSerializer):
    worker_name = serializers.CharField(source="worker.name", read_only=True)
    worker_type = serializers.CharField(source="worker.worker_type", read_only=True)
    activity_type_display = serializers.CharField(source="get_activity_type_display", read_only=True)
    payment_method_display = serializers.CharField(source="get_payment_method_display", read_only=True)

    class Meta:
        model = LaborRecord
        fields = [
            "id", "plantation", "worker", "worker_name", "worker_type",
            "activity_type", "activity_type_display",
            "payment_method", "payment_method_display",
            "activity_date", "daily_quantity", "daily_rate", "total_amount",
            "notes", "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "worker_name", "worker_type",
            "activity_type_display", "payment_method_display",
            "total_amount", "created_at", "updated_at",
        ]

    def validate(self, attrs):
        plantation = attrs.get("plantation") or getattr(self.instance, "plantation", None)
        worker = attrs.get("worker") or getattr(self.instance, "worker", None)
        request = self.context.get("request")
        organization = getattr(getattr(request, "user", None), "organization", None)

        if plantation and organization and plantation.organization_id != organization.id:
            raise serializers.ValidationError({"plantation": "Plantação inválida para esta organização."})
        if worker and organization and worker.organization_id != organization.id:
            raise serializers.ValidationError({"worker": "Trabalhador inválido para esta organização."})
        if plantation and worker and plantation.organization_id != worker.organization_id:
            raise serializers.ValidationError({"worker": "Trabalhador não pertence à organização da plantação."})

        daily_quantity = attrs.get("daily_quantity", getattr(self.instance, "daily_quantity", None))
        daily_rate = attrs.get("daily_rate", getattr(self.instance, "daily_rate", None))
        if daily_quantity is not None and daily_quantity <= 0:
            raise serializers.ValidationError({"daily_quantity": "A quantidade de diárias deve ser maior que zero."})
        if daily_rate is not None and daily_rate <= 0:
            raise serializers.ValidationError({"daily_rate": "O valor da diária deve ser maior que zero."})

        notes = attrs.get("notes")
        if notes and len(notes) > 300:
            raise serializers.ValidationError({"notes": "As observações devem ter no máximo 300 caracteres."})

        return attrs
