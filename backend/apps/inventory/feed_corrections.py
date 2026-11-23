"""Correct production records without guessing which ingredient lots were used."""
from datetime import datetime
from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework import exceptions, serializers

from . import mobile_feed as feed
from .models import FormulaRacao, ItemEstoque, LoteEstoque, MovimentacaoEstoque, ProducaoRacao


class EditInput(feed.ProductionInput):
    date = serializers.DateField()


def set_production_date(production, day):
    if day > timezone.localdate():
        raise serializers.ValidationError({"date": "A data da produção não pode ser futura."})
    current = timezone.localtime(production.data_producao)
    production.data_producao = timezone.make_aware(datetime.combine(day, current.time()))
    production.save(update_fields=["data_producao", "updated_at"])


@transaction.atomic
def correct(user, pk, command=None):
    feed.authorize(user)
    old = ProducaoRacao.objects.select_for_update(of=("self",)).filter(
        pk=pk, organization_id=user.organization_id, formula__organization_id=user.organization_id,
    ).first()
    if old is None:
        raise exceptions.NotFound()
    if old.status == "cancelada" and command is None:
        return old
    if old.status != "concluida":
        raise feed.Conflict()
    if command and command["date"] > timezone.localdate():
        raise serializers.ValidationError({"date": "A data da produção não pode ser futura."})
    if command and all(getattr(old, field) == command[key] for field, key in (
        ("formula_id", "formula"), ("quantidade_teorica", "quantidade_teorica"), ("quantidade_real", "quantidade_real"),
    )):
        set_production_date(old, command["date"])
        return old

    marker = f"Produção {old.pk}: "
    movements = MovimentacaoEstoque.objects.filter(
        item__organization_id=user.organization_id, observacao__startswith=marker,
    )
    inputs = list(movements.filter(tipo="consumo"))
    output = movements.filter(tipo="entrada", lote__numero_lote=f"PROD-{old.pk}").first()
    if not inputs or output is None or any(not row.lote_id for row in inputs):
        raise serializers.ValidationError({"detail": "A produção não possui rastreabilidade suficiente para reverter os insumos."})
    if output.quantidade != old.quantidade_real or any(row.quantidade <= 0 for row in inputs):
        raise feed.Conflict()

    formulas = {old.formula_id}
    if command:
        formulas.add(command["formula"])
    locked = {row.pk: row for row in FormulaRacao.objects.select_for_update().filter(
        pk__in=formulas, organization_id=user.organization_id,
    ).order_by("pk")}
    if len(locked) != len(formulas):
        raise exceptions.NotFound()
    affected_items = {row.item_id for row in [*inputs, output]}
    if command:
        formula = locked[command["formula"]]
        if formula.segmento != locked[old.formula_id].segmento:
            raise serializers.ValidationError({"formula": "Selecione uma fórmula do mesmo segmento."})
        affected_items.update(formula.ingredientes.values_list("item_id", flat=True))
        if formula.item_final_id:
            affected_items.add(formula.item_final_id)
    list(ItemEstoque.objects.select_for_update().filter(pk__in=affected_items, organization_id=user.organization_id).order_by("pk"))
    lots = {row.pk: row for row in LoteEstoque.objects.select_for_update().filter(
        item_id__in=affected_items, item__organization_id=user.organization_id,
    ).order_by("data_entrada", "id")}
    produced = lots.get(output.lote_id)
    if produced is None or not produced.ativo or produced.quantidade_atual != old.quantidade_real or MovimentacaoEstoque.objects.filter(
        lote_id=output.lote_id,
    ).exclude(pk=output.pk).exists():
        raise serializers.ValidationError({"detail": "A ração produzida já foi movimentada. A produção não pode ser revertida."})

    restored = {}
    for row in inputs:
        lot = lots.get(row.lote_id)
        if not lot or lot.item_id != row.item_id or not lot.ativo:
            raise serializers.ValidationError({"detail": "Um lote de insumo original não está disponível para estorno."})
        restored[lot.pk] = restored.get(lot.pk, Decimal("0")) + row.quantidade
    for lot_id, quantity in restored.items():
        lot = lots[lot_id]
        if lot.quantidade_atual + quantity > feed.MAX_QTY:
            raise feed.Conflict()
        lot.quantidade_atual += quantity
        lot.save(update_fields=["quantidade_atual", "updated_at"])
        MovimentacaoEstoque.objects.create(item_id=lot.item_id, lote=lot, tipo="entrada", quantidade=quantity,
                                          responsavel=user, observacao=f"Estorno de produção {old.pk}")
    produced.quantidade_atual = Decimal("0")
    produced.ativo = False
    produced.save(update_fields=["quantidade_atual", "ativo", "updated_at"])
    MovimentacaoEstoque.objects.create(item_id=produced.item_id, lote=produced, tipo="saida",
                                      quantidade=old.quantidade_real, responsavel=user, observacao=f"Estorno de produção {old.pk}")
    old.status = "cancelada"
    old.save(update_fields=["status", "updated_at"])
    if command is None:
        return old
    snapshot, formula, final, taken = feed.evaluate(user, command, lock=True)
    receipt = feed.write_production(user, snapshot, formula, final, taken)
    replacement = ProducaoRacao.objects.get(pk=receipt["id"], organization_id=user.organization_id)
    set_production_date(replacement, command["date"])
    return replacement
