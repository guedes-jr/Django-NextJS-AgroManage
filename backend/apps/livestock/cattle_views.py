"""Cattle-only endpoints reuse the livestock tenant and role policies."""

from common.operator_access import operator_scoped, remember_operator_record
from common.permissions import OrganizationRolePermission
from django.db import transaction
from django.db.models import Prefetch, Q
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.inventory.models import ConsumoRacao

from .cattle_selectors import cattle_overview, cattle_withdrawals
from .cattle_serializers import (
    CattleAnimalSerializer,
    CattleBatchSerializer,
    CattleBirthInput,
    CattleEventInput,
    CattleFeedSerializer,
    CattleGrazingSerializer,
    CattleManagementSerializer,
    CattleMilkSerializer,
    CattlePastureSerializer,
    CattleVaccinationInput,
    CattleWeightInput,
    past_date,
)
from .cattle_services import (
    cattle_profile,
    confirm_cattle_management,
    enter_cattle_pasture,
    record_cattle_birth,
    record_cattle_event,
    record_cattle_feed,
)
from .models import (
    Animal,
    AnimalBatch,
    CattleGrazing,
    CattleManagement,
    CattleMilkRecord,
    CattlePasture,
    HistoricoEvento,
    Species,
    WeightRecord,
)
from .views import AnimalBatchViewSet, AnimalViewSet, build_animal_history


class CattlePermission(OrganizationRolePermission):
    def has_permission(self, request, view):
        if not super().has_permission(request, view):
            return False
        user = request.user
        return (
            user.role != "operator"
            or user.allowed_livestock.filter(code="bovinos").exists()
        )


class CattleOverviewView(APIView):
    permission_classes = [CattlePermission]

    def get(self, request):
        return Response(
            cattle_overview(request.user.organization, request.query_params.get("farm"))
        )


