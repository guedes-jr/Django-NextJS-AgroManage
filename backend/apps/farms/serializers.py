from rest_framework import serializers

from .models import Farm, Sector


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
