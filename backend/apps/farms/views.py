from rest_framework import permissions, serializers, viewsets

from .models import Farm, Sector
from .serializers import FarmSerializer, SectorSerializer


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