class CattleAnimalViewSet(AnimalViewSet):
    permission_classes = [CattlePermission]
    serializer_class = CattleAnimalSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = [
        "identifier",
        "farm",
        "gender",
        "category",
        "status",
        "reproductive_status",
    ]
    ordering_fields = ["identifier", "entry_date", "current_weight_kg"]
    ordering = ["identifier"]
    action_operations = {**AnimalViewSet.action_operations, "record_event": "edit"}

    def get_queryset(self):
        queryset = cattle_withdrawals(
            super()
            .get_queryset()
            .filter(species__code="bovinos")
            .select_related("cattle_profile")
        )
        withdrawal = self.request.query_params.get("withdrawal")
        if withdrawal in ["milk", "meat"]:
            from django.utils import timezone

            queryset = queryset.filter(
                **{f"{withdrawal}_withdrawal_until__gte": timezone.localdate()}
            )
        return queryset

    @action(detail=True, methods=["post"], url_path="register-weight")
    @transaction.atomic
    def register_weight(self, request, pk=None):
        animal = Animal.objects.select_for_update().get(pk=self.get_object().pk)
        if animal.status != "active":
            raise serializers.ValidationError("O animal não está ativo.")
        data = CattleWeightInput(data=request.data)
        data.is_valid(raise_exception=True)
        if (
            animal.entry_date
            and data.validated_data["weighing_date"] < animal.entry_date
        ):
            raise serializers.ValidationError(
                {"weighing_date": "A pesagem não pode anteceder a entrada."}
            )
        record = WeightRecord.objects.create(
            animal=animal,
            farm=animal.farm,
            species=animal.species,
            **data.validated_data,
        )
        # Historical entries must not replace a more recent current weight.
        latest = animal.weights.order_by("-weighing_date", "-created_at").first()
        Animal.objects.filter(pk=animal.pk).update(current_weight_kg=latest.weight_kg)
        remember_operator_record(request.user, record)
        return Response({"id": record.pk}, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="register-vaccination")
    def register_vaccination(self, request, pk=None):
        animal = self.get_object()
        data = CattleVaccinationInput(data=request.data)
        data.is_valid(raise_exception=True)
        if animal.status != "active" or (
            animal.entry_date
            and data.validated_data["application_date"] < animal.entry_date
        ):
            raise serializers.ValidationError(
                "Selecione um animal ativo e uma data posterior à entrada."
            )
        return super().register_vaccination(request, pk)

    @action(detail=True, methods=["post"], url_path="register-mating")
    @transaction.atomic
    def register_mating(self, request, pk=None):
        animal = Animal.objects.select_for_update().get(pk=self.get_object().pk)
        if (
            animal.gender != "F"
            or animal.status != "active"
            or animal.reproductive_status in ["gestante", "coberta"]
        ):
            raise serializers.ValidationError(
                "Selecione uma fêmea ativa sem cobertura pendente ou gestação em andamento."
            )
        day = serializers.DateField(validators=[past_date]).run_validation(
            request.data.get("mating_date")
        )
        if animal.birth_date and day < animal.birth_date:
            raise serializers.ValidationError(
                {"mating_date": "A cobertura não pode anteceder o nascimento."}
            )
        cattle_profile(
            animal
        )  # Preserve lactation before the shared flow changes status.
        return super().register_mating(request, pk)

    @action(detail=True, methods=["post"], url_path="diagnose-pregnancy")
    @transaction.atomic
    def diagnose_pregnancy(self, request, pk=None):
        animal = Animal.objects.select_for_update().get(pk=self.get_object().pk)
        mating = animal.matings_as_female.order_by("-mating_date").first()
        day = serializers.DateField(validators=[past_date]).run_validation(
            request.data.get("diagnosis_date")
        )
        if (
            request.data.get("result") not in ["positive", "negative"]
            or not mating
            or animal.reproductive_status != "coberta"
            or day < mating.mating_date
        ):
            raise serializers.ValidationError(
                "Informe um diagnóstico válido para uma cobertura pendente e respeite a data da cobertura."
            )
        response = super().diagnose_pregnancy(request, pk)
        mating.status = (
            "confirmed" if request.data["result"] == "positive" else "failed"
        )
        mating.save(update_fields=["status"])
        return response

    @action(detail=True, methods=["post"], url_path="record-birth")
    def record_birth(self, request, pk=None):
        animal = self.get_object()
        data = CattleBirthInput(data=request.data)
        data.is_valid(raise_exception=True)
        birth, calf = record_cattle_birth(animal, data.validated_data)
        if calf:
            remember_operator_record(request.user, calf)
        remember_operator_record(request.user, birth)
        return Response(
            {"birth_id": birth.pk, "calf_id": calf.pk if calf else None},
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["get"], url_path="full-history")
    def full_history(self, request, pk=None):
        animal = self.get_object()
        events = build_animal_history(animal)
        events.extend(
            {
                "type": "milk",
                "date": str(row.date),
                "title": f"Ordenha · {row.get_session_display()}",
                "subtitle": f"Produção: {row.liters} L · Descarte: {row.discarded_liters} L",
                "details": {},
            }
            for row in animal.milk_records.all()
        )
        return Response(
            sorted(events, key=lambda item: item.get("date") or "", reverse=True)
        )

    @action(detail=True, methods=["post"], url_path="record-event")
    @transaction.atomic
    def record_event(self, request, pk=None):
        if request.user.role == "operator":
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("Este manejo exige um gerente ou administrador.")
        animal = self.get_object()
        data = CattleEventInput(data=request.data)
        data.is_valid(raise_exception=True)
        record_cattle_event(animal, data.validated_data)
        return Response({"detail": "Manejo registrado."})


