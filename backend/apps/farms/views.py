from django.db.models import Count, DecimalField, F, Sum
from django.db.models.functions import Coalesce
from rest_framework import permissions, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from common.permissions import OrganizationRolePermission

from .models import Farm, FarmAsset, FarmAssetImplement, FarmStructure, FarmStructureItem, Sector
from .serializers import (
    FarmAssetImplementSerializer,
    FarmAssetSerializer,
    FarmSerializer,
    FarmStructureSerializer,
    FarmStructureItemSerializer,
    SectorSerializer,
)


class FarmViewSet(viewsets.ModelViewSet):
    serializer_class = FarmSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        organization = getattr(self.request.user, "organization", None)
        if not organization:
            return Farm.objects.none()
        return Farm.objects.filter(organization=organization)

    def perform_create(self, serializer):
        organization = getattr(self.request.user, "organization", None)
        if not organization:
            raise serializers.ValidationError({"organization": "Usuário sem organização vinculada."})
        serializer.save(organization=organization)


class SectorViewSet(viewsets.ModelViewSet):
    serializer_class = SectorSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        organization = getattr(self.request.user, "organization", None)
        if not organization:
            return Sector.objects.none()
        return Sector.objects.filter(farm__organization=organization).select_related("farm")

    def perform_create(self, serializer):
        farm = serializer.validated_data.get("farm")
        organization = getattr(self.request.user, "organization", None)
        if not organization or farm.organization_id != organization.id:
            raise serializers.ValidationError({"farm": "Propriedade inválida para esta organização."})
        serializer.save()


class FarmStructureViewSet(viewsets.ModelViewSet):
    serializer_class = FarmStructureSerializer
    permission_classes = [OrganizationRolePermission]
    write_roles = {"owner", "admin", "manager", "operator"}
    delete_roles = {"owner", "admin"}
    operator_edits_own_only = True
    filterset_fields = ("farm", "category", "is_active")
    search_fields = ("name", "description", "notes")
    ordering_fields = ("name", "category", "acquisition_value", "current_value", "created_at")
    ordering = ("category", "name")

    def get_queryset(self):
        organization = getattr(self.request.user, "organization", None)
        if not organization:
            return FarmStructure.objects.none()
        return FarmStructure.objects.filter(farm__organization=organization).select_related(
            "farm", "created_by"
        ).prefetch_related("items")

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=False, methods=["get"])
    def summary(self, request):
        queryset = self.filter_queryset(self.get_queryset()).filter(is_active=True)
        totals = queryset.aggregate(
            total_records=Count("id"),
            total_items=Coalesce(Sum("quantity"), 0),
            acquisition_value=Coalesce(
                Sum(F("acquisition_value") * F("quantity")),
                0,
                output_field=DecimalField(max_digits=20, decimal_places=2),
            ),
            current_value=Coalesce(
                Sum(F("current_value") * F("quantity")),
                0,
                output_field=DecimalField(max_digits=20, decimal_places=2),
            ),
        )
        structure_items_value = FarmStructureItem.objects.filter(structure__in=queryset).aggregate(
            total=Coalesce(Sum("value"), 0, output_field=DecimalField(max_digits=20, decimal_places=2))
        )["total"]
        totals["acquisition_value"] += structure_items_value
        categories = queryset.values("category").annotate(
            records=Count("id"),
            items=Coalesce(Sum("quantity"), 0),
            acquisition_value=Coalesce(
                Sum(F("acquisition_value") * F("quantity")),
                0,
                output_field=DecimalField(max_digits=20, decimal_places=2),
            ),
            current_value=Coalesce(
                Sum(F("current_value") * F("quantity")),
                0,
                output_field=DecimalField(max_digits=20, decimal_places=2),
            ),
        )
        labels = dict(FarmStructure.Category.choices)
        return Response({
            **totals,
            "structure_items_value": structure_items_value,
            "depreciation_value": totals["acquisition_value"] - totals["current_value"],
            "categories": [
                {**row, "label": labels.get(row["category"], row["category"])} for row in categories
            ],
        })


