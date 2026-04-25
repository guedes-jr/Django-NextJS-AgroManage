"""
Business logic / use cases for the inventory app.
Keeps orchestration out of views and serializers.
"""
from datetime import date
from typing import Optional

from .choices import TipoMovimentacao


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
        fornecedor=batch_fields.get("fornecedor", ""),
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
        tipo=TipoMovimentacao.ENTRADA,
        quantidade=qty,
        responsavel=responsavel,
        observacao="Entrada inicial — cadastro de item",
    )


def registrar_movimentacao(item, lote=None, tipo: str = TipoMovimentacao.ENTRADA,
                            quantidade=0, responsavel=None, observacao: str = "") -> None:
    """
    Records a generic stock movement and updates the batch balance.
    """
    from .models import MovimentacaoEstoque

    MovimentacaoEstoque.objects.create(
        item=item,
        lote=lote,
        tipo=tipo,
        quantidade=quantidade,
        responsavel=responsavel,
        observacao=observacao,
    )

    # Update batch balance for out / loss / expiry movements
    if lote and tipo in (
        TipoMovimentacao.SAIDA,
        TipoMovimentacao.PERDA,
        TipoMovimentacao.VENCIMENTO,
    ):
        lote.quantidade_atual = max(0, lote.quantidade_atual - quantidade)
        lote.save(update_fields=["quantidade_atual", "updated_at"])
    elif lote and tipo == TipoMovimentacao.ENTRADA:
        lote.quantidade_atual += quantidade
        lote.save(update_fields=["quantidade_atual", "updated_at"])
