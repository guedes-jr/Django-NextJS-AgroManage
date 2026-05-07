"""
ViewSets for the inventory app.
"""
from decimal import Decimal
from django.db import models, transaction
from django.db.models import Sum, Count, Q
from django.utils.dateparse import parse_date
from rest_framework import viewsets, status, exceptions, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from django.utils.text import slugify
from apps.organizations.models import Organization

from .models import ItemEstoque, LoteEstoque, MovimentacaoEstoque, Fornecedor, AlertaEstoque
from .serializers import (
    ItemEstoqueSerializer,
    LoteEstoqueSerializer,
    MovimentacaoEstoqueSerializer,
    FornecedorSerializer,
    AlertaEstoqueSerializer,
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

    def perform_create(self, serializer):
        organization = getattr(self.request.user, 'organization', None)
        if not organization:
            # Cria organização se não existir (mesmo código do FornecedorViewSet)
            from django.utils.text import slugify
            from apps.organizations.models import Organization
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
        
        serializer.save(organization=organization)

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

    @action(detail=False, methods=["get"], url_path="all_items")
    def all_items(self, request):
        """Return all items for the organization."""
        organization = request.user.organization if request.user.is_authenticated else None
        if not organization:
            return Response({"error": "Usuário sem organização vinculada."}, status=status.HTTP_400_BAD_REQUEST)

        items = ItemEstoque.objects.filter(organization=organization, ativo=True)
        serializer = self.get_serializer(items, many=True)
        return Response(serializer.data)

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
                    "prioridade": item.prioridade,
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

    @action(detail=True, methods=["get"], url_path="lots")
    def lots(self, request, pk=None):
        """Return active lots for an item sorted by expiration date (FEFO)."""
        item = self.get_object()
        lotes = item.lotes.filter(ativo=True, quantidade_atual__gt=0).order_by("data_validade", "created_at")
        serializer = LoteEstoqueSerializer(lotes, many=True)
        return Response(serializer.data)


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
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        qs = super().get_queryset()
        
        # Filter by organization
        if self.request.user.is_authenticated and self.request.user.organization:
            qs = qs.filter(item__organization=self.request.user.organization)
        elif self.request.user.is_authenticated:
            # If authenticated but no org, return nothing to avoid data leakage or empty context
            return qs.none()

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
        from datetime import date
        from apps.farms.models import Farm
        
        user = self.request.user
        responsavel = user if user.is_authenticated else None
        
        tipo = serializer.validated_data.get("tipo")
        item = serializer.validated_data.get("item")
        quantidade = serializer.validated_data.get("quantidade")
        lote = serializer.validated_data.get("lote")
        
        # Ensure farm is set (default to first farm of the organization if missing)
        farm = serializer.validated_data.get("farm")
        if not farm and responsavel and responsavel.organization:
            farm = Farm.objects.filter(organization=responsavel.organization).first()
        
        # Save additional context
        save_kwargs = {"responsavel": responsavel}
        if farm:
            save_kwargs["farm"] = farm
        
        # Pop batch fields so they don't get passed to MovimentacaoEstoque.objects.create()
        batch_data = {
            "numero_lote": serializer.validated_data.pop("numero_lote", ""),
            "data_fabricacao": serializer.validated_data.pop("data_fabricacao", None),
            "data_validade": serializer.validated_data.pop("data_validade", None),
            "custo_unitario": serializer.validated_data.pop("custo_unitario", None),
            "local_armazenamento": serializer.validated_data.pop("local_armazenamento", ""),
            "fornecedor": serializer.validated_data.pop("fornecedor", None),
            "nota_fiscal": serializer.validated_data.pop("nota_fiscal", ""),
        }
        
        # If it's a PURCHASE and no batch was provided, handle it
        if tipo in [TipoMovimentacao.COMPRA, TipoMovimentacao.ENTRADA, TipoMovimentacao.AJUSTE] and not lote:
            numero_lote = batch_data["numero_lote"]
            # Check if a batch with this number already exists for this item
            lote = LoteEstoque.objects.filter(item=item, numero_lote=numero_lote).first()
            
            if not lote:
                lote = LoteEstoque.objects.create(
                    item=item,
                    numero_lote=numero_lote,
                    data_fabricacao=batch_data["data_fabricacao"],
                    data_validade=batch_data["data_validade"],
                    quantidade_inicial=quantidade,
                    quantidade_atual=Decimal("0"), # Start at zero, movement will add
                    custo_unitario=batch_data["custo_unitario"],
                    local_armazenamento=batch_data["local_armazenamento"],
                    fornecedor=batch_data["fornecedor"],
                    nota_fiscal=batch_data["nota_fiscal"],
                    data_entrada=date.today(),
                )
            else:
                # Update existing batch metadata if provided
                if batch_data["data_validade"]:
                    lote.data_validade = batch_data["data_validade"]
                if batch_data["custo_unitario"]:
                    lote.custo_unitario = batch_data["custo_unitario"]
                if batch_data["fornecedor"]:
                    lote.fornecedor = batch_data["fornecedor"]
                lote.save()
                
            instance = serializer.save(lote=lote, **save_kwargs)
        else:
            instance = serializer.save(**save_kwargs)
            lote = instance.lote
            
        # Logic to find a batch for output if none was provided
        if not lote and tipo in [TipoMovimentacao.VENDA, TipoMovimentacao.CONSUMO, TipoMovimentacao.PERDA]:
            lote = item.lotes.filter(ativo=True, quantidade_atual__gt=0).order_by("data_validade", "created_at").first()
            if lote:
                instance.lote = lote
                instance.save(update_fields=["lote"])
        
        if lote:
            if tipo in [TipoMovimentacao.VENDA, TipoMovimentacao.CONSUMO, TipoMovimentacao.PERDA, TipoMovimentacao.SAIDA, TipoMovimentacao.VENCIMENTO]:
                lote.quantidade_atual = max(Decimal("0"), lote.quantidade_atual - quantidade)
                lote.save(update_fields=["quantidade_atual", "updated_at"])
            elif tipo in [TipoMovimentacao.COMPRA, TipoMovimentacao.ENTRADA, TipoMovimentacao.AJUSTE]:
                lote.quantidade_atual += quantidade
                lote.save(update_fields=["quantidade_atual", "updated_at"])

    def perform_update(self, serializer):
        # We need to handle the stock adjustment if the quantity or type changes
        instance = self.get_object()
        old_qty = instance.quantidade
        old_tipo = instance.tipo
        old_lote = instance.lote
        
        # Save the new version
        updated_instance = serializer.save()
        new_qty = updated_instance.quantidade
        new_tipo = updated_instance.tipo
        new_lote = updated_instance.lote
        
        # If the batch didn't change, we just adjust the difference
        if old_lote == new_lote and old_lote:
            # Revert old movement
            if old_tipo in [TipoMovimentacao.VENDA, TipoMovimentacao.CONSUMO, TipoMovimentacao.PERDA, TipoMovimentacao.SAIDA, TipoMovimentacao.VENCIMENTO]:
                old_lote.quantidade_atual += old_qty
            else:
                old_lote.quantidade_atual -= old_qty
            
            # Apply new movement
            if new_tipo in [TipoMovimentacao.VENDA, TipoMovimentacao.CONSUMO, TipoMovimentacao.PERDA, TipoMovimentacao.SAIDA, TipoMovimentacao.VENCIMENTO]:
                old_lote.quantidade_atual -= new_qty
            else:
                old_lote.quantidade_atual += new_qty
            
            old_lote.quantidade_atual = max(Decimal("0"), old_lote.quantidade_atual)
            old_lote.save(update_fields=["quantidade_atual", "updated_at"])
            
        elif old_lote != new_lote:
            # Revert old movement in old batch
            if old_lote:
                if old_tipo in [TipoMovimentacao.VENDA, TipoMovimentacao.CONSUMO, TipoMovimentacao.PERDA, TipoMovimentacao.SAIDA, TipoMovimentacao.VENCIMENTO]:
                    old_lote.quantidade_atual += old_qty
                else:
                    old_lote.quantidade_atual -= old_qty
                old_lote.quantidade_atual = max(Decimal("0"), old_lote.quantidade_atual)
                old_lote.save(update_fields=["quantidade_atual", "updated_at"])
            
            # Apply new movement in new batch
            if new_lote:
                if new_tipo in [TipoMovimentacao.VENDA, TipoMovimentacao.CONSUMO, TipoMovimentacao.PERDA, TipoMovimentacao.SAIDA, TipoMovimentacao.VENCIMENTO]:
                    new_lote.quantidade_atual -= new_qty
                else:
                    new_lote.quantidade_atual += new_qty
                new_lote.quantidade_atual = max(Decimal("0"), new_lote.quantidade_atual)
                new_lote.save(update_fields=["quantidade_atual", "updated_at"])

    def perform_destroy(self, instance):
        lote = instance.lote
        tipo = instance.tipo
        quantidade = instance.quantidade
        
        if lote:
            # Revert the movement impact on stock
            if tipo in [TipoMovimentacao.VENDA, TipoMovimentacao.CONSUMO, TipoMovimentacao.PERDA, TipoMovimentacao.SAIDA, TipoMovimentacao.VENCIMENTO]:
                lote.quantidade_atual += quantidade
            else:
                lote.quantidade_atual -= quantidade
            
            lote.quantidade_atual = max(Decimal("0"), lote.quantidade_atual)
            lote.save(update_fields=["quantidade_atual", "updated_at"])
        
        instance.delete()
    
    @action(detail=False, methods=["post"], url_path="bulk-delete")
    def bulk_delete(self, request):
        ids = request.data.get("ids", [])

        if not isinstance(ids, list) or not ids:
            return Response(
                {"detail": "Informe uma lista de movimentações para remover."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        movements = list(
            self.get_queryset()
            .filter(id__in=ids)
            .select_related("lote")
        )

        if not movements:
            return Response(
                {"detail": "Nenhuma movimentação encontrada para remoção."},
                status=status.HTTP_404_NOT_FOUND,
            )

        with transaction.atomic():
            deleted_count = 0

            for movement in movements:
                self.perform_destroy(movement)
                deleted_count += 1

        return Response(
            {
                "deleted": deleted_count,
                "requested": len(ids),
            },
            status=status.HTTP_200_OK,
        )

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
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_queryset(self):
        if self.request.user.is_authenticated and self.request.user.organization:
            return Fornecedor.objects.filter(
                organization=self.request.user.organization
            ).prefetch_related("contatos", "enderecos").order_by("nome")
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


class AlertaEstoqueViewSet(viewsets.ModelViewSet):
    serializer_class = AlertaEstoqueSerializer
    permission_classes = [permissions.IsAuthenticated]

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

    def get_queryset(self):
        if self.request.user.is_authenticated:
            organization = self._get_user_organization()
            return AlertaEstoque.objects.filter(
                organization=organization,
                resolvido=False
            ).select_related("item").order_by("-prioridade", "-created_at")
        return AlertaEstoque.objects.none()

    def perform_create(self, serializer):
        organization = self._get_user_organization()
        serializer.save(organization=organization)

    @action(detail=True, methods=["post"])
    def resolver(self, request, pk=None):
        alerta = self.get_object()
        alerta.resolvido = True
        alerta.save()
        return Response({"status": "alerta resolvido"})

    @action(detail=False, methods=["post"])
    def resolver_tudo(self, request):
        self.get_queryset().update(resolvido=True)
        return Response({"status": "todos os alertas resolvidos"})

    @action(detail=False, methods=["post"])
    def gerar_alertas(self, request):
        """Varre os itens e gera alertas se necessário."""
        from .models import ItemEstoque, AlertaEstoque
        organization = self._get_user_organization()
        if not organization:
            return Response({"error": "Usuário sem organização"}, status=400)
            
        items = ItemEstoque.objects.filter(organization=organization, ativo=True)
        print(f"[DEBUG] Gerando alertas para organização {organization.id}. Itens encontrados: {items.count()}")
        
        count = 0
        for item in items:
            atual = item.estoque_atual
            minimo = item.estoque_minimo
            print(f"[DEBUG] Item: {item.nome} | Atual: {atual} | Mínimo: {minimo} | Baixo: {item.estoque_baixo}")
            
            if item.estoque_baixo:
                # Check if there is already an active alert for this item
                if not AlertaEstoque.objects.filter(
                    organization=organization, 
                    item=item, 
                    tipo=AlertaEstoque.TipoAlerta.ESTOQUE_BAIXO,
                    resolvido=False
                ).exists():
                    AlertaEstoque.objects.create(
                        organization=organization,
                        item=item,
                        tipo=AlertaEstoque.TipoAlerta.ESTOQUE_BAIXO,
                        prioridade=item.prioridade,
                        titulo=f"Estoque Baixo: {item.nome}",
                        descricao=f"O item {item.nome} está com saldo de {atual} {item.unidade_medida}, abaixo do mínimo de {minimo}."
                    )
                    count += 1
        
        print(f"[DEBUG] Finalizado. Alertas criados: {count}")
        return Response({"status": "processamento concluído", "alertas_criados": count})


# ---------------------------------------------------------------------------
# Fórmulas e Produção
# ---------------------------------------------------------------------------

from .models import FormulaRacao, ProducaoRacao, FormulaIngrediente, ConsumoRacao
from .serializers import FormulaRacaoSerializer, ProducaoRacaoSerializer, ConsumoRacaoSerializer


class FormulaRacaoViewSet(viewsets.ModelViewSet):
    serializer_class = FormulaRacaoSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        if self.request.user.is_authenticated and getattr(self.request.user, 'organization', None):
            qs = FormulaRacao.objects.filter(
                organization=self.request.user.organization
            ).prefetch_related("ingredientes__item__lotes")
            
            # Filter by species if provided: ?especie=suino | ave | bovino
            especie = self.request.query_params.get("especie")
            if especie:
                qs = qs.filter(especie_animal=especie)
            
            return qs
        return FormulaRacao.objects.none()

    def perform_create(self, serializer):
        organization = getattr(self.request.user, 'organization', None)
        serializer.save(organization=organization)



class ProducaoRacaoViewSet(viewsets.ModelViewSet):
    serializer_class = ProducaoRacaoSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        if self.request.user.is_authenticated and getattr(self.request.user, 'organization', None):
            return ProducaoRacao.objects.filter(organization=self.request.user.organization).select_related("formula", "responsavel").order_by("-data_producao")
        return ProducaoRacao.objects.none()

    @action(detail=False, methods=["post"], url_path="produzir")
    def produzir(self, request):
        organization = getattr(request.user, 'organization', None)
        if not organization:
            return Response({"error": "Usuário sem organização."}, status=400)
            
        formula_id = request.data.get("formula_id")
        try:
            quantidade_teorica = Decimal(str(request.data.get("quantidade_teorica", 0)))
            quantidade_real = Decimal(str(request.data.get("quantidade_real", 0)))
        except (ValueError, TypeError):
            return Response({"error": "Quantidade inválida."}, status=400)
        
        if not formula_id or quantidade_teorica <= 0:
            return Response({"error": "Fórmula e quantidade teórica são obrigatórias."}, status=400)
            
        try:
            formula = FormulaRacao.objects.get(id=formula_id, organization=organization)
        except FormulaRacao.DoesNotExist:
            return Response({"error": "Fórmula não encontrada."}, status=404)
            
        custo_total_producao = Decimal("0")
        movimentacoes_para_criar = []
        lotes_para_atualizar = []
        
        # Validar estoque de todos os ingredientes antes de abater
        from django.db import transaction
        with transaction.atomic():
            for ingrediente in formula.ingredientes.all():
                qtde_necessaria = (quantidade_teorica * ingrediente.percentual) / Decimal("100")
                item = ingrediente.item
                saldo_item = item.estoque_atual
                
                if saldo_item < qtde_necessaria:
                    transaction.set_rollback(True)
                    return Response({
                        "error": f"Estoque insuficiente para {item.nome}. Necessário: {qtde_necessaria}, Disponível: {saldo_item}"
                    }, status=400)
                    
                # Abater dos lotes (PEPS: Primeiro a Entrar, Primeiro a Sair)
                lotes = list(item.lotes.filter(ativo=True, quantidade_atual__gt=0).order_by("data_entrada", "id"))
                qtde_restante_abater = qtde_necessaria
                
                for lote in lotes:
                    if qtde_restante_abater <= 0:
                        break
                        
                    qtde_deste_lote = min(lote.quantidade_atual, qtde_restante_abater)
                    custo_lote = lote.custo_unitario or Decimal("0")
                    custo_total_producao += qtde_deste_lote * custo_lote
                    
                    lote.quantidade_atual -= qtde_deste_lote
                    qtde_restante_abater -= qtde_deste_lote
                    lotes_para_atualizar.append(lote)
                    
                    movimentacoes_para_criar.append(
                        MovimentacaoEstoque(
                            item=item,
                            lote=lote,
                            tipo=TipoMovimentacao.CONSUMO,
                            quantidade=qtde_deste_lote,
                            responsavel=request.user,
                            observacao=f"Consumo para produção de {formula.nome}"
                        )
                    )
                    
            # Salvar as baixas de estoque
            for lote in lotes_para_atualizar:
                lote.save(update_fields=["quantidade_atual", "updated_at"])
            MovimentacaoEstoque.objects.bulk_create(movimentacoes_para_criar)
            
            # Registrar a Produção
            producao = ProducaoRacao.objects.create(
                organization=organization,
                formula=formula,
                quantidade_teorica=quantidade_teorica,
                quantidade_real=quantidade_real,
                custo_total=custo_total_producao,
                responsavel=request.user,
                status="concluida"
            )
            
            # Se a fórmula gera um novo item, dar entrada no estoque
            if formula.item_final and quantidade_real > 0:
                from django.utils import timezone
                custo_unitario_final = custo_total_producao / quantidade_real
                novo_lote = LoteEstoque.objects.create(
                    item=formula.item_final,
                    numero_lote=f"PROD-{producao.id}",
                    quantidade_inicial=quantidade_real,
                    quantidade_atual=quantidade_real,
                    custo_unitario=custo_unitario_final,
                    data_entrada=timezone.now().date(),
                    ativo=True
                )
                MovimentacaoEstoque.objects.create(
                    item=formula.item_final,
                    lote=novo_lote,
                    tipo=TipoMovimentacao.ENTRADA,
                    quantidade=quantidade_real,
                    responsavel=request.user,
                    observacao=f"Entrada por produção (Lote PROD-{producao.id})"
                )
                
        return Response({
            "status": "Produção finalizada com sucesso!",
            "producao_id": producao.id,
            "custo_total": str(custo_total_producao)
        })


class ConsumoRacaoViewSet(viewsets.ModelViewSet):
    serializer_class = ConsumoRacaoSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        if self.request.user.is_authenticated and getattr(self.request.user, 'organization', None):
            qs = ConsumoRacao.objects.filter(
                organization=self.request.user.organization
            ).select_related("lote_animal", "item_estoque", "usuario")
            
            # Filter by species (e.g. ?especie=suino)
            especie = self.request.query_params.get("especie")
            if especie:
                # We filter by the species code in the related AnimalBatch
                qs = qs.filter(lote_animal__species__code=especie)
                
            return qs
        return ConsumoRacao.objects.none()

    def perform_create(self, serializer):
        from django.db import transaction
        
        user = self.request.user
        organization = getattr(user, 'organization', None)
        if not organization:
            raise exceptions.ValidationError("Usuário sem organização.")

        # Default farm to user's first farm if not provided in the request
        from apps.farms.models import Farm
        farm = Farm.objects.filter(organization=organization).first()
        
        item = serializer.validated_data.get("item_estoque")
        quantidade_pedida = serializer.validated_data.get("quantidade")
        
        # Logic to deduct from stock and calculate cost (PEPS/FIFO)
        with transaction.atomic():
            # Get available lots for this item
            lotes = list(item.lotes.filter(ativo=True, quantidade_atual__gt=0).order_by("data_entrada", "id"))
            qtde_restante = quantidade_pedida
            custo_total = Decimal("0")
            
            # Re-check stock to avoid race conditions
            saldo_atual = item.estoque_atual
            if saldo_atual < quantidade_pedida:
                raise exceptions.ValidationError(f"Estoque insuficiente para {item.nome}. Disponível: {saldo_atual}")

            movimentacoes = []
            lotes_para_atualizar = []
            
            for lote in lotes:
                if qtde_restante <= 0:
                    break
                
                qtde_abater = min(lote.quantidade_atual, qtde_restante)
                
                custo_lote = lote.custo_unitario or Decimal("0")
                custo_total += qtde_abater * custo_lote
                
                lote.quantidade_atual -= qtde_abater
                lotes_para_atualizar.append(lote)
                
                movimentacoes.append(
                    MovimentacaoEstoque(
                        item=item,
                        lote=lote,
                        tipo=TipoMovimentacao.CONSUMO,
                        quantidade=qtde_abater,
                        responsavel=user,
                        observacao=f"Consumo de Ração: Lote Animal {serializer.validated_data.get('lote_animal').batch_code}"
                    )
                )
                qtde_restante -= qtde_abater
            
            # Save updates
            for l in lotes_para_atualizar:
                l.save(update_fields=["quantidade_atual", "updated_at"])
                
            MovimentacaoEstoque.objects.bulk_create(movimentacoes)
            
            custo_unitario = custo_total / quantidade_pedida if quantidade_pedida > 0 else Decimal("0")
            
            serializer.save(
                organization=organization,
                farm=farm,
                usuario=user,
                custo_unitario=custo_unitario,
                custo_total=custo_total
            )

    @action(detail=False, methods=["get"], url_path="stats")
    def stats(self, request):
        """Return statistics for the consumption dashboard."""
        organization = getattr(request.user, 'organization', None)
        if not organization:
            return Response({"error": "Usuário sem organização."}, status=400)
            
        especie = request.query_params.get("especie")
        categoria = request.query_params.get("categoria")
        qs = ConsumoRacao.objects.filter(organization=organization)
        if especie:
            qs = qs.filter(lote_animal__species__code=especie)
        if categoria and categoria != "lotes":
            # Filter by category if specified and not the generic "lotes" tab
            qs = qs.filter(lote_animal__category__icontains=categoria)
            
        # 1. Total consumed in the last 30 days
        from django.utils import timezone
        from datetime import timedelta
        last_30_days = timezone.now().date() - timedelta(days=30)
        recent_qs = qs.filter(data_inicio__gte=last_30_days)
        
        total_qty = recent_qs.aggregate(total=Sum("quantidade"))["total"] or 0
        total_cost = recent_qs.aggregate(total=Sum("custo_total"))["total"] or 0
        
        # 2. Consumption by feed type (Donut chart)
        by_feed = recent_qs.values("item_estoque__nome").annotate(
            value=Sum("quantidade")
        ).order_by("-value")
        
        # 3. Latest entries
        latest = ConsumoRacaoSerializer(qs[:5], many=True).data
        
        return Response({
            "total_qty": total_qty,
            "total_cost": total_cost,
            "avg_cost_kg": total_cost / total_qty if total_qty > 0 else 0,
            "by_feed": [
                {"name": item["item_estoque__nome"], "value": float(item["value"])}
                for item in by_feed
            ],
            "latest_entries": latest
        })