class FarmStructureItemViewSet(viewsets.ModelViewSet):
    serializer_class = FarmStructureItemSerializer
    permission_classes = [OrganizationRolePermission]
    write_roles = {"owner", "admin", "manager", "operator"}
    delete_roles = {"owner", "admin"}
    operator_edits_own_only = True
    operator_owner_field = "owner_id"

    def get_queryset(self):
        organization = getattr(self.request.user, "organization", None)
        if not organization:
            return FarmStructureItem.objects.none()
        return FarmStructureItem.objects.filter(structure__farm__organization=organization).select_related("structure")

    def perform_create(self, serializer):
        structure = serializer.validated_data["structure"]
        if structure.farm.organization_id != self.request.user.organization_id:
            raise serializers.ValidationError({"structure": "Estrutura inválida para esta organização."})
        if self.request.user.role == "operator" and structure.created_by_id != self.request.user.id:
            raise serializers.ValidationError({"structure": "Você só pode adicionar itens às suas estruturas."})
        serializer.save()


class FarmAssetViewSet(viewsets.ModelViewSet):
    serializer_class = FarmAssetSerializer
    permission_classes = [OrganizationRolePermission]
    write_roles = {"owner", "admin", "manager", "operator"}
    delete_roles = {"owner", "admin"}
    operator_edits_own_only = True
    filterset_fields = ("farm", "asset_type", "is_active")
    search_fields = ("brand", "model", "serial_number", "description")
    ordering_fields = ("brand", "model", "manufacture_year", "acquisition_value", "current_value")
    ordering = ("asset_type", "brand", "model")

    def get_queryset(self):
        organization = getattr(self.request.user, "organization", None)
        if not organization:
            return FarmAsset.objects.none()
        return FarmAsset.objects.filter(farm__organization=organization).select_related(
            "farm", "created_by"
        ).prefetch_related("implements")

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=False, methods=["get"])
    def summary(self, request):
        queryset = self.filter_queryset(self.get_queryset()).filter(is_active=True)
        totals = queryset.aggregate(
            total_assets=Count("id"),
            acquisition_value=Coalesce(Sum("acquisition_value"), 0, output_field=DecimalField()),
            current_value=Coalesce(Sum("current_value"), 0, output_field=DecimalField()),
        )
        implement_value = FarmAssetImplement.objects.filter(asset__in=queryset).aggregate(
            total=Coalesce(
                Sum(F("acquisition_value") * F("quantity")), 0,
                output_field=DecimalField(max_digits=20, decimal_places=2),
            )
        )["total"]
        return Response({
            **totals,
            "implements_value": implement_value,
            "total_invested": totals["acquisition_value"] + implement_value,
        })


class FarmAssetImplementViewSet(viewsets.ModelViewSet):
    serializer_class = FarmAssetImplementSerializer
    permission_classes = [OrganizationRolePermission]
    write_roles = {"owner", "admin", "manager", "operator"}
    delete_roles = {"owner", "admin"}
    operator_edits_own_only = True
    operator_owner_field = "owner_id"

    def get_queryset(self):
        organization = getattr(self.request.user, "organization", None)
        if not organization:
            return FarmAssetImplement.objects.none()
        return FarmAssetImplement.objects.filter(asset__farm__organization=organization).select_related("asset")

    def perform_create(self, serializer):
        asset = serializer.validated_data.get("asset")
        if asset.farm.organization_id != self.request.user.organization_id:
            raise serializers.ValidationError({"asset": "Máquina ou veículo inválido para esta organização."})
        if self.request.user.role == "operator" and asset.created_by_id != self.request.user.id:
            raise serializers.ValidationError({"asset": "Você só pode adicionar implementos aos seus registros."})
        serializer.save()
