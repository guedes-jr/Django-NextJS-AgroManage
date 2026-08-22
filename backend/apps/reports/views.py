"""
Reports app views — dashboard summary scoped by organization.
"""

from datetime import date
from dateutil.relativedelta import relativedelta

from decimal import Decimal

from django.db.models import Count, DecimalField, ExpressionWrapper, F, Q, Sum
from django.db.models.functions import Coalesce, TruncMonth
from django.utils import timezone

from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.farms.models import Farm
from apps.livestock.models import AnimalBatch, Species
from apps.crops.models import Field, PlantingCycle
from apps.inventory.models import ConsumoRacao, ItemEstoque, LoteEstoque
from apps.finance.models import Transaction, FinancialCategory
from apps.tasks.models import Task
from common.permissions import OrganizationRolePermission
from .models import (
    GeneratedReport,
    ReportConfig,
    ReportFormat,
    ReportSchedule,
    ReportStatus,
    ReportType,
    ReportWidget,
)
from .serializers import (
    GeneratedReportCreateSerializer,
    GeneratedReportSerializer,
    ReportConfigCreateSerializer,
    ReportConfigSerializer,
    ReportScheduleCreateSerializer,
    ReportScheduleSerializer,
    ReportWidgetSerializer,
)
from .services import FinancialReportService, LivestockReportService, StockReportService


