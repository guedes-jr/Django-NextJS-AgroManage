from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied
from django.db.models import Q

from apps.audit.models import AuditLog
from apps.audit.services import record_client_action
from common.permissions import OrganizationRolePermission

from .models import Task
from .serializers import TaskSerializer, HolidaySerializer


class TaskViewSet(viewsets.ModelViewSet):
    serializer_class = TaskSerializer
    permission_classes = [OrganizationRolePermission]
    write_roles = {"admin", "manager", "operator"}
    filterset_fields = ("status", "priority", "farm", "assigned_to")
    search_fields = ("title", "description")
    ordering_fields = ("due_date", "priority", "created_at")
    ordering = ("due_date", "-created_at")

    @action(detail=False, methods=["get"], url_path="agenda-options")
    def agenda_options(self, request):
        from apps.notifications.categories import category_policy
        from apps.notifications.tasks import _whatsapp_phone
        from common.wppconnect import is_configured
        from django.conf import settings
        policy = category_policy("agenda")
        return Response({"user_id":str(request.user.pk), "role":request.user.role, "read_only":bool(request.user.role == "operator" and request.user.operator_read_only), "whatsapp_contact_ready":bool(request.user.receive_system_alerts and request.user.phone_is_whatsapp and _whatsapp_phone(request.user.phone)), "whatsapp_configured":is_configured(), "channel_enabled":policy.enabled and policy.whatsapp_enabled, "timezone":settings.TIME_ZONE})

    def get_queryset(self):
        organization = getattr(self.request.user, "organization", None)
        if not organization:
            return Task.objects.none()
        qs = Task.objects.filter(organization=organization).select_related("farm", "assigned_to", "created_by", "reminder_delivery")
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


class OrganizationAgendaView(APIView):
    permission_classes = [OrganizationRolePermission]

    def get(self, request):
        from common.pagination import StandardResultsPagination
        from .agenda import AgendaQuery, OrganizationAgenda, agenda_event
        params = AgendaQuery(data=request.query_params)
        params.is_valid(raise_exception=True)
        events = OrganizationAgenda(request.user, **params.validated_data)
        pager = StandardResultsPagination()
        rows = pager.paginate_queryset(events, request, view=self)
        return pager.get_paginated_response([agenda_event(row) for row in rows])


class HolidayViewSet(viewsets.ModelViewSet):
    serializer_class = HolidaySerializer
    permission_classes = [OrganizationRolePermission]
    create_roles = {"admin", "manager"}
    http_method_names = ["get", "post", "delete", "head", "options"]

    def get_queryset(self):
        from .models import Holiday
        from .serializers import HolidayYearQuery
        query = Holiday.objects.filter(organization=self.request.user.organization)
        if "year" in self.request.query_params:
            params = HolidayYearQuery(data=self.request.query_params)
            params.is_valid(raise_exception=True)
            query = query.filter(date__year=params.validated_data["year"])
        return query

    def perform_create(self, serializer):
        holiday = serializer.save(organization=self.request.user.organization, created_by=self.request.user)
        record_client_action(request=self.request, action=AuditLog.Action.CREATE, model_name="Holiday", object_id=holiday.pk, description=f"Feriado cadastrado: {holiday.name} ({holiday.date})")

    def perform_destroy(self, instance):
        record_client_action(request=self.request, action=AuditLog.Action.DELETE, model_name="Holiday", object_id=instance.pk, description=f"Feriado removido: {instance.name} ({instance.date})")
        instance.delete()

    @action(detail=False, methods=["get"])
    def national(self, request):
        from .serializers import HolidayYearQuery
        from .holidays import national_holidays
        params = HolidayYearQuery(data=request.query_params)
        params.is_valid(raise_exception=True)
        rows = national_holidays(params.validated_data["year"])
        existing = {(row.date.isoformat(), row.name) for row in self.get_queryset()}
        return Response({"source":"BrasilAPI", "results":[dict(row, registered=(row["date"],row["name"]) in existing) for row in rows]})

    @action(detail=False, methods=["post"], url_path="import-national")
    def import_national(self, request):
        from .serializers import HolidayImportInput
        from .holidays import adopt_holidays
        params = HolidayImportInput(data=request.data)
        params.is_valid(raise_exception=True)
        created = adopt_holidays(request.user, **params.validated_data)
        record_client_action(request=request, action=AuditLog.Action.CREATE, model_name="Holiday", object_id=request.user.organization_id, description=f"Importação de feriados nacionais: {created} novos, ano {params.validated_data['year']}")
        return Response({"created":created})
