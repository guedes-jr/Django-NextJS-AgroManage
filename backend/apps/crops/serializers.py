"""
Serializers for the crops app.
"""
from rest_framework import serializers

from .models import Field, PlantingCycle, Planting, Fertilization, Fertigation, PesticideApplication, Irrigation, Harvest


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
    class Meta:
        model = Irrigation
        fields = [
            "id", "plantation",
            "date", "start_time", "end_time",
            "pump", "pump_power_kw", "hours",
            "flow_rate_l_per_h", "liters_used",
            "energy_kwh", "kwh_value", "energy_cost",
            "operator", "notes",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "liters_used", "energy_kwh", "energy_cost", "created_at", "updated_at"]


class HarvestSerializer(serializers.ModelSerializer):
    class Meta:
        model = Harvest
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]