def _org(request):
    """Return the user's organization or None."""
    return getattr(request.user, "organization", None)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def crops_general_report(request):
    """Consolidated crop report used by the general plantations report screen."""
    from collections import defaultdict
    from apps.crops.models import (
        Fertigation,
        Fertilization,
        Irrigation,
        LandPreparation,
        PesticideApplication,
        SectorStructureItem,
    )

    org = _org(request)
    if not org:
        return Response({"detail": "Usuário sem organização."}, status=status.HTTP_400_BAD_REQUEST)

    today = timezone.localdate()
    try:
        start_date = date.fromisoformat(request.query_params.get("start_date", ""))
    except ValueError:
        start_date = today.replace(month=1, day=1)
    try:
        end_date = date.fromisoformat(request.query_params.get("end_date", ""))
    except ValueError:
        end_date = today
    if start_date > end_date:
        return Response({"detail": "A data inicial deve ser anterior à data final."}, status=status.HTTP_400_BAD_REQUEST)

    cycles = PlantingCycle.objects.filter(
        organization=org,
        planting_date__lte=end_date,
    ).filter(
        Q(actual_harvest_date__gte=start_date)
        | Q(actual_harvest_date__isnull=True, expected_harvest_date__gte=start_date)
        | Q(actual_harvest_date__isnull=True, expected_harvest_date__isnull=True)
    ).select_related("field", "farm")

    crop = request.query_params.get("crop", "").strip()
    farm = request.query_params.get("farm", "").strip()
    cycle_status = request.query_params.get("status", "").strip()
    if crop:
        cycles = cycles.filter(crop_name__iexact=crop)
    if farm:
        cycles = cycles.filter(farm_id=farm)
    if cycle_status:
        cycles = cycles.filter(status=cycle_status)

    cycle_ids = list(cycles.values_list("id", flat=True))
    transactions = Transaction.objects.filter(
        organization=org,
        planting_cycle_id__in=cycle_ids,
        due_date__range=(start_date, end_date),
    ).exclude(status=Transaction.Status.CANCELLED).select_related("category")

    expense_by_cycle = defaultdict(Decimal)
    revenue_actual_by_cycle = defaultdict(Decimal)
    costs_by_category = defaultdict(Decimal)
    for transaction in transactions:
        if transaction.category.category_type == FinancialCategory.CategoryType.EXPENSE:
            expense_by_cycle[transaction.planting_cycle_id] += transaction.amount
            name = (transaction.category.name or "Outros").strip()
            costs_by_category[name] += transaction.amount
        else:
            revenue_actual_by_cycle[transaction.planting_cycle_id] += transaction.amount

    structures = SectorStructureItem.objects.filter(
        plantation_id__in=cycle_ids,
        created_at__date__range=(start_date, end_date),
    )
    structure_by_cycle = defaultdict(Decimal)
    for item in structures:
        structure_by_cycle[item.plantation_id] += item.total_value
        costs_by_category["Estruturas"] += item.total_value

    rows = []
    total_area = Decimal("0")
    total_cost = Decimal("0")
    total_revenue = Decimal("0")
    total_production = Decimal("0")
    field_ids = set()
    crops = set()
    for cycle in cycles.order_by("crop_name", "field__name"):
        area = cycle.planted_area_ha or cycle.field.area_ha or Decimal("0")
        cost = expense_by_cycle[cycle.id] + structure_by_cycle[cycle.id]
        predicted_revenue = cycle.estimated_revenue or Decimal("0")
        predicted_production = cycle.estimated_production_kg or Decimal("0")
        profit = predicted_revenue - cost
        margin = (profit / predicted_revenue * 100) if predicted_revenue else Decimal("0")
        cost_per_kg = (cost / predicted_production) if predicted_production else Decimal("0")
        profit_per_kg = (profit / predicted_production) if predicted_production else Decimal("0")
        cultivation_end = min(end_date, cycle.actual_harvest_date or end_date)
        days = max((cultivation_end - cycle.planting_date).days, 0)

        total_area += area
        total_cost += cost
        total_revenue += predicted_revenue
        total_production += predicted_production
        field_ids.add(cycle.field_id)
        crops.add(cycle.crop_name)
        rows.append({
            "id": str(cycle.id),
            "name": cycle.name or cycle.crop_name,
            "crop": cycle.crop_name,
            "field": cycle.field.name,
            "area_ha": float(area),
            "planting_date": cycle.planting_date.isoformat(),
            "days": days,
            "predicted_production_kg": float(predicted_production),
            "cost": float(cost),
            "predicted_revenue": float(predicted_revenue),
            "actual_revenue": float(revenue_actual_by_cycle[cycle.id]),
            "predicted_profit": float(profit),
            "margin": float(margin.quantize(Decimal("0.01"))),
            "cost_per_kg": float(cost_per_kg.quantize(Decimal("0.01"))),
            "profit_per_kg": float(profit_per_kg.quantize(Decimal("0.01"))),
        })

    total_profit = total_revenue - total_cost
    total_margin = (total_profit / total_revenue * 100) if total_revenue else Decimal("0")
    average_price = (total_revenue / total_production) if total_production else Decimal("0")

    irrigation_qs = Irrigation.objects.filter(
        plantation_id__in=cycle_ids,
        date__range=(start_date, end_date),
    )
    irrigation_totals = irrigation_qs.aggregate(
        water=Coalesce(Sum("liters_used"), Decimal("0")),
        energy=Coalesce(Sum("energy_kwh"), Decimal("0")),
        pump_hours=Coalesce(Sum("hours"), Decimal("0")),
    )
    tractor_hours = LandPreparation.objects.filter(
        plantation_id__in=cycle_ids,
        date__range=(start_date, end_date),
    ).aggregate(total=Coalesce(Sum("hours_worked"), Decimal("0")))["total"]

    applications = []
    for item in Fertilization.objects.filter(
        plantation_id__in=cycle_ids, application_date__range=(start_date, end_date)
    ).select_related("item"):
        applications.append({
            "id": str(item.id), "date": item.application_date.isoformat(),
            "product": item.item.nome, "purpose": item.get_application_method_display(),
            "area_ha": float(item.area_applied_ha or 0), "quantity": float(item.quantity),
            "unit": item.unit, "equipment": "—", "type": "Adubação",
        })
    for item in Fertigation.objects.filter(
        plantation_id__in=cycle_ids, application_date__range=(start_date, end_date)
    ).select_related("item"):
        applications.append({
            "id": str(item.id), "date": item.application_date.isoformat(),
            "product": item.item.nome, "purpose": "Fertirrigação",
            "area_ha": float(item.area_applied_ha or 0), "quantity": float(item.quantity),
            "unit": item.unit, "equipment": "Sistema de irrigação", "type": "Fertirrigação",
        })
    for item in PesticideApplication.objects.filter(
        plantation_id__in=cycle_ids, application_date__range=(start_date, end_date)
    ).select_related("item"):
        applications.append({
            "id": str(item.id), "date": item.application_date.isoformat(),
            "product": item.item.nome, "purpose": item.target or item.get_pesticide_type_display(),
            "area_ha": float(item.area_applied_ha or 0), "quantity": float(item.quantity),
            "unit": item.unit, "equipment": item.equipment or "—", "type": "Defensivo",
        })
    applications.sort(key=lambda item: item["date"], reverse=True)

    cost_total = sum(costs_by_category.values(), Decimal("0"))
    cost_distribution = [
        {
            "name": name,
            "value": float(value),
            "percentage": float((value / cost_total * 100).quantize(Decimal("0.01"))) if cost_total else 0,
        }
        for name, value in sorted(costs_by_category.items(), key=lambda pair: pair[1], reverse=True)
        if value
    ]

    return Response({
        "period": {"start_date": start_date.isoformat(), "end_date": end_date.isoformat()},
        "filters": {"crops": sorted(crops)},
        "kpis": {
            "area_ha": float(total_area), "fields": len(field_ids), "cost": float(total_cost),
            "predicted_revenue": float(total_revenue), "predicted_profit": float(total_profit),
            "margin": float(total_margin.quantize(Decimal("0.01"))),
            "predicted_production_kg": float(total_production), "average_price_per_kg": float(average_price),
        },
        "plantations": rows,
        "cost_distribution": cost_distribution,
        "consumption": {
            "water_liters": float(irrigation_totals["water"]),
            "energy_kwh": float(irrigation_totals["energy"]),
            "pump_hours": float(irrigation_totals["pump_hours"]),
            "tractor_hours": float(tractor_hours),
        },
        "applications": applications,
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def dashboard_summary(request):
    """
    Aggregated KPIs and chart data scoped to the requesting user's organization.
    """
    org = _org(request)
    today = date.today()
    month_start = today.replace(day=1)

    # ── Farms ─────────────────────────────────────────────────────────────────
    farms_qs = Farm.objects.filter(organization=org, is_active=True)
    farm_ids = list(farms_qs.values_list("id", flat=True))

    # ── Livestock ─────────────────────────────────────────────────────────────
    batches_qs = AnimalBatch.objects.filter(
        farm__in=farm_ids, status=AnimalBatch.Status.ACTIVE
    )
    total_animals = batches_qs.aggregate(total=Sum("quantity"))["total"] or 0

    herd_by_species = list(
        batches_qs.values("species__name")
        .annotate(total=Sum("quantity"))
        .order_by("-total")
    )

    # ── Crops ─────────────────────────────────────────────────────────────────
    fields_qs = Field.objects.filter(farm__in=farm_ids, is_active=True)
    planted_area = fields_qs.aggregate(total=Sum("area_ha"))["total"] or 0

    active_cycles = PlantingCycle.objects.filter(
        field__in=fields_qs,
        status__in=[
            PlantingCycle.Status.PLANTING,
            PlantingCycle.Status.GROWING,
            PlantingCycle.Status.HARVESTING,
        ],
    )
    production_by_crop = list(
        active_cycles.values("crop_name").annotate(count=Count("id")).order_by("-count")
    )

    # ── Inventory ─────────────────────────────────────────────────────────────
    inventory_qs = ItemEstoque.objects.filter(organization=org, ativo=True)
    total_items = inventory_qs.count()

    inventory_value_expression = ExpressionWrapper(
        F("quantidade_atual")
        * Coalesce(
            F("custo_unitario"),
            Decimal("0.00"),
            output_field=DecimalField(max_digits=10, decimal_places=2),
        ),
        output_field=DecimalField(max_digits=20, decimal_places=2),
    )

    inventory_value = LoteEstoque.objects.filter(
        item__organization=org,
        item__ativo=True,
        ativo=True,
    ).aggregate(
        total=Coalesce(
            Sum(inventory_value_expression),
            Decimal("0.00"),
            output_field=DecimalField(max_digits=20, decimal_places=2),
        )
    )["total"]

    low_stock_count = (
        inventory_qs.annotate(
            estoque_atual_calc=Coalesce(
                Sum(
                    "lotes__quantidade_atual",
                    filter=Q(lotes__ativo=True),
                ),
                Decimal("0.00"),
                output_field=DecimalField(max_digits=10, decimal_places=2),
            )
        )
        .filter(estoque_atual_calc__lt=F("estoque_minimo"))
        .count()
    )
    # ── Finance ───────────────────────────────────────────────────────────────
    transactions_qs = Transaction.objects.filter(organization=org)

    # KPI: receita do mês atual
    month_revenue = (
        transactions_qs.filter(
            category__category_type=FinancialCategory.CategoryType.REVENUE,
            payment_date__gte=month_start,
            payment_date__lte=today,
            status=Transaction.Status.PAID,
        ).aggregate(total=Sum("amount"))["total"]
        or 0
    )
    month_expense = (
        transactions_qs.filter(
            category__category_type=FinancialCategory.CategoryType.EXPENSE,
            payment_date__gte=month_start,
            payment_date__lte=today,
            status=Transaction.Status.PAID,
        ).aggregate(total=Sum("amount"))["total"]
        or 0
    )

    def financial_breakdown(queryset, category_type, label_field="category__name"):
        return [
            {"name": row[label_field] or "Outros", "value": float(row["total"])}
            for row in queryset.filter(category__category_type=category_type)
            .values(label_field)
            .annotate(total=Sum("amount"))
            .order_by("-total")[:5]
            if row["total"]
        ]

    paid_month = transactions_qs.filter(
        payment_date__gte=month_start,
        payment_date__lte=today,
        status=Transaction.Status.PAID,
    )
    # Stock purchases do not belong to a planting cycle yet, but agricultural
    # inputs must still be represented in the organization crop segment.
    agricultural_categories = {
        "semente",
        "fertilizante",
        "corretivo",
        "fertirrigacao",
        "defensivo",
        "foliar",
    }
    agricultural_item_ids = []
    for item in ItemEstoque.objects.filter(organization=org).values(
        "id", "categoria", "categorias", "especie_animal"
    ):
        categories = set(item["categorias"] or [])
        if item["categoria"]:
            categories.add(item["categoria"])
        if not item["especie_animal"] and categories.intersection(
            agricultural_categories
        ):
            agricultural_item_ids.append(item["id"])

    agricultural_lot_references = [
        f"LOTE-{lot_id}"
        for lot_id in LoteEstoque.objects.filter(
            item_id__in=agricultural_item_ids,
            data_entrada__gte=month_start,
            data_entrada__lte=today,
        ).values_list("id", flat=True)
    ]
    crop_transactions = paid_month.filter(
        Q(planting_cycle__isnull=False)
        | Q(reference__in=agricultural_lot_references)
    )
    crop_cost = crop_transactions.filter(
        category__category_type=FinancialCategory.CategoryType.EXPENSE
    ).aggregate(total=Sum("amount"))["total"] or Decimal("0")
    crop_revenue = crop_transactions.filter(
        category__category_type=FinancialCategory.CategoryType.REVENUE
    ).aggregate(total=Sum("amount"))["total"] or Decimal("0")

    livestock_terms = Q(category__name__icontains="suín") | Q(category__name__icontains="suin")
    livestock_terms |= Q(category__name__icontains="animal") | Q(category__name__icontains="rebanho")
    livestock_transactions = paid_month.filter(planting_cycle__isnull=True).filter(livestock_terms)
    livestock_finance_cost = livestock_transactions.filter(
        category__category_type=FinancialCategory.CategoryType.EXPENSE
    ).aggregate(total=Sum("amount"))["total"] or Decimal("0")
    livestock_revenue = livestock_transactions.filter(
        category__category_type=FinancialCategory.CategoryType.REVENUE
    ).aggregate(total=Sum("amount"))["total"] or Decimal("0")
    feed_consumption = ConsumoRacao.objects.filter(
        organization=org,
        data_inicio__gte=month_start,
        data_inicio__lte=today,
    )
    feed_cost = feed_consumption.aggregate(total=Sum("custo_total"))["total"] or Decimal("0")
    livestock_cost = livestock_finance_cost + feed_cost

    def segment_payload(cost, revenue, costs, revenues):
        profit = revenue - cost
        margin = (profit / revenue * 100) if revenue else Decimal("0")
        return {
            "cost": float(cost),
            "revenue": float(revenue),
            "profit": float(profit),
            "margin": float(margin.quantize(Decimal("0.01"))),
            "cost_breakdown": costs,
            "revenue_breakdown": revenues,
        }

    livestock_cost_breakdown = financial_breakdown(
        livestock_transactions, FinancialCategory.CategoryType.EXPENSE
    )
    feed_breakdown = [
        {"name": row["item_estoque__nome"] or "Ração", "value": float(row["total"])}
        for row in feed_consumption.values("item_estoque__nome")
        .annotate(total=Sum("custo_total")).order_by("-total")[:5]
        if row["total"]
    ]
    livestock_cost_breakdown = feed_breakdown + livestock_cost_breakdown

    # Cada atividade pecuária ganha seu próprio card na dashboard. Suinocultura
    # permanece disponível mesmo antes do primeiro lote ser cadastrado.
    organization_species = list(
        Species.objects.filter(batches__farm__in=farm_ids)
        .distinct()
        .order_by("name")
    )
    swine = Species.objects.filter(code__in=["suinos", "suino"]).first()
    if swine:
        organization_species = [item for item in organization_species if item.pk != swine.pk]
        organization_species.insert(0, swine)

    def species_title(species):
        code = species.code.lower()
        if code in {"suino", "suinos"}:
            return "Suinocultura"
        if code in {"ave", "aves"}:
            return "Aves"
        return species.name

    livestock_by_species = []
    for species in organization_species:
        species_batches = AnimalBatch.objects.filter(
            farm__in=farm_ids, species=species
        ).values_list("id", flat=True)
        species_references = (
            Q(reference__in=[f"PURCHASE-BATCH-{batch_id}" for batch_id in species_batches])
            | Q(reference__in=[f"SALE-BATCH-{batch_id}" for batch_id in species_batches])
        )
        species_terms = Q(description__icontains=species.name) | Q(category__name__icontains=species.name)
        if species.code.lower() in {"suino", "suinos"}:
            species_terms |= Q(description__icontains="suin") | Q(category__name__icontains="suin")
        species_transactions = paid_month.filter(species_references | species_terms)
        species_feed = feed_consumption.filter(
            Q(lote_animal__species=species) | Q(animais__species=species)
        ).distinct()
        species_cost = (
            species_transactions.filter(category__category_type=FinancialCategory.CategoryType.EXPENSE)
            .aggregate(total=Sum("amount"))["total"] or Decimal("0")
        ) + (species_feed.aggregate(total=Sum("custo_total"))["total"] or Decimal("0"))
        species_revenue = species_transactions.filter(
            category__category_type=FinancialCategory.CategoryType.REVENUE
        ).aggregate(total=Sum("amount"))["total"] or Decimal("0")
        species_costs = financial_breakdown(
            species_transactions, FinancialCategory.CategoryType.EXPENSE
        )
        species_costs = [
            {"name": row["item_estoque__nome"] or "Ração", "value": float(row["total"])}
            for row in species_feed.values("item_estoque__nome").annotate(total=Sum("custo_total")).order_by("-total")[:5]
            if row["total"]
        ] + species_costs
        livestock_by_species.append({
            "code": species.code,
            "name": species_title(species),
            **segment_payload(
                species_cost,
                species_revenue,
                species_costs,
                financial_breakdown(species_transactions, FinancialCategory.CategoryType.REVENUE),
            ),
        })

    recent_transactions = [
        {
            "title": transaction.description,
            "date": (transaction.payment_date or transaction.due_date).isoformat(),
            "type": transaction.category.category_type,
            "amount": float(transaction.amount),
            "category": transaction.category.name,
        }
        for transaction in transactions_qs.filter(
            status=Transaction.Status.PAID,
            payment_date__isnull=False,
        ).select_related("category").order_by("-payment_date", "-created_at")[:4]
    ]

    # Chart: last 7 months revenue vs expense
    seven_months_ago = (today - relativedelta(months=6)).replace(day=1)
    monthly_finance = list(
        transactions_qs.filter(
            payment_date__gte=seven_months_ago,
            payment_date__lte=today,
            status=Transaction.Status.PAID,
        )
        .annotate(month=TruncMonth("payment_date"))
        .values("month", "category__category_type")
        .annotate(total=Sum("amount"))
        .order_by("month")
    )

    # Mantém os sete meses no gráfico, inclusive os meses sem lançamentos.
    # Isso garante que a comparação da tela seja sempre mês atual x mês anterior.
    finance_map: dict = {}
    for offset in range(7):
        bucket_date = seven_months_ago + relativedelta(months=offset)
        key = bucket_date.strftime("%Y-%m")
        finance_map[key] = {
            "mes": bucket_date.strftime("%b"),
            "receita": 0,
            "despesa": 0,
        }

    for row in monthly_finance:
        key = row["month"].strftime("%Y-%m")
        if row["category__category_type"] == FinancialCategory.CategoryType.REVENUE:
            finance_map[key]["receita"] += float(row["total"])
        else:
            finance_map[key]["despesa"] += float(row["total"])

    revenue_chart = list(finance_map.values())

    # ── Tasks ─────────────────────────────────────────────────────────────────
    tasks_qs = (
        Task.objects.filter(
            organization=org,
            status__in=[Task.Status.OPEN, Task.Status.IN_PROGRESS],
        )
        .select_related("farm")
        .order_by("due_date")[:10]
    )

    tasks_data = [
        {
            "title": t.title,
            "due_date": t.due_date.isoformat() if t.due_date else None,
            "priority": t.priority,
            "status": t.status,
            "farm": t.farm.name if t.farm else None,
        }
        for t in tasks_qs
    ]

    return Response(
        {
            "organization": org.name if org else None,
            "kpis": {
                "month_revenue": float(month_revenue),
                "month_expense": float(month_expense),
                "total_animals": total_animals,
                "planted_area_ha": float(planted_area),
                "inventory_items": total_items,
                "total_inventory_value": float(inventory_value),
                "low_stock_items": low_stock_count,
                "farms_count": farms_qs.count(),
            },
            "charts": {
                "revenue_vs_expense": revenue_chart,
                "herd_by_species": [
                    {"name": r["species__name"], "value": r["total"]}
                    for r in herd_by_species
                ],
                "production_by_crop": [
                    {"cultura": r["crop_name"], "ciclos": r["count"]}
                    for r in production_by_crop
                ],
            },
            "segments": {
                "crops": segment_payload(
                    crop_cost,
                    crop_revenue,
                    financial_breakdown(crop_transactions, FinancialCategory.CategoryType.EXPENSE),
                    financial_breakdown(crop_transactions, FinancialCategory.CategoryType.REVENUE, "planting_cycle__crop_name"),
                ),
                "livestock": segment_payload(
                    livestock_cost,
                    livestock_revenue,
                    livestock_cost_breakdown,
                    financial_breakdown(livestock_transactions, FinancialCategory.CategoryType.REVENUE),
                ),
                "livestock_by_species": livestock_by_species,
            },
            "recent_activities": recent_transactions,
            "tasks": tasks_data,
        }
    )


# === Report Management Views ===


class ReportConfigViewSet(viewsets.ModelViewSet):
    serializer_class = ReportConfigSerializer
    permission_classes = [OrganizationRolePermission]
    write_roles = {"owner", "admin", "manager", "operator"}
    delete_roles = {"owner", "admin"}
    operator_edits_own_only = True

    def get_queryset(self):
        org = getattr(self.request.user, "organization", None)
        if not org:
            return ReportConfig.objects.none()
        return ReportConfig.objects.filter(organization=org)

    def get_serializer_class(self):
        if self.action == "create":
            return ReportConfigCreateSerializer
        return ReportConfigSerializer

    def perform_create(self, serializer):
        serializer.save()

    @action(detail=False, methods=["get"])
    def options(self, request):
        """Retorna as opções disponíveis para configuração de relatórios"""
        report_types = [
            {"value": rt.value, "label": rt.label} for rt in ReportType.choices
        ]
        formats = [{"value": f.value, "label": f.label} for f in ReportFormat.choices]
        frequencies = [
            {"value": fr.value, "label": fr.label}
            for fr in ["daily", "weekly", "monthly", "quarterly", "yearly"]
        ]
        return Response(
            {
                "report_types": report_types,
                "formats": formats,
                "frequencies": frequencies,
            }
        )


class ReportScheduleViewSet(viewsets.ModelViewSet):
    serializer_class = ReportScheduleSerializer
    permission_classes = [OrganizationRolePermission]
    write_roles = {"owner", "admin", "manager", "operator"}
    delete_roles = {"owner", "admin"}
    operator_edits_own_only = True

    def get_queryset(self):
        org = getattr(self.request.user, "organization", None)
        if not org:
            return ReportSchedule.objects.none()
        return ReportSchedule.objects.filter(organization=org)

    def get_serializer_class(self):
        if self.action == "create":
            return ReportScheduleCreateSerializer
        return ReportScheduleSerializer

    @action(detail=True, methods=["post"])
    def run_now(self, request, pk=None):
        """Executa o agendamento imediatamente"""
        schedule = self.get_object()
        # Aqui seria chamada a task de geração
        schedule.last_run = timezone.now()
        schedule.save()
        return Response({"status": "Agendamento iniciado"})


class GeneratedReportViewSet(viewsets.ModelViewSet):
    serializer_class = GeneratedReportSerializer
    permission_classes = [OrganizationRolePermission]
    write_roles = {"owner", "admin", "manager", "operator"}
    delete_roles = {"owner", "admin"}
    operator_edits_own_only = True
    operator_owner_field = "generated_by_id"

    def get_queryset(self):
        org = getattr(self.request.user, "organization", None)
        if not org:
            return GeneratedReport.objects.none()
        return GeneratedReport.objects.filter(organization=org)

    def get_serializer_class(self):
        if self.action == "create":
            return GeneratedReportCreateSerializer
        return GeneratedReportSerializer

    @action(detail=False, methods=["post"])
    def generate(self, request):
        """Gera um novo relatório"""
        serializer = GeneratedReportCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        org = getattr(request.user, "organization", None)
        if not org:
            return Response({"detail": "Organização não encontrada"}, status=status.HTTP_404_NOT_FOUND)
        report_config = None
        report_config_id = serializer.validated_data.get("report_config")
        if report_config_id:
            try:
                report_config = ReportConfig.objects.get(pk=report_config_id, organization=org)
            except ReportConfig.DoesNotExist:
                return Response(
                    {"report_config": "Configuração de relatório inválida para esta organização."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        report = GeneratedReport.objects.create(
            organization=org,
            report_config=report_config,
            name=serializer.validated_data["name"],
            report_type=serializer.validated_data["report_type"],
            filters=serializer.validated_data.get("filters", {}),
            date_range=serializer.validated_data.get("date_range", {}),
            format_used=serializer.validated_data.get("format", ReportFormat.PDF),
            status=ReportStatus.PROCESSING,
            started_at=timezone.now(),
            generated_by=request.user,
        )

        # Simular geração (na implementação real seria uma task Celery)
        # Por agora, apenas cria o registro
        report.status = ReportStatus.COMPLETED
        report.completed_at = timezone.now()
        report.save()

        return Response(
            GeneratedReportSerializer(report).data, status=status.HTTP_201_CREATED
        )

    @action(detail=True, methods=["get"])
    def download(self, request, pk=None):
        """Download do arquivo gerado"""
        report = self.get_object()
        if not report.file:
            return Response(
                {"detail": "Arquivo não disponível"}, status=status.HTTP_404_NOT_FOUND
            )

        # Retorna URL para download
        return Response({"download_url": report.file.url})


class ReportWidgetViewSet(viewsets.ModelViewSet):
    serializer_class = ReportWidgetSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        org = getattr(self.request.user, "organization", None)
        if not org:
            return ReportWidget.objects.none()
        return ReportWidget.objects.filter(organization=org)

    @action(detail=False, methods=["get"])
    def reorder(self, request):
        """Reordena widgets via drag-and-drop"""
        widgets_data = request.data.get("widgets", [])
        for item in widgets_data:
            ReportWidget.objects.filter(
                id=item["id"], organization=request.user.organization
            ).update(
                position_x=item.get("position_x", 0),
                position_y=item.get("position_y", 0),
                width=item.get("width", 4),
                height=item.get("height", 3),
            )
        return Response({"status": "Widgets reordenados"})


# === Report Data Endpoints ===


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def stock_general_report(request):
    """Relatório geral de estoque"""
    org = getattr(request.user, "organization", None)
    if not org:
        return Response(
            {"detail": "Organização não encontrada"}, status=status.HTTP_404_NOT_FOUND
        )

    filters = {}
    if request.GET.get("category"):
        filters["category"] = request.GET.get("category")
    if request.GET.get("search"):
        filters["search"] = request.GET.get("search")

    data = StockReportService.get_general_stock(org, filters)
    return Response(data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def stock_movement_report(request):
    """Relatório de movimentações de estoque"""
    org = getattr(request.user, "organization", None)
    if not org:
        return Response(
            {"detail": "Organização não encontrada"}, status=status.HTTP_404_NOT_FOUND
        )

    date_range = {}
    if request.GET.get("start"):
        date_range["start"] = request.GET.get("start")
    if request.GET.get("end"):
        date_range["end"] = request.GET.get("end")

    data = StockReportService.get_stock_movement(
        org, date_range if date_range else None
    )
    return Response(data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def stock_low_report(request):
    """Relatório de estoque mínimo"""
    org = getattr(request.user, "organization", None)
    if not org:
        return Response(
            {"detail": "Organização não encontrada"}, status=status.HTTP_404_NOT_FOUND
        )

    data = StockReportService.get_low_stock(org)
    return Response(data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def stock_expiry_report(request):
    """Relatório de validade"""
    org = getattr(request.user, "organization", None)
    if not org:
        return Response(
            {"detail": "Organização não encontrada"}, status=status.HTTP_404_NOT_FOUND
        )

    days = int(request.GET.get("days", 30))
    data = StockReportService.get_expiry_report(org, days)
    return Response(data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def finance_cashflow_report(request):
    """Relatório de fluxo de caixa"""
    org = getattr(request.user, "organization", None)
    if not org:
        return Response(
            {"detail": "Organização não encontrada"}, status=status.HTTP_404_NOT_FOUND
        )

    date_range = {}
    if request.GET.get("start"):
        date_range["start"] = request.GET.get("start")
    if request.GET.get("end"):
        date_range["end"] = request.GET.get("end")

    data = FinancialReportService.get_cashflow(org, date_range if date_range else None)
    return Response(data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def livestock_inventory_report(request):
    """Relatório de inventário de rebanho"""
    org = getattr(request.user, "organization", None)
    if not org:
        return Response(
            {"detail": "Organização não encontrada"}, status=status.HTTP_404_NOT_FOUND
        )

    filters = {}
    if request.GET.get("species"):
        filters["species"] = request.GET.get("species")
    if request.GET.get("category"):
        filters["category"] = request.GET.get("category")
    if request.GET.get("status"):
        filters["status"] = request.GET.get("status")
    if request.GET.get("search"):
        filters["search"] = request.GET.get("search")

    data = LivestockReportService.get_inventory(org, filters)
    return Response(data)
