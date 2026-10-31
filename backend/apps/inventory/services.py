"""
Business logic / use cases for the inventory app.
Keeps orchestration out of views and serializers.
"""
from datetime import date
from typing import Optional
from django.db import transaction
from rest_framework.exceptions import APIException, ValidationError

from .choices import TipoMovimentacao


class StockCountConflict(APIException):
    status_code = 409
    default_detail = "O saldo mudou desde a conferência. Atualize o lote e confira novamente."
    default_code = "stock_count_conflict"


@transaction.atomic
def record_stock_count(lot, user, *, quantidade_contada, saldo_esperado, motivo):
    """Apply a physical count as an immutable signed movement, never a silent edit."""
    from .models import ItemEstoque, LoteEstoque, MovimentacaoEstoque

    ItemEstoque.objects.select_for_update().get(pk=lot.item_id, organization=user.organization)
    lot = LoteEstoque.objects.select_for_update().get(pk=lot.pk)
    if not lot.ativo and quantidade_contada > 0:
        raise ValidationError({"quantidade_contada": "Reative o lote com saldo zero antes de registrar saldo positivo."})
    before = lot.quantidade_atual
    if before != saldo_esperado:
        raise StockCountConflict()
    delta = quantidade_contada - before
    if delta == 0:
        raise ValidationError({"quantidade_contada": "A contagem é igual ao saldo. Não há ajuste a registrar."})
    movement = MovimentacaoEstoque.objects.create(
        item=lot.item, lote=lot, tipo=TipoMovimentacao.AJUSTE, quantidade=delta,
        responsavel=user, destino="Inventário",
        observacao=f"Inventário: saldo anterior {before}; contagem {quantidade_contada}; diferença {delta}. Motivo: {motivo}",
    )
    lot.quantidade_atual = quantidade_contada
    lot.save(update_fields=["quantidade_atual", "updated_at"])
    return movement


def criar_lote_e_movimentacao(item, batch_fields: dict, request=None) -> None:
    """
    Creates an initial StockBatch + entry StockMovement for a new item.

    Args:
        item: ItemEstoque instance (already saved).
        batch_fields: dict with batch metadata (qty, cost, dates, etc.).
        request: DRF request (used to set responsible user).
    """
    from .models import LoteEstoque, MovimentacaoEstoque

    qty = batch_fields.get("quantidade_inicial") or 0
    responsavel = request.user if request and request.user.is_authenticated else None

    # Set organization on item if not already set
    if not item.organization and responsavel and responsavel.organization:
        item.organization = responsavel.organization
        item.save(update_fields=["organization"])

    lote = LoteEstoque.objects.create(
        item=item,
        numero_lote=batch_fields.get("numero_lote", ""),
        data_fabricacao=batch_fields.get("data_fabricacao"),
        data_validade=batch_fields.get("data_validade"),
        quantidade_inicial=qty,
        quantidade_atual=qty,
        custo_unitario=batch_fields.get("custo_unitario"),
        local_armazenamento=batch_fields.get("local_armazenamento", ""),
        fornecedor=batch_fields.get("fornecedor"),
        nota_fiscal=batch_fields.get("nota_fiscal", ""),
        data_entrada=date.today(),
        observacao=batch_fields.get("observacao_lote", ""),
        ativo=True,
    )

    # Try to find a farm for the movement
    farm = None
    if responsavel and responsavel.organization:
        # Fallback to the first farm of the organization if no specific farm context
        farm = responsavel.organization.farms.first()

    MovimentacaoEstoque.objects.create(
        farm=farm,
        item=item,
        lote=lote,
        tipo=TipoMovimentacao.COMPRA, # Changed from ENTRADA to COMPRA as per choices
        quantidade=qty,
        responsavel=responsavel,
        observacao="Entrada inicial — cadastro de item",
    )


def registrar_movimentacao(item, lote=None, tipo: str = TipoMovimentacao.COMPRA,
                            quantidade=0, responsavel=None, observacao: str = "",
                            destino: str = "", farm=None) -> None:
    """
    Records a generic stock movement and updates the batch balance.
    """
    from .models import MovimentacaoEstoque

    if farm and farm.organization_id != item.organization_id:
        raise ValidationError({"farm": "A fazenda não pertence à organização do estoque."})
    if lote and lote.item_id != item.pk:
        raise ValidationError({"lote": "O lote não pertence ao item informado."})
    if responsavel and responsavel.organization_id != item.organization_id:
        raise ValidationError({"responsavel": "O responsável não pertence à organização do estoque."})
    # Without a known production context, leave the movement unassigned rather
    # than attributing it to an arbitrary property.

    MovimentacaoEstoque.objects.create(
        farm=farm,
        item=item,
        lote=lote,
        tipo=tipo,
        quantidade=quantidade,
        responsavel=responsavel,
        destino=destino,
        observacao=observacao,
    )

    # Update batch balance for out / loss / expiry movements
    # Compras and Entradas increase balance
    # Vendas, Consumos and Perdas decrease balance
    if lote:
        if tipo in (
            TipoMovimentacao.VENDA,
            TipoMovimentacao.CONSUMO,
            TipoMovimentacao.PERDA,
            TipoMovimentacao.SAIDA,
            TipoMovimentacao.VENCIMENTO,
        ):
            lote.quantidade_atual = max(0, lote.quantidade_atual - quantidade)
            lote.save(update_fields=["quantidade_atual", "updated_at"])
        elif tipo in (TipoMovimentacao.COMPRA, TipoMovimentacao.ENTRADA):
            lote.quantidade_atual += quantidade
            lote.save(update_fields=["quantidade_atual", "updated_at"])


def movement_has_financial_origin(movement):
    from apps.finance.models import Transaction
    references = [f"STOCK-MOV-{movement.pk}"]
    if movement.tipo in (TipoMovimentacao.COMPRA, TipoMovimentacao.ENTRADA) and movement.lote_id:
        references.append(f"LOTE-{movement.lote_id}")
    return Transaction.objects.filter(organization_id=movement.item.organization_id, reference__in=references).exists()
