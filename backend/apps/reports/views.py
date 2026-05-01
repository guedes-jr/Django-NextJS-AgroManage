"""
Reports app views — dashboard summary scoped by organization.
"""
from datetime import date
from dateutil.relativedelta import relativedelta

from django.db.models import Sum, Count, Q
from django.db.models.functions import TruncMonth

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.farms.models import Farm
from apps.livestock.models import AnimalBatch, Species
from apps.crops.models import Field, PlantingCycle
from apps.inventory.models import ItemEstoque
from apps.finance.models import Transaction, FinancialCategory
from apps.tasks.models import Task


def _org(request):
    """Return the user's organization or None."""
    return getattr(request.user, "organization", None)


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
        active_cycles.values("crop_name")
        .annotate(count=Count("id"))
        .order_by("-count")
    )

    # ── Inventory ─────────────────────────────────────────────────────────────
    from django.db.models import F
    inventory_qs = ItemEstoque.objects.filter(organization=org, ativo=True)
    total_items = inventory_qs.count()
    
    # Calculate total inventory value from lots
    from apps.inventory.models import LoteEstoque
    inventory_value = LoteEstoque.objects.filter(
        item__organization=org,
        item__ativo=True
    ).aggregate(
        total=Sum(F('quantidade_atual') * F('custo_unitario'))
    )['total'] or 0
    
    # Count items with low stock using a proper filter
    from decimal import Decimal
    low_stock_count = inventory_qs.filter(
        estoque_atual__lt=F('estoque_minimo')
    ).count()

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

    # Chart: last 7 months revenue vs expense
    seven_months_ago = (today - relativedelta(months=6)).replace(day=1)
    monthly_finance = list(
        transactions_qs.filter(
            payment_date__gte=seven_months_ago,
            status=Transaction.Status.PAID,
        )
        .annotate(month=TruncMonth("payment_date"))
        .values("month", "category__category_type")
        .annotate(total=Sum("amount"))
        .order_by("month")
    )

    # Build month buckets
    finance_map: dict = {}
    for row in monthly_finance:
        key = row["month"].strftime("%b")
        if key not in finance_map:
            finance_map[key] = {"mes": key, "receita": 0, "despesa": 0}
        if row["category__category_type"] == FinancialCategory.CategoryType.REVENUE:
            finance_map[key]["receita"] += float(row["total"])
        else:
            finance_map[key]["despesa"] += float(row["total"])

    revenue_chart = list(finance_map.values())

    # ── Tasks ─────────────────────────────────────────────────────────────────
    tasks_qs = Task.objects.filter(
        organization=org,
        status__in=[Task.Status.OPEN, Task.Status.IN_PROGRESS],
    ).select_related("farm").order_by("due_date")[:10]

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
            "tasks": tasks_data,
        }
    )


# === Report Management Views ===

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from django.db.models import Sum

from .models import (
    ReportConfig,
    ReportSchedule,
    GeneratedReport,
    ReportWidget,
    ReportType,
    ReportFormat,
    ReportStatus
)
from .serializers import (
    ReportConfigSerializer,
    ReportConfigCreateSerializer,
    ReportScheduleSerializer,
    ReportScheduleCreateSerializer,
    GeneratedReportSerializer,
    GeneratedReportCreateSerializer,
    ReportWidgetSerializer,
    ReportListOptionsSerializer,
    DashboardKPISerializer
)


class ReportConfigViewSet(viewsets.ModelViewSet):
    serializer_class = ReportConfigSerializer
    permission_classes = [IsAuthenticated]
    
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
            {"value": rt.value, "label": rt.label}
            for rt in ReportType.choices
        ]
        formats = [
            {"value": f.value, "label": f.label}
            for f in ReportFormat.choices
        ]
        frequencies = [
            {"value": fr.value, "label": fr.label}
            for fr in ["daily", "weekly", "monthly", "quarterly", "yearly"]
        ]
        return Response({
            "report_types": report_types,
            "formats": formats,
            "frequencies": frequencies
        })


