from rest_framework import viewsets
from common.permissions import OrganizationRolePermission

from .models import AuditLog
from .serializers import AuditLogSerializer


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = AuditLogSerializer
    permission_classes = [OrganizationRolePermission]
    write_roles = {"owner", "admin", "manager", "operator", "viewer"}
    delete_roles = write_roles
    filterset_fields = ("action", "model_name", "user")
    search_fields = ("description", "object_id")
    ordering = ("-created_at",)

    def get_queryset(self):
        organization = getattr(self.request.user, "organization", None)
        if not organization:
            return AuditLog.objects.none()
        return AuditLog.objects.filter(organization=organization).select_related("user")
