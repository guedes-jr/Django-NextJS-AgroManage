"""Semen collection of breeding males (Reprodução › Reprodutores).

Registering a collection:
- takes the diluent components out of stock (oldest lots first), their cost
  becoming the cost of the doses;
- puts the doses produced into stock as a lot of the reproducer's semen item,
  which matings then consume. The lot is a stock transformation (``PROD-``):
  the diluent was already an expense when purchased, so no new payable.
"""
from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from django.utils.translation import gettext as translate_message
from rest_framework.exceptions import ValidationError

from .models import Animal, SemenCollection, SemenCollectionComponent

CENT = Decimal("0.01")
# (stock unit, informed unit) -> factor to convert the informed quantity into the stock unit.
UNIT_FACTORS = {
    ("ml", "ml"): Decimal("1"), ("l", "l"): Decimal("1"), ("l", "ml"): Decimal("0.001"), ("ml", "l"): Decimal("1000"),
    ("g", "g"): Decimal("1"), ("kg", "kg"): Decimal("1"), ("kg", "g"): Decimal("0.001"), ("g", "kg"): Decimal("1000"),
}
SPECIES_TO_STOCK = {"suino": "suino", "suinos": "suino", "bovino": "bovino", "bovinos": "bovino", "ave": "ave", "aves": "ave"}


def breeding_males(organization, species_code):
    """Active breeding males of a species: the same animals offered when registering a mating."""
    return Animal.objects.filter(
        farm__organization=organization, species__code=species_code, gender="M", status="active",
    )


def to_stock_quantity(item, quantity: Decimal, unit: str) -> Decimal:
    stock_unit = (item.unidade_medida or "").lower()
    unit = (unit or stock_unit).lower()
    if unit == stock_unit:
        return quantity
    factor = UNIT_FACTORS.get((stock_unit, unit))
    if factor is None:
        raise ValidationError({"components": translate_message(
            "A unidade informada para {item} não é compatível com a unidade do estoque ({unit})."
        ).format(item=item.nome, unit=item.get_unidade_medida_display())})
    return quantity * factor


def _consume(item, quantity: Decimal, *, farm, user, note: str) -> Decimal:
    """Take ``quantity`` (stock unit) out of the item's lots, oldest first; return its cost."""
    from apps.inventory.choices import TipoMovimentacao
    from apps.inventory.services import registrar_movimentacao

    lots = list(item.lotes.select_for_update().filter(ativo=True, quantidade_atual__gt=0).order_by("data_validade", "data_entrada", "created_at"))
    if sum((lot.quantidade_atual for lot in lots), Decimal("0")) < quantity:
        raise ValidationError({"components": translate_message("Estoque insuficiente de {item}.").format(item=item.nome)})
    fallback_cost = item.custo_medio or Decimal("0")
    remaining, cost = quantity, Decimal("0")
    for lot in lots:
        if remaining <= 0:
            break
        taken = min(lot.quantidade_atual, remaining)
        cost += taken * (lot.custo_unitario if lot.custo_unitario is not None else fallback_cost)
        registrar_movimentacao(item=item, lote=lot, tipo=TipoMovimentacao.CONSUMO, quantidade=taken,
                               responsavel=user, destino="Coleta de sêmen", farm=farm, observacao=note)
        remaining -= taken
    return cost.quantize(CENT, ROUND_HALF_UP)


def _semen_item(animal):
    from apps.inventory.models import ItemEstoque

    item, _ = ItemEstoque.objects.get_or_create(
        organization=animal.farm.organization, categoria="semen", nome=f"Sêmen — {animal.identifier}"[:150],
        defaults={"unidade_medida": "dose", "categorias": ["semen"],
                  "especie_animal": SPECIES_TO_STOCK.get(animal.species.code, "")},
    )
    return item


@transaction.atomic
def register_semen_collection(organization, user, data) -> SemenCollection:
    from apps.inventory.choices import TipoMovimentacao
    from apps.inventory.models import ItemEstoque, LoteEstoque, MovimentacaoEstoque

    animal = Animal.objects.select_related("farm", "species").filter(
        pk=data["animal"], farm__organization=organization, gender="M", status="active",
    ).first()
    if animal is None:
        raise ValidationError({"animal": translate_message("Selecione um reprodutor ativo.")})
    if data["collection_date"] > timezone.localdate():
        raise ValidationError({"collection_date": translate_message("A data da coleta não pode ser futura.")})
    responsible = get_user_model().objects.filter(pk=data["responsible"], organization=organization, is_active=True).first()
    if responsible is None:
        raise ValidationError({"responsible": translate_message("Selecione um responsável da organização.")})
    components = data.get("components") or []
    if data["diluted"] and not components:
        raise ValidationError({"components": translate_message("Informe a composição do diluente.")})

    collection = SemenCollection.objects.create(
        farm=animal.farm, animal=animal, collection_date=data["collection_date"], volume_ml=data["volume_ml"],
        diluted=data["diluted"], doses_produced=data["doses_produced"], responsible=responsible,
        responsible_name=(responsible.full_name or responsible.email)[:200], notes=data.get("notes", ""),
    )
    note = f"Coleta de sêmen — {animal.identifier} ({data['collection_date']:%d/%m/%Y})"
    total = Decimal("0")
    for component in components if data["diluted"] else []:
        item = ItemEstoque.objects.filter(pk=component["item"], organization=organization).first()
        if item is None:
            raise ValidationError({"components": translate_message("Item do diluente não encontrado no estoque.")})
        stock_quantity = to_stock_quantity(item, component["quantity"], component["unit"])
        cost = _consume(item, stock_quantity, farm=animal.farm, user=user, note=note)
        SemenCollectionComponent.objects.create(collection=collection, item=item, quantity=component["quantity"],
                                                unit=component["unit"], stock_quantity=stock_quantity, cost=cost)
        total += cost

    collection.total_cost = total
    if collection.doses_produced:
        semen = _semen_item(animal)
        lot = LoteEstoque(
            item=semen, numero_lote=f"PROD-SEMEN-{str(collection.pk)[:8]}", quantidade_inicial=collection.doses_produced,
            quantidade_atual=collection.doses_produced, data_entrada=collection.collection_date,
            custo_unitario=(total / collection.doses_produced).quantize(CENT, ROUND_HALF_UP), observacao=note,
        )
        lot._skip_finance_transaction = True  # stock transformation: the diluent purchase is already an expense
        lot.save()
        MovimentacaoEstoque.objects.create(item=semen, lote=lot, tipo=TipoMovimentacao.ENTRADA, quantidade=collection.doses_produced,
                                           responsavel=user, farm=animal.farm, observacao=note)
        collection.stock_lot = lot
    collection.save(update_fields=["total_cost", "stock_lot", "updated_at"])
    return collection
