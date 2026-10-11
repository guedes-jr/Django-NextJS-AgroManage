from rest_framework import viewsets
from rest_framework.exceptions import PermissionDenied
from django.db.models import Q

from apps.audit.models import AuditLog
from apps.audit.services import record_client_action
from common.permissions import OrganizationRolePermission

from .models import Task
from .serializers import TaskSerializer


class TaskViewSet(viewsets.ModelViewSet):
    serializer_class = TaskSerializer
    permission_classes = [OrganizationRolePermission]
    write_roles = {"admin", "manager", "operator"}
    filterset_fields = ("status", "priority", "farm", "assigned_to")
    search_fields = ("title", "description")
    ordering_fields = ("due_date", "priority", "created_at")
    ordering = ("due_date", "-created_at")

    def get_queryset(self):
        organization = getattr(self.request.user, "organization", None)
        if not organization:
            return Task.objects.none()
        qs = Task.objects.filter(organization=organization).select_related("farm", "assigned_to", "created_by")
        if self.request.user.role == "operator":
            qs = qs.filter(Q(assigned_to=self.request.user) | Q(created_by=self.request.user))
        return qs

    def perform_create(self, serializer):
        if self.request.user.role == "operator" and serializer.validated_data.get("assigned_to") not in (None, self.request.user):
            raise PermissionDenied("Você só pode atribuir tarefas a si mesmo.")
        task = serializer.save(organization=self.request.user.organization, created_by=self.request.user)
        record_client_action(
            request=self.request, action=AuditLog.Action.CREATE, model_name="Task", object_id=task.id,
            description=f"Tarefa criada: {task.title}",
        )

    def perform_update(self, serializer):
        if self.request.user.role == "operator":
            task = serializer.instance
            if task.status in ("done", "cancelled") or task.created_by_id != self.request.user.pk and set(serializer.validated_data) - {"status"}:
                raise PermissionDenied("Você pode atualizar somente o andamento das tarefas atribuídas a você.")
            if serializer.validated_data.get("assigned_to", self.request.user) != self.request.user:
                raise PermissionDenied("Você não pode atribuir tarefas a outro usuário.")
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
