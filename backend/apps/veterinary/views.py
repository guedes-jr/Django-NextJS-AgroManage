from datetime import date

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.models import AuditLog
from apps.audit.services import record_client_action

from . import reports, selectors, services
from .access import VeterinaryAccess, VeterinaryAdmin
from .models import VeterinaryAnimal, VeterinaryClient, VeterinaryProcedure
from .serializers import (
    AnimalCategorySerializer,
    BillingUpdateSerializer,
    ClientSerializer,
    QuickSerializer,
    RegisterSerializer,
    SettingsSerializer,
    animal_data,
    procedure_data,
    source_data,
)


def organization_of(request):
    return request.user.organization


def parse_month(value):
    try:
        year, month = (int(part) for part in str(value).split("-")[:2])
        return date(year, month, 1)
    except (TypeError, ValueError):
        today = timezone.localdate()
        return date(today.year, today.month, 1)


def parse_day(value):
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError as error:
        raise ValidationError({"date": "Data inválida."}) from error


def register_response(result, status_code=status.HTTP_201_CREATED):
    procedure, alerts, created, branch = result
    animal = procedure.animal
    return Response({
        "branch": branch, "animal_created": created, "animal": {"id": str(animal.id), "identifier": animal.identifier},
        "client": {"id": str(procedure.client_id), "name": procedure.client.name},
        "procedure": procedure_data(procedure), "alerts": [{"kind": a.kind, "day": a.day, "date": a.date} for a in alerts],
    }, status=status_code)


class WorkspaceView(APIView):
    """Settings, today's date and the open alerts badge (prototype vkNAl)."""

    permission_classes = [VeterinaryAccess]

    def get(self, request):
        organization = organization_of(request)
        config = services.settings_for(organization)
        today = timezone.localdate()
        open_alerts = organization.veterinary_alerts.filter(done=False, date__lte=today).count()
        return Response({
            "today": today, "settings": SettingsSerializer(config).data, "open_alerts": open_alerts,
            "can_wipe": request.user.role == "admin",
        })