class CattleBatchViewSet(AnimalBatchViewSet):
    permission_classes = [CattlePermission]
    serializer_class = CattleBatchSerializer
    action_operations = {**AnimalBatchViewSet.action_operations, "change_phase": "edit"}
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["batch_code", "farm", "phase", "status"]
    ordering_fields = ["batch_code", "entry_date"]
    ordering = ["batch_code"]

    def get_queryset(self):
        return super().get_queryset().filter(species__code="bovinos")

    @action(detail=True, methods=["post"], url_path="register-weight")
    @transaction.atomic
    def register_weight(self, request, pk=None):
        batch = AnimalBatch.objects.select_for_update().get(pk=self.get_object().pk)
        data = CattleWeightInput(data=request.data)
        data.is_valid(raise_exception=True)
        if (
            batch.status != "active"
            or data.validated_data["weighing_date"] < batch.entry_date
        ):
            raise serializers.ValidationError(
                "Selecione um lote ativo e uma data posterior à entrada."
            )
        record = WeightRecord.objects.create(
            batch=batch, farm=batch.farm, species=batch.species, **data.validated_data
        )
        latest = batch.weights.order_by("-weighing_date", "-created_at").first()
        AnimalBatch.objects.filter(pk=batch.pk).update(avg_weight_kg=latest.weight_kg)
        remember_operator_record(request.user, record)
        return Response({"id": record.pk}, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="change-phase")
    @transaction.atomic
    def change_phase(self, request, pk=None):
        from .services import transfer_batch_phase

        batch = AnimalBatch.objects.select_for_update().get(pk=self.get_object().pk)
        phase = serializers.ChoiceField(
            choices=["creche", "crescimento", "engorda", "reproducao"]
        ).run_validation(request.data.get("phase"))
        day = serializers.DateField(validators=[past_date]).run_validation(
            request.data.get("date")
        )
        if batch.status != "active" or day < batch.entry_date or phase == batch.phase:
            raise serializers.ValidationError(
                "Selecione um lote ativo, uma nova fase e uma data posterior à entrada na fase atual."
            )
        transfer_batch_phase(
            batch, phase, day, notes=str(request.data.get("notes", ""))
        )
        return Response(self.get_serializer(batch).data)

    @action(detail=True, methods=["post"], url_path="register-sale")
    @transaction.atomic
    def register_sale(self, request, pk=None):
        batch = AnimalBatch.objects.select_for_update().get(pk=self.get_object().pk)
        day = serializers.DateField(validators=[past_date]).run_validation(
            request.data.get("date")
        )
        grazing = CattleGrazing.objects.filter(
            batch=batch, exit_date__isnull=True
        ).first()
        if grazing and day < grazing.entry_date:
            raise serializers.ValidationError(
                {"date": "A venda não pode anteceder a entrada no pasto atual."}
            )
        response = super().register_sale(request, pk)
        batch.refresh_from_db()
        if grazing and batch.status == "sold":
            grazing.exit_date = day
            grazing.save(update_fields=["exit_date"])
        return response

    @action(detail=False, methods=["get"], url_path="sales")
    def sales(self, request):
        batches = self.get_queryset()
        if request.query_params.get("farm"):
            batches = batches.filter(
                farm_id=serializers.UUIDField().run_validation(
                    request.query_params["farm"]
                )
            )
        events = HistoricoEvento.objects.filter(
            lote__in=batches, tipo_evento="Venda de Animais"
        ).order_by("-data_evento", "-created_at")[:100]
        return Response(
            [
                dict(event.metadata, id=str(event.pk), date=str(event.data_evento))
                for event in events
            ]
        )


class CattlePastureViewSet(viewsets.ModelViewSet):
    permission_classes = [CattlePermission]
    create_roles = {"admin", "manager"}
    serializer_class = CattlePastureSerializer
    http_method_names = ["get", "post", "patch", "head", "options"]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["farm"]
    search_fields = ["name", "farm__name"]
    ordering = ["name"]

    def get_queryset(self):
        return (
            CattlePasture.objects.filter(
                farm__organization=self.request.user.organization
            )
            .select_related("farm")
            .prefetch_related(
                Prefetch(
                    "grazings",
                    queryset=CattleGrazing.objects.filter(
                        exit_date__isnull=True, batch__status="active"
                    ).select_related("batch"),
                    to_attr="active_grazings",
                )
            )
        )


class CattleGrazingViewSet(
    viewsets.GenericViewSet,
    viewsets.mixins.ListModelMixin,
    viewsets.mixins.CreateModelMixin,
):
    permission_classes = [CattlePermission]
    create_roles = {"admin", "manager"}
    serializer_class = CattleGrazingSerializer

    def get_queryset(self):
        queryset = (
            CattleGrazing.objects.filter(
                pasture__farm__organization=self.request.user.organization
            )
            .select_related("pasture__farm", "batch__species", "batch__farm")
            .order_by("-entry_date", "-created_at")
        )
        if self.request.query_params.get("farm"):
            queryset = queryset.filter(
                pasture__farm_id=serializers.UUIDField().run_validation(
                    self.request.query_params["farm"]
                )
            )
        return queryset

    def perform_create(self, serializer):
        serializer.instance = enter_cattle_pasture(serializer.validated_data)

    @action(detail=True, methods=["post"], url_path="close")
    @transaction.atomic
    def close(self, request, pk=None):
        grazing = CattleGrazing.objects.select_for_update().get(pk=self.get_object().pk)
        day = serializers.DateField(validators=[past_date]).run_validation(
            request.data.get("exit_date")
        )
        if grazing.exit_date or day < grazing.entry_date:
            raise serializers.ValidationError(
                "Informe uma data de saída válida para uma ocupação aberta."
            )
        grazing.exit_date = day
        grazing.save(update_fields=["exit_date"])
        return Response(self.get_serializer(grazing).data)


