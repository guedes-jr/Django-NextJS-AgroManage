"""
ViewSets for the inventory app.
"""
from decimal import Decimal
from django.db import models
from django.db.models import Sum, Count, Q
from django.utils.dateparse import parse_date
from rest_framework import viewsets, status, exceptions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from django.utils.text import slugify
from apps.organizations.models import Organization

from .models import ItemEstoque, LoteEstoque, MovimentacaoEstoque, Fornecedor
from .serializers import (
    ItemEstoqueSerializer,
    LoteEstoqueSerializer,
    MovimentacaoEstoqueSerializer,
    FornecedorSerializer,
)
from .choices import (
    CategoriaItem, UnidadeMedida, EspecieAnimal, TipoMovimentacao, TipoContratoFornecedor
)


class ItemEstoqueViewSet(viewsets.ModelViewSet):
    """
    CRUD for inventory items.
    Extra actions:
      POST /inventory/items/bulk_create/  — create multiple items at once
      GET  /inventory/items/choices/      — return all TextChoices for the front-end
    """

    queryset = (
        ItemEstoque.objects.select_related()
        .prefetch_related("lotes")
        .filter(ativo=True)
        .order_by("nome")
    )
    serializer_class = ItemEstoqueSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.user.is_authenticated and self.request.user.organization:
            return qs.filter(organization=self.request.user.organization)
        return qs.none() # Return nothing if not authenticated/no org

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["request"] = self.request
        return context

    @action(detail=False, methods=["post"], url_path="bulk_create")
    def bulk_create(self, request):
        """Create multiple items in a single request."""
        organization = request.user.organization
        if not organization:
             return Response({"error": "Usuário sem organização vinculada."}, status=status.HTTP_400_BAD_REQUEST)
        
        data = request.data
        if isinstance(data, list):
            for item in data:
                item["organization"] = organization.id
        else:
            data["organization"] = organization.id

        serializer = self.get_serializer(data=data, many=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["get"], url_path="choices")
    def choices(self, request):
        """Return all TextChoices used by the front-end forms."""
        return Response({
            "categorias": [{"value": v, "label": l} for v, l in CategoriaItem.choices],
            "unidades": [{"value": v, "label": l} for v, l in UnidadeMedida.choices],
            "especies": [{"value": v, "label": l} for v, l in EspecieAnimal.choices],
            "tipos_movimentacao": [{"value": v, "label": l} for v, l in TipoMovimentacao.choices],
            "tipos_contrato": [{"value": v, "label": l} for v, l in TipoContratoFornecedor.choices],
        })

    @action(detail=False, methods=["get"], url_path="stats")
    def stats(self, request):
        """Return summary statistics for the dashboard."""
        organization = request.user.organization if request.user.is_authenticated else None
        if not organization:
            return Response({"error": "Usuário sem organização vinculada."}, status=status.HTTP_400_BAD_REQUEST)

        items = ItemEstoque.objects.filter(organization=organization, ativo=True)
        total_items = items.count()

        Estoque_Baixo = items.filter(estoque_minimo__gt=0).annotate(
            saldo_total=Sum("lotes__quantidade_atual", filter=Q(lotes__ativo=True))
        ).filter(saldo_total__lt=models.F("estoque_minimo")).count()

        vencidos = 0

        lotes = LoteEstoque.objects.filter(item__organization=organization, item__ativo=True, ativo=True)
        total_value = 0
        total_qty = 0
        for lote in lotes:
            qty = lote.quantidade_atual or Decimal("0")
            cost = lote.custo_unitario or Decimal("0")
            total_qty += qty
            total_value += qty * cost

        return Response({
            "total_items": total_items,
            "total_value": str(total_value),
            "total_qty": float(total_qty),
            "estoque_baixo": Estoque_Baixo,
            "itens_vencidos": vencidos,
        })

    @action(detail=False, methods=["get"], url_path="low_stock")
    def low_stock(self, request):
        """Return items with low stock."""
        organization = request.user.organization if request.user.is_authenticated else None
        if not organization:
            return Response({"error": "Usuário sem organização vinculada."}, status=status.HTTP_400_BAD_REQUEST)

        items = ItemEstoque.objects.filter(
            organization=organization, 
            ativo=True,
            estoque_minimo__gt=0
        ).prefetch_related("lotes")

        result = []
        for item in items:
            saldo = item.estoque_atual
            if saldo < item.estoque_minimo:
                result.append({
                    "id": item.id,
                    "nome": item.nome,
                    "estoque_atual": str(saldo),
                    "estoque_minimo": str(item.estoque_minimo),
                    "unidade_medida": item.unidade_medida,
                })

        return Response(result)

    @action(detail=False, methods=["get"], url_path="by_category")
    def by_category(self, request):
        """Return stock value grouped by category."""
        organization = request.user.organization if request.user.is_authenticated else None
        if not organization:
            return Response({"error": "Usuário sem organização vinculada."}, status=status.HTTP_400_BAD_REQUEST)

        items = ItemEstoque.objects.filter(organization=organization, ativo=True).prefetch_related("lotes")

        category_data = {}
        for item in items:
            saldo = item.estoque_atual
            if saldo > 0:
                cat = item.get_categoria_display()
                if cat not in category_data:
                    category_data[cat] = 0
                for lote in item.lotes.filter(ativo=True):
                    cost = lote.custo_unitario or Decimal("0")
                    category_data[cat] += float(saldo) * float(cost)

        result = [
            {"name": cat, "value": value}
            for cat, value in category_data.items()
        ]

        return Response(result)


