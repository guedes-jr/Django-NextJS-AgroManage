"""Physical origin of collective sanitary applications, using stock movements."""
from decimal import Decimal
from datetime import timedelta
from django.db import transaction
from rest_framework.exceptions import ValidationError


def validate_management_stock(management, organization):
    lot = management.inventory_lot
    quantity = management.inventory_quantity_per_animal
    if not lot and quantity is None:
        return
    if management.kind != "sanitary" or not lot or not quantity or quantity <= 0:
        raise ValidationError("Informe o lote e a quantidade positiva por animal apenas em manejo sanitário.")
    item = lot.item
    categories = {item.categoria, *(item.categorias or [])}
    if item.organization_id != organization.pk or not categories.intersection({"vacina", "medicamento", "medicamento_vacina"}) or item.especie_animal not in {"", "bovino", "multiplo"}:
        raise ValidationError("Produto sanitário incompatível ou fora da organização.")
    if not item.ativo or not lot.ativo or lot.data_entrada > management.date or (lot.data_validade and lot.data_validade < management.date):
        raise ValidationError("Lote sanitário inativo, vencido ou ainda não recebido na data do manejo.")
    if item.carencia_dias:
        minimum = management.date + timedelta(days=item.carencia_dias)
        for field in ["milk_withdrawal_until", "meat_withdrawal_until"]:
            value = getattr(management, field, None)
            if value is None or value < minimum:
                raise ValidationError({field: f"Respeite a carência cadastrada no produto: informe uma data igual ou posterior a {minimum.strftime('%d/%m/%Y')}."})



@transaction.atomic
def consume_management_stock(management, user, head_count):
    from apps.inventory.models import LoteEstoque, MovimentacaoEstoque
    from apps.inventory.services import registrar_movimentacao
    from apps.inventory.choices import TipoMovimentacao
    if not management.inventory_lot_id:
        return
    if management.inventory_movement_id:
        return
    lot = LoteEstoque.objects.select_for_update().select_related("item").get(pk=management.inventory_lot_id)
    management.inventory_lot = lot
    validate_management_stock(management, user.organization)
    quantity = management.inventory_quantity_per_animal * head_count
    if quantity > lot.quantidade_atual:
        raise ValidationError("Saldo insuficiente no lote para todos os participantes.")
    # Stock API records the authoritative movement and updates its lot atomically.
    marker = f"Manejo bovino {management.pk}"
    registrar_movimentacao(lot.item, lote=lot, tipo=TipoMovimentacao.CONSUMO, quantidade=quantity, responsavel=user, observacao=marker, destino="Sanidade bovina", farm=management.farm)
    movement = MovimentacaoEstoque.objects.get(item=lot.item, lote=lot, observacao=marker)
    management.inventory_movement = movement
    management.inventory_cost_snapshot = (quantity * lot.custo_unitario).quantize(Decimal(".01")) if lot.custo_unitario is not None else None
    management.save(update_fields=["inventory_movement", "inventory_cost_snapshot", "updated_at"])
