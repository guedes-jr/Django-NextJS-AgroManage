"""Cattle-only endpoints reuse the livestock tenant and role policies."""

from decimal import Decimal

from common.operator_access import operator_scoped, remember_operator_record
from common.permissions import OrganizationRolePermission
from django.db import transaction
from django.db.models import Prefetch, Q, OuterRef, Subquery, Count
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.inventory.models import ConsumoRacao

from .cattle_selectors import cattle_overview, cattle_withdrawals
from .cattle_serializers import (
    CattleAnimalSerializer, CATTLE_CATEGORIES,
    CattleBatchSerializer,
    CattleBirthInput,
    CattleAgendaQuery, CattleFollowUpInput, CattleFeedPlanSerializer, CattleFeedDeliverySerializer, CattleFeedDeliveryInput,
    CattleEventInput,
    CattleFeedSerializer,
    CattleGrazingSerializer,
    CattleManagementSerializer,
    CattleMilkSerializer, CattleMilkDailyTotalSerializer,
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
    CattleMilkRecord, CattleMilkDailyTotal,
    CattleFeedPlan,
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
            user.role not in {"operator", "feeder"}
            or user.allowed_livestock.filter(code="bovinos").exists()
        )


class CattleOverviewView(APIView):
    permission_classes = [CattlePermission]

    def get(self, request):
        return Response(
            cattle_overview(request.user.organization, request.query_params.get("farm"), request.query_params.get("production"))
        )


class CattleDairyOverviewView(APIView):
    permission_classes = [CattlePermission]

    def get(self, request):
        from django.utils import timezone
        from .cattle_selectors import dairy_overview
        day = serializers.DateField(validators=[past_date]).run_validation(request.query_params.get("date", str(timezone.localdate())))
        farm = request.query_params.get("farm")
        if farm:
            farm = serializers.UUIDField().run_validation(farm)
        return Response(dairy_overview(request.user.organization, day, farm))


class CattleAgendaView(APIView):
    permission_classes = [CattlePermission]

    def get(self, request):
        from .cattle_operations import cattle_agenda, agenda_row
        from common.pagination import StandardResultsPagination
        query = CattleAgendaQuery(data=request.query_params)
        query.is_valid(raise_exception=True)
        events = cattle_agenda(request.user.organization, **query.validated_data)
        pager = StandardResultsPagination()
        page = pager.paginate_queryset(events, request, view=self)
        return pager.get_paginated_response([agenda_row(row) for row in page])