@operator_scoped
class CattleMilkViewSet(viewsets.ModelViewSet):
    permission_classes = [CattlePermission]
    serializer_class = CattleMilkSerializer
    write_roles = {"admin", "manager", "operator"}
    filter_backends = [DjangoFilterBackend, SearchFilter]
    filterset_fields = ["animal", "date", "session"]
    search_fields = ["animal__identifier"]

    def get_queryset(self):
        queryset = CattleMilkRecord.objects.filter(
            animal__farm__organization=self.request.user.organization,
            animal__species__code="bovinos",
        ).select_related("animal__farm", "animal__species")
        if self.request.query_params.get("farm"):
            queryset = queryset.filter(
                animal__farm_id=serializers.UUIDField().run_validation(
                    self.request.query_params["farm"]
                )
            )
        return queryset


@operator_scoped
class CattleFeedViewSet(viewsets.ModelViewSet):
    permission_classes = [CattlePermission]
    serializer_class = CattleFeedSerializer
    http_method_names = ["get", "post", "head", "options"]
    filter_backends = [SearchFilter]
    search_fields = [
        "item_estoque__nome",
        "lote_animal__batch_code",
        "animais__identifier",
    ]

    def get_queryset(self):
        queryset = (
            ConsumoRacao.objects.filter(organization=self.request.user.organization)
            .filter(
                Q(lote_animal__species__code="bovinos")
                | Q(animais__species__code="bovinos")
            )
            .exclude(animais__species__in=Species.objects.exclude(code="bovinos"))
            .select_related("item_estoque", "lote_animal", "usuario")
            .prefetch_related("animais")
            .distinct()
        )
        if self.request.query_params.get("farm"):
            queryset = queryset.filter(
                farm_id=serializers.UUIDField().run_validation(
                    self.request.query_params["farm"]
                )
            )
        return queryset

    def perform_create(self, serializer):
        record_cattle_feed(serializer, self.request.user)


class CattleManagementViewSet(viewsets.ModelViewSet):
    permission_classes = [CattlePermission]
    create_roles = {"admin", "manager"}
    serializer_class = CattleManagementSerializer
    http_method_names = ["get", "post", "patch", "head", "options"]
    filter_backends = [DjangoFilterBackend, SearchFilter]
    filterset_fields = ["farm", "kind", "status"]
    search_fields = ["description", "responsible"]

    def get_queryset(self):
        # Costs, confirmations and collective state changes are managerial.
        if self.request.user.role not in {"admin", "manager"}:
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("Manejos coletivos exigem gerente ou administrador.")
        return (
            CattleManagement.objects.filter(
                farm__organization=self.request.user.organization
            )
            .select_related("farm")
            .prefetch_related("entries__animal")
        )

    @action(detail=True, methods=["post"])
    def confirm(self, request, pk=None):
        management = confirm_cattle_management(self.get_object(), request.user)
        return Response(self.get_serializer(management).data)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def cancel(self, request, pk=None):
        management = CattleManagement.objects.select_for_update().get(
            pk=self.get_object().pk
        )
        reason = serializers.CharField(max_length=300).run_validation(
            request.data.get("reason")
        )
        if management.status != "draft":
            raise serializers.ValidationError(
                "Somente rascunhos podem ser cancelados. Manejos confirmados preservam seus efeitos e histórico."
            )
        management.status = "cancelled"
        management.cancellation_reason = reason
        management.save(update_fields=["status", "cancellation_reason", "updated_at"])
        return Response(self.get_serializer(management).data)
