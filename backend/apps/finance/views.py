from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db import transaction
from django.db.models import Sum, Q, Case, When, F, DecimalField
from django.http import HttpResponse
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import serializers
from rest_framework.filters import SearchFilter
import csv
import io
from django.utils import timezone
from datetime import timedelta
from decimal import Decimal

from .models import FinancialCategory, BankAccount, Transaction, PaymentEvent
from .serializers import (
    FinancialCategorySerializer,
    BankAccountSerializer,
    TransactionSerializer, SettlementSerializer, ReversalSerializer, SeriesSerializer, PaymentEventSerializer
)
from common.permissions import OrganizationRolePermission

class FinancialCategoryViewSet(viewsets.ModelViewSet):
    serializer_class = FinancialCategorySerializer
    permission_classes = [OrganizationRolePermission]

    def get_queryset(self):
        return FinancialCategory.objects.filter(organization=self.request.user.organization)

    def perform_create(self, serializer):
        serializer.save(organization=self.request.user.organization)

class BankAccountViewSet(viewsets.ModelViewSet):
    def perform_destroy(self, instance):
        if instance.transactions.exists() or instance.payment_events.exists():
            raise serializers.ValidationError("Contas com lançamentos devem ser desativadas para preservar o histórico.")
        instance.delete()

    serializer_class = BankAccountSerializer
    permission_classes = [OrganizationRolePermission]

    def get_queryset(self):
        return BankAccount.objects.filter(organization=self.request.user.organization)

    def perform_create(self, serializer):
        serializer.save(organization=self.request.user.organization)

