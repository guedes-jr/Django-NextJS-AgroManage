from rest_framework import serializers

from .models import Farm, FarmAsset, FarmAssetImplement, FarmStructure, FarmStructureItem, Sector


class FarmSerializer(serializers.ModelSerializer):
    class Meta:
        model = Farm
        fields = [
            "id", "organization", "name", "code", "total_area_ha",
            "state", "city", "address", "latitude", "longitude",
            "is_active", "notes", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "organization", "created_at", "updated_at"]


class SectorSerializer(serializers.ModelSerializer):
    farm_name = serializers.CharField(source="farm.name", read_only=True)

    class Meta:
        model = Sector
        fields = [
            "id", "farm", "farm_name", "name", "sector_type",
            "area_ha", "is_active", "notes", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class FarmStructureItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = FarmStructureItem
        fields = ["id", "structure", "name", "quantity", "unit", "value"]
        read_only_fields = ["id"]


class FarmStructureSerializer(serializers.ModelSerializer):
    farm_name = serializers.CharField(source="farm.name", read_only=True)
    category_label = serializers.CharField(source="get_category_display", read_only=True)
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True)
    items = FarmStructureItemSerializer(many=True, read_only=True)
    items_value = serializers.SerializerMethodField()

    class Meta:
        model = FarmStructure
        fields = [
            "id", "farm", "farm_name", "category", "category_label", "name",
            "description", "built_area_m2", "length_m", "width_m", "quantity",
            "acquisition_value", "current_value",
            "acquisition_date", "is_active", "notes", "created_by",
            "created_by_name", "latitude", "longitude", "items", "items_value", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_by", "created_at", "updated_at"]

    def validate_farm(self, farm):
        request = self.context.get("request")
        organization_id = getattr(getattr(request, "user", None), "organization_id", None)
        if not organization_id or farm.organization_id != organization_id:
            raise serializers.ValidationError("Propriedade inválida para esta organização.")
        return farm

    def get_items_value(self, obj):
        return sum(item.value for item in obj.items.all())


class FarmAssetImplementSerializer(serializers.ModelSerializer):
    class Meta:
        model = FarmAssetImplement
        fields = ["id", "asset", "name", "brand_model", "quantity", "manufacture_year", "acquisition_value"]
        read_only_fields = ["id"]


class FarmAssetSerializer(serializers.ModelSerializer):
    farm_name = serializers.CharField(source="farm.name", read_only=True)
    asset_type_label = serializers.CharField(source="get_asset_type_display", read_only=True)
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True)
    implements = FarmAssetImplementSerializer(many=True, read_only=True)
    implements_value = serializers.SerializerMethodField()

    class Meta:
        model = FarmAsset
        fields = [
            "id", "farm", "farm_name", "asset_type", "asset_type_label", "brand", "model",
            "manufacture_year", "fuel", "traction", "current_hours", "power", "tank_capacity_l",
            "serial_number", "transmission", "acquisition_date", "acquisition_value", "current_value",
            "description", "latitude", "longitude", "is_active", "created_by", "created_by_name",
            "implements", "implements_value", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_by", "created_at", "updated_at"]

    def validate_farm(self, farm):
        request = self.context.get("request")
        organization_id = getattr(getattr(request, "user", None), "organization_id", None)
        if not organization_id or farm.organization_id != organization_id:
            raise serializers.ValidationError("Propriedade inválida para esta organização.")
        return farm

    def get_implements_value(self, obj):
        return sum(item.acquisition_value * item.quantity for item in obj.implements.all())
