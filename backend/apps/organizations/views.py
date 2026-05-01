from rest_framework import status, viewsets
from rest_framework.decorators import api_view, permission_classes, parser_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response
from .models import Organization, OrganizationAddress, OrganizationContact
from .serializers import (
    OrganizationSerializer, 
    OrganizationAddressSerializer, 
    OrganizationContactSerializer
)

@api_view(["GET", "PUT", "PATCH"])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser])
def my_organization_view(request):
    """Get or update current user's organization."""
    org = getattr(request.user, "organization", None)
    
    if not org:
        return Response(
            {"detail": "Usuário não vinculado a uma organização."},
            status=status.HTTP_404_NOT_FOUND
        )

    if request.method == "GET":
        return Response(OrganizationSerializer(org).data)

    # Permission check: Only Owners or Admins can edit organization data
    if request.user.role not in ["owner", "admin"]:
        return Response(
            {"detail": "Apenas administradores podem editar dados da organização."},
            status=status.HTTP_403_FORBIDDEN
        )

    serializer = OrganizationSerializer(org, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    
    return Response(serializer.data)


class OrganizationBaseViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        org = getattr(self.request.user, "organization", None)
        if not org:
            return self.queryset.none()
        return self.queryset.filter(organization=org)

    def perform_create(self, serializer):
        org = getattr(self.request.user, "organization", None)
        serializer.save(organization=org)

    def check_permissions(self, request):
        super().check_permissions(request)
        if request.method not in ['GET'] and request.user.role not in ["owner", "admin"]:
            self.permission_denied(request, message="Apenas administradores podem editar.")


class OrganizationAddressViewSet(OrganizationBaseViewSet):
    queryset = OrganizationAddress.objects.all()
    serializer_class = OrganizationAddressSerializer


class OrganizationContactViewSet(OrganizationBaseViewSet):
    queryset = OrganizationContact.objects.all()
    serializer_class = OrganizationContactSerializer

