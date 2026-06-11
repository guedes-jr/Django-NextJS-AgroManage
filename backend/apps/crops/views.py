"""
ViewSets for the crops app.
"""
from rest_framework import viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Field, PlantingCycle, Planting, Fertilization, Fertigation, PesticideApplication, Irrigation, Harvest
from .serializers import (
    FieldSerializer,
    PlantingCycleListSerializer,
    PlantingCycleDetailSerializer,
    PlantingSerializer,
    FertilizationSerializer,
    FertigationSerializer,
    PesticideApplicationSerializer,
    IrrigationSerializer,
    HarvestSerializer,
)
from .services import (
    create_plantation, update_plantation,
    create_planting, create_fertilization,
    create_fertigation, create_pesticide_application,
    create_irrigation,
)
from .selectors import (
    get_plantation_dashboard,
    get_plantation_indicators,
    get_crops_dashboard,
)


class FieldViewSet(viewsets.ModelViewSet):
    queryset = Field.objects.select_related("farm", "sector").all()
    serializer_class = FieldSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.user.is_authenticated and self.request.user.organization:
            return qs.filter(farm__organization=self.request.user.organization)
        return qs.none()


class PlantingCycleViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        if self.action == "list":
            return PlantingCycleListSerializer
        return PlantingCycleDetailSerializer

    def get_queryset(self):
        if self.request.user.is_authenticated and self.request.user.organization:
            qs = PlantingCycle.objects.filter(
                organization=self.request.user.organization
            ).select_related("field", "farm", "sector", "responsible_user")
            status = self.request.query_params.get("status")
            if status:
                qs = qs.filter(status=status)
            field_id = self.request.query_params.get("field")
            if field_id:
                qs = qs.filter(field_id=field_id)
            farm_id = self.request.query_params.get("farm")
            if farm_id:
                qs = qs.filter(farm_id=farm_id)
            return qs
        return PlantingCycle.objects.none()

    def perform_create(self, serializer):
        create_plantation(serializer, self.request)

    def perform_update(self, serializer):
        update_plantation(serializer, self.request)

    @action(detail=True, methods=["get"], url_path="dashboard")
    def dashboard(self, request, pk=None):
        plantation = self.get_object()
        data = get_plantation_dashboard(plantation)
        return Response(data)

    @action(detail=True, methods=["get"], url_path="indicators")
    def indicators(self, request, pk=None):
        plantation = self.get_object()
        data = get_plantation_indicators(plantation)
        return Response(data)


class HarvestViewSet(viewsets.ModelViewSet):
    queryset = Harvest.objects.select_related("planting_cycle").all()
    serializer_class = HarvestSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.user.is_authenticated and self.request.user.organization:
            qs = qs.filter(
                planting_cycle__organization=self.request.user.organization
            )
            planting_cycle_id = self.request.query_params.get("planting_cycle")
            if planting_cycle_id:
                qs = qs.filter(planting_cycle_id=planting_cycle_id)
            return qs
        return qs.none()


class PlantingViewSet(viewsets.ModelViewSet):
    serializer_class = PlantingSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        if self.request.user.is_authenticated and self.request.user.organization:
            qs = Planting.objects.filter(
                plantation__organization=self.request.user.organization
            ).select_related("item", "supplier", "lot", "plantation")
            plantation_id = self.request.query_params.get("plantation")
            if plantation_id:
                qs = qs.filter(plantation_id=plantation_id)
            return qs
        return Planting.objects.none()

    def perform_create(self, serializer):
        create_planting(serializer, self.request)


class FertilizationViewSet(viewsets.ModelViewSet):
    serializer_class = FertilizationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        if self.request.user.is_authenticated and self.request.user.organization:
            qs = Fertilization.objects.filter(
                plantation__organization=self.request.user.organization
            ).select_related("item", "supplier", "lot", "plantation")
            plantation_id = self.request.query_params.get("plantation")
            if plantation_id:
                qs = qs.filter(plantation_id=plantation_id)
            return qs
        return Fertilization.objects.none()

    def perform_create(self, serializer):
        create_fertilization(serializer, self.request)


class FertigationViewSet(viewsets.ModelViewSet):
    serializer_class = FertigationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        if self.request.user.is_authenticated and self.request.user.organization:
            qs = Fertigation.objects.filter(
                plantation__organization=self.request.user.organization
            ).select_related("item", "lot", "plantation")
            plantation_id = self.request.query_params.get("plantation")
            if plantation_id:
                qs = qs.filter(plantation_id=plantation_id)
            return qs
        return Fertigation.objects.none()

    def perform_create(self, serializer):
        create_fertigation(serializer, self.request)


class PesticideApplicationViewSet(viewsets.ModelViewSet):
    serializer_class = PesticideApplicationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        if self.request.user.is_authenticated and self.request.user.organization:
            qs = PesticideApplication.objects.filter(
                plantation__organization=self.request.user.organization
            ).select_related("item", "supplier", "lot", "plantation")
            plantation_id = self.request.query_params.get("plantation")
            if plantation_id:
                qs = qs.filter(plantation_id=plantation_id)
            return qs
        return PesticideApplication.objects.none()

    def perform_create(self, serializer):
        create_pesticide_application(serializer, self.request)


class IrrigationViewSet(viewsets.ModelViewSet):
    serializer_class = IrrigationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        if self.request.user.is_authenticated and self.request.user.organization:
            qs = Irrigation.objects.filter(
                plantation__organization=self.request.user.organization
            ).select_related("plantation")
            plantation_id = self.request.query_params.get("plantation")
            if plantation_id:
                qs = qs.filter(plantation_id=plantation_id)
            return qs
        return Irrigation.objects.none()

    def perform_create(self, serializer):
        create_irrigation(serializer, self.request)


class CropsDashboardView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        org = request.user.organization
        if not org:
            return Response({"error": "No organization"}, status=400)
        data = get_crops_dashboard(org)
        return Response(data)