class ReportScheduleViewSet(viewsets.ModelViewSet):
    serializer_class = ReportScheduleSerializer
    permission_classes = [IsAuthenticated]
    
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
    permission_classes = [IsAuthenticated]
    
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
        
        report = GeneratedReport.objects.create(
            organization=org,
            name=serializer.validated_data["name"],
            report_type=serializer.validated_data["report_type"],
            filters=serializer.validated_data.get("filters", {}),
            date_range=serializer.validated_data.get("date_range", {}),
            format_used=serializer.validated_data.get("format", ReportFormat.PDF),
            status=ReportStatus.PROCESSING,
            started_at=timezone.now(),
            generated_by=request.user
        )
        
        # Simular geração (na implementação real seria uma task Celery)
        # Por agora, apenas cria o registro
        report.status = ReportStatus.COMPLETED
        report.completed_at = timezone.now()
        report.save()
        
        return Response(GeneratedReportSerializer(report).data, status=status.HTTP_201_CREATED)
    
    @action(detail=True, methods=["get"])
    def download(self, request, pk=None):
        """Download do arquivo gerado"""
        report = self.get_object()
        if not report.file:
            return Response({"detail": "Arquivo não disponível"}, status=status.HTTP_404_NOT_FOUND)
        
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
                id=item["id"],
                organization=request.user.organization
            ).update(
                position_x=item.get("position_x", 0),
                position_y=item.get("position_y", 0),
                width=item.get("width", 4),
                height=item.get("height", 3)
            )
        return Response({"status": "Widgets reordenados"})


# === Report Data Endpoints ===

from .services import StockReportService, FinancialReportService, LivestockReportService


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def stock_general_report(request):
    """Relatório geral de estoque"""
    org = getattr(request.user, "organization", None)
    if not org:
        return Response({"detail": "Organização não encontrada"}, status=status.HTTP_404_NOT_FOUND)
    
    filters = {}
    if request.GET.get('category'):
        filters['category'] = request.GET.get('category')
    if request.GET.get('search'):
        filters['search'] = request.GET.get('search')
    
    data = StockReportService.get_general_stock(org, filters)
    return Response(data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def stock_movement_report(request):
    """Relatório de movimentações de estoque"""
    org = getattr(request.user, "organization", None)
    if not org:
        return Response({"detail": "Organização não encontrada"}, status=status.HTTP_404_NOT_FOUND)
    
    date_range = {}
    if request.GET.get('start'):
        date_range['start'] = request.GET.get('start')
    if request.GET.get('end'):
        date_range['end'] = request.GET.get('end')
    
    data = StockReportService.get_stock_movement(org, date_range if date_range else None)
    return Response(data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def stock_low_report(request):
    """Relatório de estoque mínimo"""
    org = getattr(request.user, "organization", None)
    if not org:
        return Response({"detail": "Organização não encontrada"}, status=status.HTTP_404_NOT_FOUND)
    
    data = StockReportService.get_low_stock(org)
    return Response(data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def stock_expiry_report(request):
    """Relatório de validade"""
    org = getattr(request.user, "organization", None)
    if not org:
        return Response({"detail": "Organização não encontrada"}, status=status.HTTP_404_NOT_FOUND)
    
    days = int(request.GET.get('days', 30))
    data = StockReportService.get_expiry_report(org, days)
    return Response(data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def finance_cashflow_report(request):
    """Relatório de fluxo de caixa"""
    org = getattr(request.user, "organization", None)
    if not org:
        return Response({"detail": "Organização não encontrada"}, status=status.HTTP_404_NOT_FOUND)
    
    date_range = {}
    if request.GET.get('start'):
        date_range['start'] = request.GET.get('start')
    if request.GET.get('end'):
        date_range['end'] = request.GET.get('end')
    
    data = FinancialReportService.get_cashflow(org, date_range if date_range else None)
    return Response(data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def livestock_inventory_report(request):
    """Relatório de inventário de rebanho"""
    org = getattr(request.user, "organization", None)
    if not org:
        return Response({"detail": "Organização não encontrada"}, status=status.HTTP_404_NOT_FOUND)
    
    data = LivestockReportService.get_inventory(org)
    return Response(data)
