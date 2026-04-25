"""
ViewSets for the inventory app.
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser

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
        # Get organization from user profile
        organization = request.user.organization
        if not organization:
             return Response({"error": "Usuário sem organização vinculada."}, status=status.HTTP_400_BAD_REQUEST)
        
        # Add organization to all items in data
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
    http_method_names = ["get", "post", "head", "options"]  # No edit/delete on movements

    def get_queryset(self):
        qs = super().get_queryset()
        item_id = self.request.query_params.get("item")
        if item_id:
            qs = qs.filter(item_id=item_id)
        return qs

    def perform_create(self, serializer):
        responsavel = self.request.user if self.request.user.is_authenticated else None
        serializer.save(responsavel=responsavel)


class FornecedorViewSet(viewsets.ModelViewSet):
    """CRUD for suppliers."""

    serializer_class = FornecedorSerializer
    parser_classes = [MultiPartParser, FormParser]  # Keep for image upload action

    def get_queryset(self):
        if self.request.user.is_authenticated and self.request.user.organization:
            return Fornecedor.objects.filter(organization=self.request.user.organization).order_by("nome")
        return Fornecedor.objects.none()

    def perform_create(self, serializer):
        organization = self.request.user.organization
        print(f"[DEBUG] Creating supplier for organization: {organization}")
        serializer.save(organization=organization)
    
    def perform_update(self, serializer):
        # Ensure organization is not changed
        organization = self.request.user.organization
        print(f"[DEBUG] Updating supplier for organization: {organization}")
        serializer.save(organization=organization)

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