class LoteEstoqueViewSet(viewsets.ModelViewSet):
    """CRUD for stock batches."""

    queryset = LoteEstoque.objects.select_related("item").order_by("-data_entrada")
    serializer_class = LoteEstoqueSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        item_id = self.request.query_params.get("item")
        if item_id:
            qs = qs.filter(item_id=item_id)
        return qs


class MovimentacaoEstoqueViewSet(viewsets.ModelViewSet):
    """CRUD for stock movements (mostly read + create)."""

    queryset = (
        MovimentacaoEstoque.objects.select_related("item", "lote", "responsavel")
        .order_by("-data_movimentacao")
    )
    serializer_class = MovimentacaoEstoqueSerializer
    http_method_names = ["get", "post", "head", "options"]

    def get_queryset(self):
        qs = super().get_queryset()
        item_id = self.request.query_params.get("item")
        if item_id:
            qs = qs.filter(item_id=item_id)
        tipo = self.request.query_params.get("tipo")
        if tipo:
            qs = qs.filter(tipo=tipo)
        item_filter = self.request.query_params.get("item_id")
        if item_filter:
            qs = qs.filter(item_id=item_filter)
        return qs

    def perform_create(self, serializer):
        responsavel = self.request.user if self.request.user.is_authenticated else None
        serializer.save(responsavel=responsavel)

    @action(detail=False, methods=["get"], url_path="stats")
    def stats(self, request):
        """Return movement statistics grouped by date range."""
        from django.db.models.functions import TruncDate
        from datetime import timedelta
        from django.utils import timezone

        organization = request.user.organization if request.user.is_authenticated else None
        if not organization:
            return Response({"error": "Usuário sem organização vinculada."}, status=status.HTTP_400_BAD_REQUEST)

        period = request.query_params.get("period", "5")
        days_map = {
            "5": 5,
            "15": 15,
            "30": 30,
            "90": 90,
            "180": 180,
            "365": 365,
        }
        days = days_map.get(period, 5)

        start_date = timezone.now() - timedelta(days=days)

        qs = MovimentacaoEstoque.objects.filter(
            item__organization=organization,
            data_movimentacao__gte=start_date,
        )

        movements_by_date = qs.annotate(day=TruncDate("data_movimentacao")).values("day", "tipo").annotate(
            total_qty=Sum("quantidade")
        ).order_by("day")

        data_map = {}
        for m in movements_by_date:
            day_str = m["day"].strftime("%d/%m") if m["day"] else ""
            if day_str not in data_map:
                data_map[day_str] = {"entrada": 0, "saida": 0}
            if m["tipo"] == "entrada":
                data_map[day_str]["entrada"] = float(m["total_qty"] or 0)
            elif m["tipo"] == "saida":
                data_map[day_str]["saida"] = float(m["total_qty"] or 0)

        chart_data = [
            {"day": day, **values}
            for day, values in sorted(data_map.items())
        ]

        return Response({
            "chart_data": chart_data,
            "period": period,
        })


class FornecedorViewSet(viewsets.ModelViewSet):
    """CRUD for suppliers."""

    serializer_class = FornecedorSerializer
    parser_classes = [MultiPartParser, FormParser]

    def get_queryset(self):
        if self.request.user.is_authenticated and self.request.user.organization:
            return Fornecedor.objects.filter(organization=self.request.user.organization).order_by("nome")
        return Fornecedor.objects.none()

    def _get_user_organization(self):
        organization = getattr(self.request.user, "organization", None)
        if organization:
            return organization

        user = self.request.user
        base_name = f"Organização de {user.full_name or user.email}"
        base_slug = slugify(user.full_name or user.email.split("@")[0] or "organizacao")
        slug = base_slug or "organizacao"
        suffix = 1
        while Organization.objects.filter(slug=slug).exists():
            suffix += 1
            slug = f"{base_slug}-{suffix}" if base_slug else f"organizacao-{suffix}"

        organization = Organization.objects.create(name=base_name[:255], slug=slug[:100])
        user.organization = organization
        user.save(update_fields=["organization", "updated_at"])
        return organization

    def perform_create(self, serializer):
        organization = self._get_user_organization()
        try:
            serializer.save(organization=organization)
        except Exception as e:
            print(f"[FornecedorViewSet] Error creating fornecedor: {str(e)}")
            raise

    def perform_update(self, serializer):
        organization = self._get_user_organization()
        try:
            serializer.save(organization=organization)
        except Exception as e:
            print(f"[FornecedorViewSet] Error updating fornecedor: {str(e)}")
            raise

    @action(detail=True, methods=["post"], url_path="upload_imagem")
    def upload_imagem(self, request, pk=None):
        """Upload image for supplier."""
        fornecedor = self.get_object()
        imagem = request.FILES.get("imagem")
        
        if not imagem:
            return Response({"error": "Nenhuma imagem enviada."}, status=status.HTTP_400_BAD_REQUEST)
        
        fornecedor.imagem = imagem
        fornecedor.save()
        serializer = self.get_serializer(fornecedor)
        return Response(serializer.data)