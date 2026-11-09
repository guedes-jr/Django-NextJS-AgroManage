"""Cattle feed consumption and physical trough readings, without feeding plans."""
from django.db import transaction
from django.db.models import Q, F
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.inventory.models import FormulaRacao, ItemEstoque, ConsumoRacao
from .models import AnimalBatch, CattleTroughReading, HistoricoEvento


def eligible_feed_lots(item, date, start=None):
    return item.lotes.select_for_update().filter(
        Q(data_validade__isnull=True) | Q(data_validade__gte=date),
        ativo=True, quantidade_atual__gt=0, data_entrada__lte=start or date,
    ).order_by(F("data_validade").asc(nulls_last=True), "data_entrada", "id")


def feed_formula(organization, formula):
    if not formula:
        return None
    record = get_object_or_404(FormulaRacao, pk=formula, organization=organization)
    if not record.ativa or record.especie_animal not in ["", "bovino", "multiplo"]:
        raise ValidationError({"formula": "Selecione uma fórmula bovina ativa da organização."})
    return record


@transaction.atomic
def record_trough_reading(user, *, batch, formula=None, date, session, score, remaining_kg, request_key, notes=""):
    target = get_object_or_404(AnimalBatch.objects.select_for_update(), pk=batch, farm__organization=user.organization, species__code="bovinos")
    previous = target.trough_readings.filter(request_key=request_key, plan__isnull=True).first()
    if previous:
        if (previous.date, previous.session, previous.score, previous.remaining_kg, previous.notes, str(previous.formula_id or "")) != (date, session, score, remaining_kg, notes, str(formula or "")):
            raise ValidationError({"request_key": "Identificação já utilizada em outra leitura."})
        return previous
    if date != timezone.localdate():
        raise ValidationError({"date": "Registre a leitura de hoje; o efetivo é o atual."})
    if target.status != "active" or not target.quantity or target.entry_date > date:
        raise ValidationError({"batch": "Selecione um lote bovino ativo com animais e entrada até hoje."})
    recipe = feed_formula(user.organization, formula)
    return CattleTroughReading.objects.create(batch=target, formula=recipe, formula_name=recipe.nome if recipe else "",
        date=date, session=session, score=score, remaining_kg=remaining_kg, request_key=request_key,
        notes=notes, head_count=target.quantity, created_by=user)


@transaction.atomic
def register_daily_feed(request, *, batch, date, quantity_kg, request_key, item=None, formula=None, notes="", production=None, farm=None):
    user = request.user
    target = get_object_or_404(AnimalBatch.objects.select_for_update(), pk=batch, farm__organization=user.organization, species__code="bovinos")
    values = {"item": str(item or ""), "formula": str(formula or ""), "date": str(date), "quantity": str(quantity_kg), "notes": notes}
    if production is not None:
        values["production"] = production
    if farm is not None:
        values["farm"] = str(farm)
    previous = target.historicos.filter(tipo_evento="Fornecimento de ração", metadata__request_key=str(request_key)).first()
    if previous:
        if previous.metadata.get("responsible_id") != str(user.pk):
            raise ValidationError({"request_key": "Identificação pertence a outro responsável."})
        if previous.metadata["input"] != values:
            raise ValidationError({"request_key": "Identificação já utilizada em outro trato."})
        return get_object_or_404(ConsumoRacao, pk=previous.metadata["consumption_id"], organization=user.organization)
    if farm is not None and target.farm_id != farm:
        raise ValidationError({"farm": "O lote não pertence à fazenda selecionada."})
    if production is not None and target.cattle_purpose not in (production, "dual"):
        raise ValidationError({"production": "O lote não pertence ao segmento selecionado."})
    if target.status != "active" or not target.quantity:
        raise ValidationError({"batch": "Selecione um lote ativo com animais."})
    if date != timezone.localdate() or target.entry_date > date:
        raise ValidationError({"date": "Registre o trato de hoje para um lote já recebido na fazenda."})
    recipe = feed_formula(user.organization, formula)
    if recipe:
        if not recipe.item_final_id:
            raise ValidationError({"formula": "A fórmula precisa ter um produto final cadastrado e produzido no estoque."})
        if item and recipe.item_final_id != item:
            raise ValidationError({"item": "O produto deve corresponder ao produto final da fórmula."})
        item = recipe.item_final_id
    if not item:
        raise ValidationError({"item": "Selecione a ração do estoque ou uma fórmula com produto final."})
    product = get_object_or_404(ItemEstoque, pk=item, organization=user.organization)
    from .cattle_serializers import CattleFeedSerializer
    from .cattle_services import record_cattle_feed
    serializer = CattleFeedSerializer(data={"lote_animal": str(target.pk), "item_estoque": str(product.pk),
        "data_inicio": str(date), "data_fim": str(date), "quantidade": quantity_kg, "observacao": notes}, context={"request": request})
    serializer.is_valid(raise_exception=True)
    record = record_cattle_feed(serializer, user)
    HistoricoEvento.objects.create(farm=target.farm, lote=target, tipo_evento="Fornecimento de ração", data_evento=date,
        descricao=f"{quantity_kg} kg de {product.nome} fornecidos ao lote {target.batch_code}.",
        metadata={"request_key": str(request_key), "input": values, "consumption_id": str(record.pk),
                  "responsible_id": str(user.pk), "formula_id": str(recipe.pk) if recipe else None})
    return record
