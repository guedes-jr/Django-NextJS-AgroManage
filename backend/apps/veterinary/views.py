from datetime import date

from django.db import transaction
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.models import AuditLog
from apps.audit.services import record_client_action

from apps.organizations import segment_features as features

from . import integrations, reports, selectors, services
from .access import VeterinaryAccess, VeterinaryAdmin
from .models import (
    VeterinaryAnimal,
    VeterinaryAttachment,
    VeterinaryClient,
    VeterinaryClientPrice,
    VeterinaryPrescription,
    VeterinaryProcedure,
    VeterinaryTeamMember,
)
from .serializers import (
    AnimalCategorySerializer,
    AttachmentSerializer,
    ClientPriceSerializer,
    PrescriptionSerializer,
    TeamMemberSerializer,
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


def finalize(request, result, data):
    """Integrations of a saved procedure (stock, pricing, herd, finance) in one transaction."""
    procedure = result[0]
    organization = organization_of(request)
    responsible = integrations.responsible_for(organization, data.get("responsible_user"))
    integrations.finalize(procedure, request.user, inputs=data.get("inputs"), responsible_user=responsible)
    procedure.refresh_from_db()
    return (procedure, *result[1:])


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
            "can_wipe": request.user.role == "admin", "role": request.user.role,
            "features": features.feature_map(organization).get(features.VETERINARY, {}),
            "team": [
                {"id": str(user.pk), "name": integrations.display_name(user), "role": user.role}
                for user in integrations.team_users(organization)
            ],
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
        with transaction.atomic():
            result = services.quick_register(organization=organization_of(request), user=request.user, animal=animal, data=serializer.validated_data)
            result = finalize(request, result, serializer.validated_data)
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
        with transaction.atomic():
            result = services.register_procedure(organization=organization, user=request.user, data=serializer.validated_data)
            result = finalize(request, result, serializer.validated_data)
        record_client_action(request=request, action=AuditLog.Action.CREATE, model_name="VeterinaryProcedure", object_id=result[0].id, description=f"Atendimento veterinário: {result[0].animal.identifier}")
        return register_response(result)


    def perform_update(self, serializer):
        procedure = serializer.save()
        integrations.sync_finance(procedure)


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
        ids = list(VeterinaryProcedure.objects.filter(organization=organization, client=client, date__gte=start, date__lte=end, paid=False).values_list("pk", flat=True))
        updated = services.mark_month_paid(organization, client, start, end)
        for procedure in VeterinaryProcedure.objects.filter(pk__in=ids).select_related("client", "animal"):
            integrations.sync_finance(procedure)
        return Response({"updated": updated})


class WipeView(APIView):
    permission_classes = [VeterinaryAdmin]

    def post(self, request):
        organization = organization_of(request)
        integrations.remove_finance(organization, VeterinaryProcedure.objects.filter(organization=organization).values_list("pk", flat=True))
        counts = services.wipe(organization)
        record_client_action(request=request, action=AuditLog.Action.DELETE, model_name="VeterinaryClient", object_id="", description=f"Área do veterinário zerada: {counts['clients']} cliente(s), {counts['animals']} animal(is)")
        return Response(counts)


class HerdView(APIView):
    """Farm herd (segment animals) the area may consult, read-only."""

    permission_classes = [VeterinaryAccess]

    def get(self, request):
        from .herd import animal_list

        return Response(animal_list(request.user, request.query_params))


class HerdAnimalView(APIView):
    permission_classes = [VeterinaryAccess]

    def get(self, request, animal_id):
        from .herd import animal_history

        return Response(animal_history(request.user, animal_id))


def require_feature(organization, feature):
    if not features.enabled(organization, features.VETERINARY, feature):
        raise ValidationError({"detail": "Este recurso está desligado em Configurações › Recursos dos segmentos."})


class ClientPriceViewSet(mixins.ListModelMixin, mixins.CreateModelMixin, mixins.UpdateModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    """Price per client and procedure kind (Recursos › Preço por cliente)."""

    permission_classes = [VeterinaryAccess]
    serializer_class = ClientPriceSerializer
    pagination_class = None

    def get_queryset(self):
        organization = organization_of(self.request)
        require_feature(organization, features.CLIENT_PRICING)
        qs = VeterinaryClientPrice.objects.filter(organization=organization)
        client = self.request.query_params.get("client")
        return qs.filter(client_id=client) if client else qs

    def perform_create(self, serializer):
        organization = organization_of(self.request)
        client = serializer.validated_data["client"]
        if client.organization_id != organization.pk:
            raise ValidationError({"client": "Cliente não encontrado."})
        VeterinaryClientPrice.objects.filter(client=client, kind=serializer.validated_data["kind"]).delete()
        serializer.save(organization=organization)


class TeamViewSet(mixins.ListModelMixin, mixins.CreateModelMixin, mixins.UpdateModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    """Area team with logins and commission. Only the admin and the manager change it."""

    permission_classes = [VeterinaryAccess]
    serializer_class = TeamMemberSerializer
    pagination_class = None

    def get_queryset(self):
        return VeterinaryTeamMember.objects.filter(organization=organization_of(self.request)).select_related("user")

    def check_write(self):
        if self.request.user.role not in ("admin", "manager"):
            raise ValidationError({"detail": "Somente o administrador ou o gerente alteram a equipe."})

    @action(detail=False, methods=["get"])
    def candidates(self, request):
        organization = organization_of(request)
        taken = set(self.get_queryset().values_list("user_id", flat=True))
        return Response([
            {"id": str(user.pk), "name": integrations.display_name(user), "role": user.role}
            for user in integrations.team_users(organization) if user.pk not in taken
        ])

    def perform_create(self, serializer):
        self.check_write()
        organization = organization_of(self.request)
        user = serializer.validated_data["user"]
        if not integrations.team_users(organization).filter(pk=user.pk).exists():
            raise ValidationError({"user": "Escolha um usuário da organização com acesso à área."})
        serializer.save(organization=organization)

    def perform_update(self, serializer):
        self.check_write()
        serializer.save(user=serializer.instance.user)

    def perform_destroy(self, instance):
        self.check_write()
        instance.delete()


class InputLotsView(APIView):
    """Stock lots that may be used in a procedure (semen, hormones, devices, materials)."""

    permission_classes = [VeterinaryAccess]

    def get(self, request):
        return Response([
            {
                "id": str(lot.pk), "item": str(lot.item_id), "name": lot.item.nome, "lot": lot.numero_lote,
                "unit": lot.item.unidade_medida, "balance": lot.quantidade_atual, "unit_cost": lot.custo_unitario,
                "expiry": lot.data_validade, "category": lot.item.categoria,
            }
            for lot in integrations.available_lots(organization_of(request))
        ])


MAX_ATTACHMENT = 10 * 1024 * 1024
ATTACHMENT_TYPES = {"image/jpeg", "image/png", "image/webp", "application/pdf"}


class AttachmentViewSet(mixins.ListModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    permission_classes = [VeterinaryAccess]
    serializer_class = AttachmentSerializer
    pagination_class = None

    def get_queryset(self):
        qs = VeterinaryAttachment.objects.filter(organization=organization_of(self.request))
        animal = self.request.query_params.get("animal")
        return qs.filter(animal_id=animal) if animal else qs

    def create(self, request):
        organization = organization_of(request)
        upload = request.FILES.get("file")
        animal = get_object_or_404(VeterinaryAnimal, organization=organization, pk=request.data.get("animal"))
        procedure = None
        if request.data.get("procedure"):
            procedure = get_object_or_404(VeterinaryProcedure, organization=organization, animal=animal, pk=request.data["procedure"])
        if upload is None:
            raise ValidationError({"file": "Escolha um arquivo."})
        if upload.size > MAX_ATTACHMENT:
            raise ValidationError({"file": "O arquivo deve ter até 10 MB."})
        if upload.content_type not in ATTACHMENT_TYPES:
            raise ValidationError({"file": "Envie uma foto (JPG, PNG ou WEBP) ou um PDF."})
        attachment = VeterinaryAttachment.objects.create(
            organization=organization, animal=animal, procedure=procedure, file=upload, name=upload.name[:200],
            kind=VeterinaryAttachment.Kind.DOCUMENT if upload.content_type == "application/pdf" else VeterinaryAttachment.Kind.PHOTO,
            size=upload.size, uploaded_by=request.user,
        )
        record_client_action(request=request, action=AuditLog.Action.CREATE, model_name="VeterinaryAttachment", object_id=attachment.id, description=f"Anexo do veterinário: {animal.identifier}")
        return Response(AttachmentSerializer(attachment).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"])
    def file(self, request, pk=None):
        attachment = self.get_object()
        response = FileResponse(attachment.file.open("rb"), as_attachment=attachment.kind == VeterinaryAttachment.Kind.DOCUMENT, filename=attachment.name)
        response["X-Content-Type-Options"] = "nosniff"
        return response

    def perform_destroy(self, instance):
        instance.file.delete(save=False)
        instance.delete()


class PrescriptionViewSet(mixins.ListModelMixin, mixins.CreateModelMixin, mixins.RetrieveModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    permission_classes = [VeterinaryAccess]
    serializer_class = PrescriptionSerializer
    pagination_class = None

    def get_queryset(self):
        qs = VeterinaryPrescription.objects.filter(organization=organization_of(self.request)).select_related("client", "animal")
        for name in ("animal", "client"):
            value = self.request.query_params.get(name)
            if value:
                qs = qs.filter(**{f"{name}_id": value})
        return qs

    def perform_create(self, serializer):
        prescription = serializer.save(organization=organization_of(self.request), created_by=self.request.user)
        record_client_action(request=self.request, action=AuditLog.Action.CREATE, model_name="VeterinaryPrescription", object_id=prescription.id, description=f"Receituário: {prescription.client.name}")


class IndicatorsView(APIView):
    """Pregnancy rate by bull/semen, responsible, farm and month (item 5)."""

    permission_classes = [VeterinaryAccess]

    def get(self, request):
        params = request.query_params
        return Response(reports.indicators(organization_of(request), parse_day(params.get("start")), parse_day(params.get("end")), params.get("client") or None))


class FarmsView(APIView):
    """Farms of the organization a client may be linked to (herd integration)."""

    permission_classes = [VeterinaryAccess]

    def get(self, request):
        from apps.farms.models import Farm

        return Response([{"id": str(farm.pk), "name": farm.name} for farm in Farm.objects.filter(organization=organization_of(request)).order_by("name")])