class CattleAnimalViewSet(AnimalViewSet):
    @action(detail=True, methods=['get'], url_path='mobile-birth')
    def mobile_birth(self, request, pk=None):
        from . import mobile_birth
        return Response(mobile_birth.options(request.user, pk, request.query_params))

    @action(detail=True, methods=['get'], url_path='mobile-mating')
    def mobile_mating(self, request, pk=None):
        from . import mobile_mating
        return Response(mobile_mating.options(request.user, pk, request.query_params))

    @action(detail=False, methods=['get'], url_path='mobile-mating-sires')
    def mobile_mating_sires(self, request):
        from . import mobile_mating
        search = serializers.CharField(max_length=100, allow_blank=True).run_validation(request.query_params.get('search', ''))
        page = self.paginate_queryset(mobile_mating.sires(request.user, search))
        return self.get_paginated_response([mobile_mating.animal_data(animal) for animal in page])

    @action(detail=True, methods=['get'], url_path='mobile-diagnosis')
    def mobile_diagnosis(self, request, pk=None):
        from . import mobile_diagnosis
        return Response(mobile_diagnosis.context(request.user, pk, request.query_params)[2])

    @action(detail=False, methods=['get'], url_path='mobile-reproduction')
    def mobile_reproduction(self, request):
        from . import mobile_reproduction as reproduction
        values = reproduction.Query(data=request.query_params); values.is_valid(raise_exception=True)
        rows = reproduction.rows(request.user, values.validated_data)
        metadata = reproduction.metadata(rows)
        group = values.validated_data['group']
        if group != 'all':
            from .cattle_selectors import cattle_reproduction_groups
            rows = rows.filter(cattle_reproduction_groups()[group])
        page = self.paginate_queryset(rows)
        response = self.get_paginated_response([reproduction.data(animal) for animal in page])
        response.data.update(metadata)
        return response

    @action(detail=True, methods=['get'], url_path='mobile-reproduction')
    def mobile_reproduction_detail(self, request, pk=None):
        from . import mobile_reproduction as reproduction
        from django.shortcuts import get_object_or_404
        values = reproduction.Query(data=request.query_params); values.is_valid(raise_exception=True)
        animal = get_object_or_404(reproduction.rows(request.user, values.validated_data), pk=pk)
        return Response(reproduction.data(animal, detail=True))

    permission_classes = [CattlePermission]
    serializer_class = CattleAnimalSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = [
        "identifier",
        "batch",
        "farm",
        "gender",
        "category",
        "status",
        "reproductive_status",
    ]
    ordering_fields = ["identifier", "entry_date", "current_weight_kg"]
    ordering = ["identifier"]
    search_fields = ["identifier", "cattle_profile__name", "batch__batch_code", "batch__name"]
    action_operations = {**AnimalViewSet.action_operations, "record_event": "edit"}

    def get_serializer(self, *args, **kwargs):
        serializer = super().get_serializer(*args, **kwargs)
        if self.request.method == "GET" and self.request.query_params.get("view") == "operational":
            target = serializer.child if hasattr(serializer, "child") else serializer
            fields = {"id", "identifier", "name", "farm", "farm_name", "cattle_purpose", "gender", "category", "status", "breed_name", "batch", "batch_code", "birth_date", "entry_date", "current_weight_kg", "reproductive_status", "is_lactating", "milk_withdrawal_until", "meat_withdrawal_until", "notes"}
            for field in set(target.fields) - fields:
                target.fields.pop(field)
        return serializer

    def get_queryset(self):
        from .cattle_selectors import with_cattle_reproduction, cattle_reproduction_groups
        queryset = cattle_withdrawals(
            super()
            .get_queryset()
            .filter(species__code="bovinos")
            .select_related("cattle_profile")
        )
        from .cattle_improvements import filter_purpose
        queryset = filter_purpose(with_cattle_reproduction(queryset), self.request.query_params.get("production"))
        group = serializers.ChoiceField(choices=["all", *cattle_reproduction_groups()]).run_validation(self.request.query_params.get("reproduction_group", "all"))
        if group != "all" and self.action != "reproduction_summary":
            queryset = queryset.filter(cattle_reproduction_groups()[group])
        if self.request.query_params.get("young_females") == "true":
            queryset = queryset.filter(gender="F", category__in=["Bezerro", "Novilha"])
        group = serializers.ChoiceField(choices=["all", "cows", "heifers", "calves", "bulls"]).run_validation(self.request.query_params.get("dairy_category", "all"))
        groups = {
            "cows": Q(gender="F", category__in=["Vaca", "Matriz"]),
            "heifers": Q(gender="F", category="Novilha"),
            "calves": Q(gender="F", category="Bezerro"),
            "bulls": Q(gender="M", category__in=["Touro", "Reprodutor"]),
        }
        if group != "all" and self.action != "category_counts":
            queryset = queryset.filter(groups[group])
        withdrawal = self.request.query_params.get("withdrawal")
        if withdrawal in ["milk", "meat"]:
            from django.utils import timezone

            queryset = queryset.filter(
                **{f"{withdrawal}_withdrawal_until__gte": timezone.localdate()}
            )
        return queryset

    @action(detail=False, methods=["get"], url_path="category-counts")
    def category_counts(self, request):
        rows = self.filter_queryset(self.get_queryset())
        return Response(rows.aggregate(
            all=Count("pk"),
            cows=Count("pk", filter=Q(gender="F", category__in=["Vaca", "Matriz"])),
            heifers=Count("pk", filter=Q(gender="F", category="Novilha")),
            calves=Count("pk", filter=Q(gender="F", category="Bezerro")),
            bulls=Count("pk", filter=Q(gender="M", category__in=["Touro", "Reprodutor"])),
        ))

    @action(detail=False, methods=["get"], url_path="reproduction-summary")
    def reproduction_summary(self, request):
        from .cattle_selectors import cattle_reproduction_groups
        rows = self.filter_queryset(self.get_queryset()).filter(status="active")
        return Response(rows.aggregate(
            females=Count("pk", filter=Q(gender="F")),
            **{key: Count("pk", filter=query) for key, query in cattle_reproduction_groups().items()},
        ))

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
        if request.query_params.get('view') in ('mobile-preview', 'mobile-confirm'):
            from . import mobile_mating
            mobile_mating.writable(request.user)
            if request.query_params['view'] == 'mobile-preview':
                values = mobile_mating.Input(data=request.data); values.is_valid(raise_exception=True)
                return Response(mobile_mating.preview(request.user, pk, request.query_params, values.validated_data))
            from .mobile_vaccination import ConfirmInput
            values = ConfirmInput(data=request.data); values.is_valid(raise_exception=True)
            return Response(mobile_mating.confirm(request.user, pk, request.query_params, values.validated_data['preview_token']), status=201)

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
        if request.query_params.get('view') == 'mobile':
            from . import mobile_diagnosis
            values = mobile_diagnosis.Input(data=request.data); values.is_valid(raise_exception=True)
            return Response(mobile_diagnosis.record(request.user, pk, request.query_params, values.validated_data))

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
        if request.query_params.get('view') in ('mobile-preview', 'mobile-confirm'):
            from . import mobile_birth
            mobile_birth.writable(request.user)
            if request.query_params['view'] == 'mobile-preview':
                values = mobile_birth.Input(data=request.data); values.is_valid(raise_exception=True)
                return Response(mobile_birth.preview(request.user, pk, request.query_params, values.validated_data))
            from .mobile_vaccination import ConfirmInput
            values = ConfirmInput(data=request.data); values.is_valid(raise_exception=True)
            return Response(mobile_birth.confirm(request.user, pk, request.query_params, values.validated_data['preview_token']), status=201)

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

    @action(detail=True, methods=["get"])
    def genealogy(self, request, pk=None):
        from .cattle_genealogy import genealogy
        return Response(genealogy(self.get_object()))

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
        events = sorted(events, key=lambda item: item.get("date") or "", reverse=True)
        if request.query_params.get("view") == "operational":
            events = [{key: row.get(key) for key in ("type", "date", "title", "subtitle")} for row in events]
        if "page" in request.query_params:
            from common.pagination import StandardResultsPagination
            pager = StandardResultsPagination()
            rows = pager.paginate_queryset(events, request, view=self)
            return pager.get_paginated_response(rows)
        return Response(events)

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
    action_operations = {**AnimalBatchViewSet.action_operations, "change_phase": "edit", "record_cost": "edit"}
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["batch_code", "farm", "phase", "status"]
    ordering_fields = ["batch_code", "entry_date"]
    ordering = ["batch_code"]

    def get_serializer(self, *args, **kwargs):
        serializer = super().get_serializer(*args, **kwargs)
        if self.request.method == "GET" and self.request.query_params.get("view") == "operational":
            target = serializer.child if hasattr(serializer, "child") else serializer
            fields = {"id", "batch_code", "name", "farm_id", "farm_name", "cattle_purpose", "category", "status", "phase", "quantity", "gender", "entry_date", "birth_date", "avg_weight_kg", "notes"}
            for field in set(target.fields) - fields:
                target.fields.pop(field)
        return serializer

    def get_queryset(self):
        from .cattle_operations import with_batch_operations
        from .cattle_improvements import filter_purpose
        return with_batch_operations(filter_purpose(super().get_queryset().filter(species__code="bovinos"), self.request.query_params.get("production")))

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
        category = serializers.ChoiceField(choices=CATTLE_CATEGORIES).run_validation(request.data.get("category", batch.category))
        previous = batch.category
        transfer_batch_phase(batch, phase, day, notes=str(request.data.get("notes", "")))
        if category != previous:
            batch.category = category
            batch.save(update_fields=["category", "updated_at"])
            HistoricoEvento.objects.create(farm=batch.farm, lote=batch, tipo_evento="Categoria de Lote", data_evento=day,
                descricao=f"Categoria: {previous} → {category}", metadata={"previous": previous, "category": category, "author": str(request.user.pk)})
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
        from .cattle_serializers import CattleSaleInput
        from .services import register_batch_sale
        sale = CattleSaleInput(data=request.data, context={"batch": batch})
        sale.is_valid(raise_exception=True)
        withdrawals = batch.historicos.filter(tipo_evento="Sanidade de Lote Bovino", data_evento__lte=day)
        if any(event.metadata.get("meat_withdrawal_until", "") > str(day) for event in withdrawals):
            raise serializers.ValidationError({"date": "Há aplicação sanitária com carência de carne vigente neste lote."})
        response = Response(register_batch_sale(batch, sale.validated_data), status=status.HTTP_201_CREATED)
        batch.refresh_from_db()
        if grazing and batch.status == "sold":
            grazing.exit_date = day
            grazing.save(update_fields=["exit_date"])
        return response

    @action(detail=True, methods=["post"], url_path="record-treatment")
    @transaction.atomic
    def record_treatment(self, request, pk=None):
        from .cattle_batch_results import record_batch_treatment
        batch = AnimalBatch.objects.select_for_update().get(pk=self.get_object().pk)
        return Response(record_batch_treatment(batch, request.user, request.data), status=201)

    @action(detail=True, methods=["get"], url_path="economic-result")
    def economic_result(self, request, pk=None):
        from .cattle_batch_results import batch_result
        if request.user.role not in {"admin", "manager"}:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied()
        yield_percent = serializers.DecimalField(max_digits=5, decimal_places=2, min_value=Decimal(".01"), max_value=100).run_validation(request.query_params["yield_percent"]) if request.query_params.get("yield_percent") else None
        return Response(batch_result(self.get_object(), yield_percent=yield_percent))

    @action(detail=True, methods=["post"], url_path="registrar-mortalidade")
    @transaction.atomic
    def registrar_mortalidade(self, request, pk=None):
        from .cattle_batch_results import record_batch_death
        batch = AnimalBatch.objects.select_for_update().get(pk=self.get_object().pk)
        return Response(record_batch_death(batch, request.user, request.data), status=201)

    @action(detail=True, methods=["post"], url_path="record-cost")
    @transaction.atomic
    def record_cost(self, request, pk=None):
        from .cattle_batch_results import record_batch_cost
        batch = AnimalBatch.objects.select_for_update().get(pk=self.get_object().pk)
        return Response(record_batch_cost(batch, request.user, request.data), status=201)

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

    @action(detail=False, methods=['get'], url_path='mobile-form-options')
    def mobile_form_options(self, request):
        from . import mobile_pasture
        return Response(mobile_pasture.options(request.user, request.query_params))

    @action(detail=True, methods=['get'], url_path='mobile-form')
    def mobile_form(self, request, pk=None):
        from . import mobile_pasture
        return Response(mobile_pasture.data(mobile_pasture.record(request.user, pk, request.query_params)))

    def create(self, request, *args, **kwargs):
        if request.query_params.get('view') == 'mobile':
            from . import mobile_pasture
            mobile_pasture.writable(request.user)
            values = mobile_pasture.Input(data=request.data); values.is_valid(raise_exception=True)
            return Response(mobile_pasture.save(request, values.validated_data), status=201)
        return super().create(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        if request.query_params.get('view') == 'mobile':
            from . import mobile_pasture
            mobile_pasture.writable(request.user)
            values = mobile_pasture.EditInput(data=request.data); values.is_valid(raise_exception=True)
            return Response(mobile_pasture.save(request, values.validated_data, kwargs['pk']))
        return super().partial_update(request, *args, **kwargs)

    def get_queryset(self):
        return (
            CattlePasture.objects.filter(
                farm__organization=self.request.user.organization
            )
            .select_related("farm")
            .annotate(last_exit_date=Subquery(CattleGrazing.objects.filter(pasture_id=OuterRef("pk"), exit_date__isnull=False).order_by("-exit_date").values("exit_date")[:1]))
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

    @action(detail=False, methods=['get'], url_path='mobile-entry-options')
    def mobile_entry_options(self, request):
        from . import mobile_grazing_entry as entry
        return Response(entry.options(request.user, request.query_params))

    @action(detail=False, methods=['get'], url_path='mobile-entry-batches')
    def mobile_entry_batches(self, request):
        from . import mobile_grazing_entry as entry
        page = self.paginate_queryset(entry.batches(request.user, request.query_params))
        return self.get_paginated_response([entry.batch_data(row) for row in page])

    @action(detail=False, methods=['post'], url_path='mobile-entry-preview')
    def mobile_entry_preview(self, request):
        from . import mobile_grazing_entry as entry
        entry.writable(request.user)
        values = entry.Input(data=request.data); values.is_valid(raise_exception=True)
        return Response(entry.preview(request.user, values.validated_data))

    @action(detail=False, methods=['post'], url_path='mobile-entry-confirm')
    def mobile_entry_confirm(self, request):
        from . import mobile_grazing_entry as entry
        from .mobile_vaccination import ConfirmInput
        entry.writable(request.user)
        values = ConfirmInput(data=request.data); values.is_valid(raise_exception=True)
        return Response(entry.confirm(request.user, values.validated_data['preview_token']), status=201)

    @action(detail=False, methods=['get'], url_path='mobile')
    def mobile_list(self, request):
        from . import mobile_grazing
        page = self.paginate_queryset(mobile_grazing.rows(request.user, request.query_params))
        return self.get_paginated_response([mobile_grazing.data(row) for row in page])

    @action(detail=True, methods=['get'], url_path='mobile')
    def mobile_detail(self, request, pk=None):
        from . import mobile_grazing
        from django.shortcuts import get_object_or_404
        row = get_object_or_404(mobile_grazing.rows(request.user, request.query_params), pk=pk)
        return Response(mobile_grazing.data(row))

    def perform_create(self, serializer):
        serializer.instance = enter_cattle_pasture(serializer.validated_data)

    @action(detail=True, methods=['get'], url_path='mobile-transfer-options')
    def mobile_transfer_options(self, request, pk=None):
        from . import mobile_grazing_transfer as transfer
        return Response(transfer.options(request.user, pk, request.query_params))

    @action(detail=True, methods=['get'], url_path='mobile-transfer-destinations')
    def mobile_transfer_destinations(self, request, pk=None):
        from . import mobile_grazing_transfer as transfer, mobile_grazing_entry as entry
        page = self.paginate_queryset(transfer.destinations(request.user, pk, request.query_params))
        return self.get_paginated_response([entry.pasture_data(row) for row in page])

    @action(detail=True, methods=['post'], url_path='mobile-transfer-preview')
    def mobile_transfer_preview(self, request, pk=None):
        from . import mobile_grazing_transfer as transfer
        transfer.entry.writable(request.user)
        values = transfer.Input(data=request.data); values.is_valid(raise_exception=True)
        return Response(transfer.preview(request.user, pk, values.validated_data))

    @action(detail=True, methods=['post'], url_path='mobile-transfer-confirm')
    def mobile_transfer_confirm(self, request, pk=None):
        from . import mobile_grazing_transfer as transfer
        from .mobile_vaccination import ConfirmInput
        transfer.entry.writable(request.user)
        values = ConfirmInput(data=request.data); values.is_valid(raise_exception=True)
        return Response(transfer.confirm(request.user, pk, values.validated_data['preview_token']), status=201)

    @action(detail=True, methods=['get'], url_path='mobile-exit-options')
    def mobile_exit_options(self, request, pk=None):
        from . import mobile_grazing_exit as exit
        return Response(exit.options(request.user, pk, request.query_params))

    @action(detail=True, methods=["post"], url_path="close")
    @transaction.atomic
    def close(self, request, pk=None):
        if request.query_params.get('view') in ('mobile-preview', 'mobile-confirm'):
            from . import mobile_grazing_exit as exit
            exit.writable(request.user)
            if request.query_params['view'] == 'mobile-preview':
                values = exit.Input(data=request.data); values.is_valid(raise_exception=True)
                return Response(exit.preview(request.user, pk, values.validated_data))
            from .mobile_vaccination import ConfirmInput
            values = ConfirmInput(data=request.data); values.is_valid(raise_exception=True)
            return Response(exit.confirm(request.user, pk, values.validated_data['preview_token']))
        grazing = self.get_object()
        day = serializers.DateField(validators=[past_date]).run_validation(
            request.data.get("exit_date")
        )
        from .cattle_services import close_cattle_pasture
        grazing = close_cattle_pasture(grazing, day)
        return Response(self.get_serializer(grazing).data)


@operator_scoped
class CattleMilkViewSet(viewsets.ModelViewSet):
    permission_classes = [CattlePermission]
    serializer_class = CattleMilkSerializer
    write_roles = {"admin", "manager", "operator"}
    filter_backends = [DjangoFilterBackend, SearchFilter]
    filterset_fields = ["animal", "date", "session"]
    search_fields = ["animal__identifier"]

    def perform_destroy(self, instance):
        from .milk_tanks import delete_milk
        delete_milk(instance)

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


    def day_scope(self):
        from django.utils import timezone
        day = serializers.DateField(validators=[past_date]).run_validation(self.request.query_params.get("date", str(timezone.localdate())))
        farm = self.request.query_params.get("farm")
        if farm:
            farm = serializers.UUIDField().run_validation(farm)
        return day, farm

    @action(detail=False, methods=["get"], url_path="day-summary")
    def day_summary(self, request):
        from .cattle_milk import milk_day_summary
        day, farm = self.day_scope()
        return Response(milk_day_summary(request.user.organization, day, farm))

    @action(detail=False, methods=["get"], url_path="cows")
    def cows(self, request):
        from .cattle_milk import milk_cows, milk_cow_row
        day, farm = self.day_scope()
        queryset = milk_cows(request.user.organization, day, farm)
        search = request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(Q(identifier__icontains=search) | Q(cattle_profile__name__icontains=search))
        entry_status = request.query_params.get("entry_status")
        if entry_status == "pending":
            queryset = queryset.filter(has_milk=False, has_daily_total=False)
        elif entry_status == "recorded":
            queryset = queryset.filter(has_milk=True)
        elif entry_status == "total":
            queryset = queryset.filter(has_daily_total=True)
        page = self.paginate_queryset(queryset)
        return self.get_paginated_response([milk_cow_row(animal) for animal in page])


@operator_scoped
class CattleMilkDailyTotalViewSet(viewsets.ModelViewSet):
    permission_classes = [CattlePermission]
    serializer_class = CattleMilkDailyTotalSerializer
    write_roles = {"admin", "manager", "operator"}
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["farm", "date"]

    def perform_destroy(self, instance):
        from .milk_tanks import delete_milk
        delete_milk(instance)

    def get_queryset(self):
        return CattleMilkDailyTotal.objects.filter(farm__organization=self.request.user.organization).select_related("farm")


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
        production = self.request.query_params.get("production")
        if production:
            from .cattle_improvements import filter_purpose
            batches = filter_purpose(AnimalBatch.objects.filter(farm__organization=self.request.user.organization, species__code="bovinos"), production)
            animals = filter_purpose(Animal.objects.filter(farm__organization=self.request.user.organization, species__code="bovinos"), production)
            queryset = queryset.filter(Q(lote_animal__in=batches) | Q(animais__in=animals)).distinct()
        return queryset

    def perform_create(self, serializer):
        record_cattle_feed(serializer, self.request.user)


class CattleManagementViewSet(viewsets.ModelViewSet):
    @action(detail=True, methods=['get'], url_path='mobile-castration-edit')
    def mobile_castration_edit(self, request, pk=None):
        from . import mobile_castration
        return Response(mobile_castration.edit_options(request.user, pk, request.query_params))

    @action(detail=True, methods=['get'], url_path='mobile-collective-medication-review')
    def mobile_collective_medication_review(self, request, pk=None):
        from . import mobile_collective_medication_confirmation as medication
        return Response(medication.preview(request.user, pk, request.query_params))

    @action(detail=True, methods=['get'], url_path='mobile-sanitary-review')
    def mobile_sanitary_review(self, request, pk=None):
        from . import mobile_sanitary_confirmation as sanitary
        return Response(sanitary.preview(request.user, pk, request.query_params))

    @action(detail=True, methods=['get'], url_path='mobile-castration-review')
    def mobile_castration_review(self, request, pk=None):
        from . import mobile_castration_confirmation as castration
        return Response(castration.preview(request.user, pk, request.query_params))

    @action(detail=True, methods=['get'], url_path='mobile-sanitary-edit')
    def mobile_sanitary_edit(self, request, pk=None):
        from . import mobile_sanitary
        return Response(mobile_sanitary.edit_options(request.user, pk, request.query_params))

    @action(detail=False, methods=['get'], url_path='mobile-sanitary-options')
    def mobile_sanitary_options(self, request):
        from . import mobile_sanitary
        return Response(mobile_sanitary.options(request.user, request.query_params))

    @action(detail=False, methods=['get'], url_path='mobile-sanitary-animals')
    def mobile_sanitary_animals(self, request):
        from . import mobile_sanitary
        page = self.paginate_queryset(mobile_sanitary.animals(request.user, request.query_params))
        return self.get_paginated_response([mobile_sanitary.animal_data(row) for row in page])

    @action(detail=True, methods=['get'], url_path='mobile-collective-medication-edit')
    def mobile_collective_medication_edit(self, request, pk=None):
        from . import mobile_collective_medication
        return Response(mobile_collective_medication.edit_options(request.user, pk, request.query_params))

    @action(detail=False, methods=['post'], url_path='mobile-collective-medication-drafts')
    def mobile_collective_medication_drafts(self, request):
        from . import mobile_collective_medication
        from .mobile_grazing_entry import writable
        writable(request.user)
        values = mobile_collective_medication.Input(data=request.data); values.is_valid(raise_exception=True)
        return Response(mobile_collective_medication.create(request.user, values.validated_data), status=201)

    @action(detail=False, methods=['post'], url_path='mobile-sanitary-drafts')
    def mobile_sanitary_drafts(self, request):
        from . import mobile_sanitary
        from .mobile_grazing_entry import writable
        writable(request.user)
        values = mobile_sanitary.Input(data=request.data); values.is_valid(raise_exception=True)
        return Response(mobile_sanitary.create(request.user, values.validated_data), status=201)

    @action(detail=False, methods=['get'], url_path='mobile-castration-options')
    def mobile_castration_options(self, request):
        from . import mobile_castration
        return Response(mobile_castration.options(request.user, request.query_params))

    @action(detail=False, methods=['get'], url_path='mobile-castration-animals')
    def mobile_castration_animals(self, request):
        from . import mobile_castration
        page = self.paginate_queryset(mobile_castration.animals(request.user, request.query_params))
        return self.get_paginated_response([mobile_castration.animal_data(row) for row in page])

    @action(detail=False, methods=['post'], url_path='mobile-castration-drafts')
    def mobile_castration_drafts(self, request):
        from . import mobile_castration
        from .mobile_grazing_entry import writable
        writable(request.user)
        values = mobile_castration.Input(data=request.data); values.is_valid(raise_exception=True)
        return Response(mobile_castration.create(request.user, values.validated_data), status=201)

    @action(detail=True, methods=['get'], url_path='mobile-weighing-edit')
    def mobile_weighing_edit(self, request, pk=None):
        from . import mobile_weighing
        return Response(mobile_weighing.edit_options(request.user, pk, request.query_params))

    def partial_update(self, request, *args, **kwargs):
        if request.query_params.get('view') == 'mobile-collective-medication':
            from . import mobile_collective_medication
            from .mobile_grazing_entry import writable
            writable(request.user)
            values = mobile_collective_medication.EditInput(data=request.data); values.is_valid(raise_exception=True)
            return Response(mobile_collective_medication.update(request.user, kwargs['pk'], values.validated_data))
        if request.query_params.get('view') == 'mobile-sanitary':
            from . import mobile_sanitary
            from .mobile_grazing_entry import writable
            writable(request.user)
            values = mobile_sanitary.EditInput(data=request.data); values.is_valid(raise_exception=True)
            return Response(mobile_sanitary.update(request.user, kwargs['pk'], values.validated_data))
        if request.query_params.get('view') == 'mobile-castration':
            from . import mobile_castration
            from .mobile_grazing_entry import writable
            writable(request.user)
            values = mobile_castration.EditInput(data=request.data); values.is_valid(raise_exception=True)
            return Response(mobile_castration.update(request.user, kwargs['pk'], values.validated_data))
        if request.query_params.get('view') == 'mobile-weighing':
            from . import mobile_weighing
            mobile_weighing.writable(request.user)
            values = mobile_weighing.EditInput(data=request.data); values.is_valid(raise_exception=True)
            return Response(mobile_weighing.update(request.user, kwargs['pk'], values.validated_data))
        return super().partial_update(request, *args, **kwargs)

    @action(detail=True, methods=['get'], url_path='mobile-weighing-review')
    def mobile_weighing_review(self, request, pk=None):
        from . import mobile_weighing_confirmation as weighing
        return Response(weighing.preview(request.user, pk, request.query_params))

    @action(detail=False, methods=['get'], url_path='mobile-weighing-options')
    def mobile_weighing_options(self, request):
        from . import mobile_weighing
        return Response(mobile_weighing.options(request.user, request.query_params))

    @action(detail=False, methods=['get'], url_path='mobile-weighing-animals')
    def mobile_weighing_animals(self, request):
        from . import mobile_weighing
        page = self.paginate_queryset(mobile_weighing.animals(request.user, request.query_params))
        return self.get_paginated_response([mobile_weighing.animal_data(row) for row in page])

    @action(detail=False, methods=['post'], url_path='mobile-weighing-drafts')
    def mobile_weighing_drafts(self, request):
        from . import mobile_weighing
        mobile_weighing.writable(request.user)
        values = mobile_weighing.Input(data=request.data); values.is_valid(raise_exception=True)
        return Response(mobile_weighing.create(request.user, values.validated_data), status=201)

    @action(detail=False, methods=['get'], url_path='mobile')
    def mobile_list(self, request):
        from . import mobile_management
        page = self.paginate_queryset(mobile_management.rows(request.user, request.query_params))
        return self.get_paginated_response([mobile_management.data(row) for row in page])

    @action(detail=True, methods=['get'], url_path='mobile')
    def mobile_detail(self, request, pk=None):
        from . import mobile_management
        from django.shortcuts import get_object_or_404
        row = get_object_or_404(mobile_management.rows(request.user, request.query_params), pk=pk)
        return Response(mobile_management.data(row, detail=True))

    @action(detail=True, methods=['get'], url_path='mobile-participants')
    def mobile_participants(self, request, pk=None):
        from . import mobile_management
        from django.shortcuts import get_object_or_404
        row = get_object_or_404(mobile_management.rows(request.user, request.query_params), pk=pk)
        search = serializers.CharField(max_length=100, allow_blank=True).run_validation(request.query_params.get('participant_search',''))
        page = self.paginate_queryset(mobile_management.participants(row, search))
        return self.get_paginated_response([mobile_management.participant_data(entry) for entry in page])

    @action(detail=False, methods=['get'], url_path='mobile-medication-options')
    def mobile_medication_options(self, request):
        from . import mobile_medication as medication
        return Response(medication.options(request.user))

    @action(detail=False, methods=['get'], url_path='mobile-medication-lots')
    def mobile_medication_lots(self, request):
        from . import mobile_medication as medication
        values = medication.Query(data=request.query_params); values.is_valid(raise_exception=True)
        page = self.paginate_queryset(medication.lots(request.user, values.validated_data['search']))
        return self.get_paginated_response([medication.lot_data(lot) for lot in page])

    @action(detail=False, methods=['post'], url_path='mobile-medication-preview')
    def mobile_medication_preview(self, request):
        from . import mobile_medication as medication
        medication.authorize(request.user)
        values = medication.Input(data=request.data); values.is_valid(raise_exception=True)
        return Response(medication.preview(request.user, values.validated_data))

    @action(detail=False, methods=['post'], url_path='mobile-medication-confirm')
    def mobile_medication_confirm(self, request):
        from . import mobile_medication as medication
        from .mobile_vaccination import ConfirmInput
        medication.authorize(request.user)
        values = ConfirmInput(data=request.data); values.is_valid(raise_exception=True)
        return Response(medication.confirm(request.user, values.validated_data['preview_token']), status=201)

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
        from .cattle_improvements import filter_purpose
        participants = filter_purpose(Animal.objects.filter(farm__organization=self.request.user.organization, species__code="bovinos"), self.request.query_params.get("production"))
        return (
            CattleManagement.objects.filter(
                farm__organization=self.request.user.organization,
                entries__animal__in=participants,
            ).distinct()
            .select_related("farm")
            .prefetch_related("entries__animal")
        )

    @action(detail=True, methods=['get'], url_path='mobile-follow-up')
    def mobile_follow_up(self, request, pk=None):
        from . import mobile_follow_up
        return Response(mobile_follow_up.options(request.user, pk, request.query_params))

    @action(detail=True, methods=['get'], url_path='mobile-follow-up-executions')
    def mobile_follow_up_executions(self, request, pk=None):
        from . import mobile_follow_up, mobile_management
        page = self.paginate_queryset(mobile_follow_up.candidates(request.user, pk, request.query_params))
        return self.get_paginated_response([mobile_management.data(row) for row in page])

    @action(detail=True, methods=["post"], url_path="resolve-follow-up")
    def resolve_follow_up(self, request, pk=None):
        if request.query_params.get('view') == 'mobile-follow-up':
            from . import mobile_follow_up
            from .mobile_grazing_entry import writable
            writable(request.user)
            values = mobile_follow_up.Input(data=request.data); values.is_valid(raise_exception=True)
            return Response(mobile_follow_up.resolve(request.user, pk, values.validated_data))
        from .cattle_planning import resolve_follow_up
        values = CattleFollowUpInput(data=request.data, context={"request": request})
        values.is_valid(raise_exception=True)
        result = resolve_follow_up(self.get_object(), request.user, **values.validated_data)
        return Response(self.get_serializer(result).data)

    @action(detail=True, methods=["post"])
    def confirm(self, request, pk=None):
        if request.query_params.get('view') == 'mobile-collective-medication':
            from . import mobile_collective_medication_confirmation as medication
            from .mobile_vaccination import ConfirmInput
            medication.writable(request.user)
            values = ConfirmInput(data=request.data); values.is_valid(raise_exception=True)
            return Response(medication.confirm(request.user, pk, values.validated_data['preview_token']))
        if request.query_params.get('view') == 'mobile-sanitary':
            from . import mobile_sanitary_confirmation as sanitary
            from .mobile_vaccination import ConfirmInput
            sanitary.writable(request.user)
            values = ConfirmInput(data=request.data); values.is_valid(raise_exception=True)
            return Response(sanitary.confirm(request.user, pk, values.validated_data['preview_token']))
        if request.query_params.get('view') == 'mobile-castration':
            from . import mobile_castration_confirmation as castration
            from .mobile_vaccination import ConfirmInput
            castration.writable(request.user)
            values = ConfirmInput(data=request.data); values.is_valid(raise_exception=True)
            return Response(castration.confirm(request.user, pk, values.validated_data['preview_token']))
        if request.query_params.get('view') == 'mobile-weighing':
            from . import mobile_weighing_confirmation as weighing
            from .mobile_vaccination import ConfirmInput
            weighing.writable(request.user)
            values = ConfirmInput(data=request.data); values.is_valid(raise_exception=True)
            return Response(weighing.confirm(request.user, pk, values.validated_data['preview_token']))
        management = confirm_cattle_management(self.get_object(), request.user)
        return Response(self.get_serializer(management).data)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def cancel(self, request, pk=None):
        if request.query_params.get('view') == 'mobile-collective-medication':
            from . import mobile_collective_medication
            from .mobile_weighing import CancelInput
            from .mobile_grazing_entry import writable
            writable(request.user)
            values = CancelInput(data=request.data); values.is_valid(raise_exception=True)
            return Response(mobile_collective_medication.cancel(request.user, pk, values.validated_data))
        if request.query_params.get('view') == 'mobile-sanitary':
            from . import mobile_sanitary
            from .mobile_grazing_entry import writable
            writable(request.user)
            values = mobile_sanitary.CancelInput(data=request.data); values.is_valid(raise_exception=True)
            return Response(mobile_sanitary.cancel(request.user, pk, values.validated_data))
        if request.query_params.get('view') == 'mobile-castration':
            from . import mobile_castration
            from .mobile_grazing_entry import writable
            writable(request.user)
            values = mobile_castration.CancelInput(data=request.data); values.is_valid(raise_exception=True)
            return Response(mobile_castration.cancel(request.user, pk, values.validated_data))
        if request.query_params.get('view') == 'mobile-weighing':
            from . import mobile_weighing
            mobile_weighing.writable(request.user)
            values = mobile_weighing.CancelInput(data=request.data); values.is_valid(raise_exception=True)
            return Response(mobile_weighing.cancel(request.user, pk, values.validated_data))
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


class CattleFeedPlanViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [CattlePermission]
    create_roles = {"admin", "manager"}
    http_method_names = ["get", "head", "options"]
    serializer_class = CattleFeedPlanSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter]
    filterset_fields = ["batch", "is_active"]
    search_fields = ["batch__batch_code", "item__nome"]

    def get_queryset(self):
        from .cattle_operations import feed_plans
        if self.request.user.role not in {"admin", "manager"}:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Planejamento nutricional exige gerente ou administrador.")
        query = feed_plans().filter(batch__farm__organization=self.request.user.organization)
        if self.request.query_params.get("farm"):
            query = query.filter(batch__farm_id=serializers.UUIDField().run_validation(self.request.query_params["farm"]))
        return query.order_by("batch__batch_code", "item__nome", "id")

    @action(detail=True, methods=["get"])
    def deliveries(self, request, pk=None):
        plan = self.get_object()
        rows = self.paginate_queryset(plan.deliveries.order_by("-date", "-created_at"))
        return self.get_paginated_response(CattleFeedDeliverySerializer(rows, many=True).data)


class CattleDailyFeedingView(APIView):
    """Operational projection excluding inventory prices and costs."""
    permission_classes = [CattlePermission]
    create_roles = {"admin", "manager", "feeder"}

    def get(self, request):
        if request.query_params.get('view') == 'mobile':
            from .cattle_daily_feeding import mobile_daily_feeding
            return mobile_daily_feeding(request)
        from .cattle_daily_feeding import daily_feeding
        return Response(daily_feeding(request.user.organization))

    def post(self, request):
        from .cattle_feeding import register_daily_feed
        from .cattle_serializers import CattleDailyFeedInput
        values = CattleDailyFeedInput(data=request.data)
        values.is_valid(raise_exception=True)
        record = register_daily_feed(request, **values.validated_data)
        return Response({"id": str(record.pk), "date": record.data_inicio, "quantity_kg": record.quantidade}, status=201)


class CattleTroughReadingViewSet(viewsets.GenericViewSet):
    permission_classes = [CattlePermission]
    create_roles = {"admin", "manager"}
    http_method_names = ["get", "post", "head", "options"]

    def get_queryset(self):
        from rest_framework.exceptions import PermissionDenied
        from .models import CattleTroughReading
        if self.request.user.role not in {"admin", "manager"}:
            raise PermissionDenied("Leituras do cocho exigem gerente ou administrador.")
        rows = CattleTroughReading.objects.filter(batch__farm__organization=self.request.user.organization).select_related("batch__farm", "formula", "created_by")
        for field, path in [("farm", "batch__farm_id"), ("batch", "batch_id")]:
            if self.request.query_params.get(field):
                rows = rows.filter(**{path: serializers.UUIDField().run_validation(self.request.query_params[field])})
        if self.request.query_params.get("production"):
            from .cattle_improvements import filter_purpose
            batches = filter_purpose(AnimalBatch.objects.filter(farm__organization=self.request.user.organization, species__code="bovinos"), self.request.query_params["production"])
            rows = rows.filter(batch__in=batches)
        return rows.order_by("-date", "-created_at", "-id")

    def list(self, request):
        from .cattle_serializers import CattleTroughReadingSerializer
        page = self.paginate_queryset(self.get_queryset())
        return self.get_paginated_response(CattleTroughReadingSerializer(page, many=True).data)

    def create(self, request):
        from .cattle_feeding import record_trough_reading
        from .cattle_serializers import CattleTroughReadingSerializer, CattleTroughReadingInput
        self.get_queryset()
        values = CattleTroughReadingInput(data=request.data)
        values.is_valid(raise_exception=True)
        reading = record_trough_reading(request.user, **values.validated_data)
        return Response(CattleTroughReadingSerializer(reading).data, status=201)
