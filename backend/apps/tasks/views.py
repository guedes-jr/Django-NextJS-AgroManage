from rest_framework import viewsets

from apps.audit.models import AuditLog
from apps.audit.services import record_client_action
from common.permissions import OrganizationRolePermission

from .models import Task
from .serializers import TaskSerializer


class TaskViewSet(viewsets.ModelViewSet):
    serializer_class = TaskSerializer
    permission_classes = [OrganizationRolePermission]
    write_roles = {"owner", "admin", "manager", "operator"}
    delete_roles = {"owner", "admin"}
    operator_edits_own_only = True
    filterset_fields = ("status", "priority", "farm", "assigned_to")
    search_fields = ("title", "description")
    ordering_fields = ("due_date", "priority", "created_at")
    ordering = ("due_date", "-created_at")

    def get_queryset(self):
        organization = getattr(self.request.user, "organization", None)
        if not organization:
            return Task.objects.none()
        return Task.objects.filter(organization=organization).select_related("farm", "assigned_to", "created_by")

    def perform_create(self, serializer):
        task = serializer.save(organization=self.request.user.organization, created_by=self.request.user)
        record_client_action(
            request=self.request, action=AuditLog.Action.CREATE, model_name="Task", object_id=task.id,
            description=f"Tarefa criada: {task.title}",
        )

    def perform_update(self, serializer):
        task = serializer.save()
        record_client_action(
            request=self.request, action=AuditLog.Action.UPDATE, model_name="Task", object_id=task.id,
            description=f"Tarefa atualizada: {task.title}",
        )

    def perform_destroy(self, instance):
        task_id, title = instance.id, instance.title
        instance.delete()
        record_client_action(
            request=self.request, action=AuditLog.Action.DELETE, model_name="Task", object_id=task_id,
            description=f"Tarefa removida: {title}",
        )