class TransactionViewSet(viewsets.ModelViewSet):
    serializer_class = TransactionSerializer
    permission_classes = [OrganizationRolePermission]
    write_roles = {"admin", "manager", "operator"}
    action_operations = {"settle": "edit", "reverse": "edit", "series": "create"}
    filter_backends = [DjangoFilterBackend, SearchFilter]
    filterset_fields = {"farm": ["exact"], "bank_account": ["exact"], "species": ["exact"], "animal_batch": ["exact"], "planting_cycle": ["exact"], "due_date": ["gte", "lte"], "payment_date": ["gte", "lte"]}
    search_fields = ["description", "reference", "category__name"]

    def get_queryset(self):
        qs = Transaction.objects.filter(organization=self.request.user.organization).select_related('category', 'bank_account', 'farm', 'species', 'animal_batch', 'planting_cycle').prefetch_related('payment_events__created_by', 'payment_events__bank_account')
        
        # Filters
        category_type = self.request.query_params.get('type')
        if category_type:
            qs = qs.filter(category__category_type=category_type)
            
        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)
            
        return qs.order_by('-due_date')

    def perform_create(self, serializer):
        serializer.save(
            organization=self.request.user.organization,
            created_by=self.request.user
        )

    @transaction.atomic
    def perform_update(self, serializer):
        instance = Transaction.objects.select_for_update().get(pk=serializer.instance.pk)
        serializer.instance = instance
        serializer.validate(serializer.validated_data)
        serializer.save()

    @transaction.atomic
    def perform_destroy(self, instance):
        instance = Transaction.objects.select_for_update().get(pk=instance.pk)
        if instance.status == "paid" or instance.payment_events.exists():
            raise serializers.ValidationError("Títulos pagos ou com histórico de baixas não podem ser apagados. Use o estorno e preserve a origem.")
        if instance.reference.startswith(("LOTE-", "PURCHASE-BATCH-", "SALE-BATCH-", "SALE-")):
            raise serializers.ValidationError("Este título possui origem operacional. Preserve o vínculo; cancele o título quando aplicável.")
        instance.delete()

    @action(detail=True, methods=["post"])
    def settle(self, request, pk=None):
        from .services import settle_transaction
        document = self.get_object()
        data = SettlementSerializer(data=request.data, context={"request": request})
        data.is_valid(raise_exception=True)
        event = settle_transaction(document, request.user, **data.validated_data)
        return Response(PaymentEventSerializer(event).data)

    @action(detail=True, methods=["post"])
    def reverse(self, request, pk=None):
        from .services import reverse_payment
        document = self.get_object()
        data = ReversalSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        event = reverse_payment(document, request.user, **data.validated_data)
        return Response(PaymentEventSerializer(event).data)

    @action(detail=False, methods=["get"])
    def lookups(self, request):
        from apps.farms.models import Farm
        from apps.livestock.models import AnimalBatch, Species
        from apps.crops.models import PlantingCycle
        organization = request.user.organization
        return Response({
            "farms": list(Farm.objects.filter(organization=organization).order_by("name").values("id", "name")),
            "species": list(Species.objects.order_by("name").values("id", "name")),
            "batches": list(AnimalBatch.objects.filter(farm__organization=organization).order_by("batch_code").values("id", "batch_code", "farm_id", "species_id")),
            "plantations": list(PlantingCycle.objects.filter(Q(organization=organization) | Q(organization__isnull=True, field__farm__organization=organization)).order_by("name").values("id", "name", "farm_id", "field__farm_id")),
        })

    @action(detail=False, methods=["post"])
    def series(self, request):
        from .services import create_series
        data = SeriesSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        values = TransactionSerializer(data=data.validated_data.pop("transaction"), context={"request": request})
        values.is_valid(raise_exception=True)
        rows = create_series(request.user, values.validated_data, **dict(data.validated_data, kind=data.validated_data["kind"]))
        return Response(self.get_serializer(rows, many=True).data, status=201)

    @action(detail=False, methods=["get"], url_path="export")
    def export(self, request):
        rows = self.filter_queryset(self.get_queryset())
        if rows.count() > 10000:
            raise serializers.ValidationError("Refine os filtros para exportar até 10.000 títulos.")
        content = io.StringIO()
        writer = csv.writer(content, delimiter=";")
        writer.writerow(["Descrição", "Referência", "Tipo", "Categoria", "Propriedade", "Atividade", "Conta", "Vencimento", "Pagamento", "Estado", "Valor"])
        def safe(value):
            text = str(value or "")
            return "'" + text if text.lstrip().startswith(("=", "+", "-", "@")) or text.startswith(("\t", "\r")) else text
        for row in rows:
            writer.writerow([safe(row.description), safe(row.reference), row.category.category_type, safe(row.category.name), safe(row.farm.name if row.farm else ""), safe(row.species.name if row.species else row.planting_cycle.name if row.planting_cycle else ""), safe(row.bank_account.name if row.bank_account else ""), row.due_date, row.payment_date or "", row.status, str(row.amount).replace(".", ",")])
        response = HttpResponse("\ufeff" + content.getvalue(), content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = 'attachment; filename="financeiro.csv"'
        return response

    @action(detail=False, methods=["get"])
    def stats(self, request):
        organization = request.user.organization
        transactions = self.filter_queryset(self.get_queryset())
        totals = transactions.aggregate(
            revenue=Sum("amount", filter=Q(category__category_type="revenue", status="paid")),
            expense=Sum("amount", filter=Q(category__category_type="expense", status="paid")),
            receivable=Sum("amount", filter=Q(category__category_type="revenue", status__in=["pending", "overdue"])),
            payable=Sum("amount", filter=Q(category__category_type="expense", status__in=["pending", "overdue"])),
        )
        account_totals = BankAccount.objects.filter(organization=organization).aggregate(total=Sum("current_balance"))
        since = timezone.localdate() - timedelta(days=29)
        legacy = transactions.filter(status="paid", payment_events__isnull=True, payment_date__gte=since, payment_date__lte=timezone.localdate()).values("payment_date").annotate(revenue=Sum("amount", filter=Q(category__category_type="revenue")), expense=Sum("amount", filter=Q(category__category_type="expense")))
        signed = Case(When(kind="reversal", then=-F("amount")), default=F("amount"), output_field=DecimalField(max_digits=20, decimal_places=2))
        events = PaymentEvent.objects.filter(transaction_id__in=transactions.values("pk"), payment_date__gte=since, payment_date__lte=timezone.localdate()).values("payment_date").annotate(revenue=Sum(signed, filter=Q(transaction__category__category_type="revenue")), expense=Sum(signed, filter=Q(transaction__category__category_type="expense")))
        by_day = {}
        for row in [*legacy, *events]:
            values = by_day.setdefault(row["payment_date"], {"revenue": Decimal(0), "expense": Decimal(0)})
            for key in ["revenue", "expense"]:
                values[key] += row[key] or Decimal(0)
        cash_flow = []
        for offset in range(30):
            day = since + timedelta(days=offset)
            values = by_day.get(day, {})
            cash_flow.append({"date": day.isoformat(), "revenue": float(values.get("revenue") or 0), "expense": float(values.get("expense") or 0)})
        by_category = transactions.filter(category__category_type="expense", status="paid").values("category__name").annotate(value=Sum("amount")).order_by("-value")
        return Response({"summary": {"balance": float(account_totals["total"] or 0), "total_revenue": float(totals["revenue"] or 0), "total_expense": float(totals["expense"] or 0), "receivable": float(totals["receivable"] or 0), "payable": float(totals["payable"] or 0)}, "cash_flow": cash_flow, "expenses_by_category": [{"name": row["category__name"], "value": float(row["value"])} for row in by_category]})