class SettingsView(APIView):
    permission_classes = [VeterinaryAccess]

    def patch(self, request):
        config = services.settings_for(organization_of(request))
        serializer = SettingsSerializer(config, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class ClientViewSet(mixins.ListModelMixin, mixins.CreateModelMixin, mixins.UpdateModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    permission_classes = [VeterinaryAccess]
    serializer_class = ClientSerializer
    pagination_class = None

    def get_queryset(self):
        return VeterinaryClient.objects.filter(organization=organization_of(self.request))

    def list(self, request, *args, **kwargs):
        organization = organization_of(request)
        today = timezone.localdate()
        month_start = date(today.year, today.month, 1)
        totals = reports.receivable_by_client(organization)
        animals = {}
        for row in VeterinaryAnimal.objects.filter(organization=organization).values("client"):
            animals[str(row["client"])] = animals.get(str(row["client"]), 0) + 1
        month = {}
        for row in VeterinaryProcedure.objects.filter(organization=organization, date__gte=month_start).values("client"):
            month[str(row["client"])] = month.get(str(row["client"]), 0) + 1
        data = []
        for client in self.get_queryset():
            key = str(client.id)
            data.append({
                **ClientSerializer(client).data, "animals": animals.get(key, 0), "month_procedures": month.get(key, 0),
                "receivable": totals.get(key, {}).get("receivable", 0), "procedures": totals.get(key, {}).get("count", 0),
            })
        return Response(data)

    def perform_create(self, serializer):
        client = serializer.save(organization=organization_of(self.request))
        record_client_action(request=self.request, action=AuditLog.Action.CREATE, model_name="VeterinaryClient", object_id=client.id, description=f"Cliente do veterinário criado: {client.name}")

    def perform_destroy(self, instance):
        name, pk = instance.name, instance.id
        services.delete_client(instance)
        record_client_action(request=self.request, action=AuditLog.Action.DELETE, model_name="VeterinaryClient", object_id=pk, description=f"Cliente do veterinário removido: {name}")


class AnimalViewSet(mixins.UpdateModelMixin, viewsets.GenericViewSet):
    permission_classes = [VeterinaryAccess]
    serializer_class = AnimalCategorySerializer
    http_method_names = ["get", "patch", "post"]

    def get_queryset(self):
        return VeterinaryAnimal.objects.filter(organization=organization_of(self.request))

    def list(self, request):
        """Every animal with status, next procedure and deadline (Animais, Alertas and Resumo)."""
        organization = organization_of(request)
        today = timezone.localdate()
        clients, states = selectors.load_state(organization)
        return Response([animal_data(state, clients, today) for state in states.values()])

    @action(detail=True, methods=["get"])
    def history(self, request, pk=None):
        animal = self.get_object()
        today = timezone.localdate()
        procedures = sorted(animal.procedures.all(), key=selectors.order_key, reverse=True)
        return Response([procedure_data(p, today) for p in procedures])

    @action(detail=False, methods=["get"])
    def lookup(self, request):
        """What "Lançar atendimento" needs to know about the typed animal (vkFind + vkPrev)."""
        organization = organization_of(request)
        client = VeterinaryClient.objects.filter(organization=organization, pk=request.query_params.get("client")).first()
        animal = services.find_animal(organization, client, request.query_params.get("q", ""))
        if animal is None:
            return Response({"found": False})
        state = services.animal_state(animal)
        today = timezone.localdate()
        step = selectors.pending_protocol_step(state)
        return Response({
            "found": True, **animal_data(state, {client.id: client}, today),
            "source": source_data(selectors.protocol_source(state)),
            "pending_step": {"kind": step.kind, "day": step.day, "date": step.date} if step else None,
            "not_inseminated_date": selectors.not_inseminated_date(state, today),
            "default_coverage_method": selectors.default_coverage_method(state),
        })

    @action(detail=True, methods=["post"])
    def quick(self, request, pk=None):
        animal = self.get_object()
        serializer = QuickSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = services.quick_register(organization=organization_of(request), user=request.user, animal=animal, data=serializer.validated_data)
        return register_response(result)


class ProcedureViewSet(mixins.UpdateModelMixin, viewsets.GenericViewSet):
    permission_classes = [VeterinaryAccess]
    serializer_class = BillingUpdateSerializer
    http_method_names = ["post", "patch"]

    def get_queryset(self):
        return VeterinaryProcedure.objects.filter(organization=organization_of(self.request))

    def create(self, request):
        organization = organization_of(request)
        serializer = RegisterSerializer(data=request.data, organization=organization)
        serializer.is_valid(raise_exception=True)
        result = services.register_procedure(organization=organization, user=request.user, data=serializer.validated_data)
        record_client_action(request=request, action=AuditLog.Action.CREATE, model_name="VeterinaryProcedure", object_id=result[0].id, description=f"Atendimento veterinário: {result[0].animal.identifier}")
        return register_response(result)


class ReportView(APIView):
    permission_classes = [VeterinaryAccess]

    def get(self, request):
        params = request.query_params
        filters = {
            "client": params.get("client", ""), "date": parse_day(params.get("date")), "procedure": params.get("procedure", ""),
            "result": params.get("result", ""), "bull": params.get("bull", ""), "category": params.get("category", ""),
            "responsible": params.get("responsible", ""), "q": params.get("q", ""), "mode": params.get("mode", "event"),
        }
        return Response(reports.report(organization_of(request), filters, timezone.localdate()))


class BillingView(APIView):
    permission_classes = [VeterinaryAccess]

    def get(self, request):
        month = parse_month(request.query_params.get("month"))
        return Response(reports.billing(organization_of(request), month, request.query_params.get("client") or None))


class BillingPayAllView(APIView):
    permission_classes = [VeterinaryAccess]

    def post(self, request):
        organization = organization_of(request)
        client = get_object_or_404(VeterinaryClient, organization=organization, pk=request.data.get("client"))
        start, end = reports.month_bounds(parse_month(request.data.get("month")))
        updated = services.mark_month_paid(organization, client, start, end)
        return Response({"updated": updated})


class WipeView(APIView):
    permission_classes = [VeterinaryAdmin]

    def post(self, request):
        counts = services.wipe(organization_of(request))
        record_client_action(request=request, action=AuditLog.Action.DELETE, model_name="VeterinaryClient", object_id="", description=f"Área do veterinário zerada: {counts['clients']} cliente(s), {counts['animals']} animal(is)")
        return Response(counts)
