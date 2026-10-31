"""Transactional cattle planning/execution; projections never mutate warehouse stock."""
from decimal import Decimal
from django.db import transaction
from django.db.models import Q, F
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from .models import AnimalBatch, CattleManagement, CattleFeedPlan, CattleFeedDelivery


@transaction.atomic
def resolve_follow_up(management, user, *, status, note, execution=None):
    management = CattleManagement.objects.select_for_update().get(pk=management.pk, farm__organization=user.organization)
    if management.status != "confirmed" or management.kind != "sanitary" or not management.next_procedure_date:
        raise ValidationError("Este manejo não possui acompanhamento sanitário pendente.")
    if management.follow_up_status != "pending":
        if management.follow_up_status == status and management.follow_up_note == note and management.follow_up_execution_id == getattr(execution, "pk", None):
            return management
        raise ValidationError("O acompanhamento já foi resolvido. Atualize a agenda.")
    if status == "done":
        if not execution or execution.pk == management.pk or execution.farm_id != management.farm_id or execution.kind != "sanitary" or execution.status != "confirmed" or execution.date < management.date:
            raise ValidationError({"execution": "Selecione outro manejo sanitário confirmado da mesma fazenda e posterior à origem."})
        original = set(management.entries.values_list("animal_id", flat=True))
        completed = set(execution.entries.values_list("animal_id", flat=True))
        if not original or not original.issubset(completed):
            raise ValidationError({"execution": "O manejo executado deve atender todos os animais da pendência."})
    elif execution:
        raise ValidationError({"execution": "Cancelamento não recebe um manejo de execução."})
    management.follow_up_status = status
    management.follow_up_execution = execution
    management.follow_up_note = note
    management.follow_up_resolved_at = timezone.now()
    management.follow_up_resolved_by = user
    management.save(update_fields=["follow_up_status", "follow_up_execution", "follow_up_note", "follow_up_resolved_at", "follow_up_resolved_by", "updated_at"])
    return management


@transaction.atomic
def deliver_feed(plan, user, *, quantity_kg, remaining_before_kg, date, request_key, notes=""):
    from apps.inventory.models import ItemEstoque
    from apps.inventory.services import registrar_movimentacao
    batch = AnimalBatch.objects.select_for_update().get(pk=plan.batch_id, farm__organization=user.organization)
    plan = CattleFeedPlan.objects.select_for_update().select_related("item").get(pk=plan.pk)
    existing = plan.deliveries.filter(request_key=request_key).first()
    if existing:
        if (existing.quantity_kg, existing.remaining_before_kg, existing.date, existing.notes) != (quantity_kg, remaining_before_kg, date, notes):
            raise ValidationError({"request_key": "Esta identificação pertence a outro fornecimento."})
        return existing
    if date != timezone.localdate():
        raise ValidationError({"date": "O fornecimento usa o efetivo atual e deve ser registrado na data de hoje."})
    if not plan.is_active or batch.status != "active" or batch.quantity < 1 or date < plan.start_date or (plan.end_date and date > plan.end_date):
        raise ValidationError("Selecione um plano vigente para um lote ativo.")
    item = ItemEstoque.objects.select_for_update().get(pk=plan.item_id, organization=user.organization)
    if not item.ativo or item.categoria not in ["racao", "suplemento"] or item.unidade_medida != "kg" or item.especie_animal not in ["", "bovino", "multiplo"]:
        raise ValidationError("O produto do plano não é mais elegível para alimentação bovina.")
    lots = list(item.lotes.select_for_update().filter(
        Q(data_validade__isnull=True) | Q(data_validade__gte=date),
        ativo=True, quantidade_atual__gt=0, data_entrada__lte=date,
    ).order_by(F("data_validade").asc(nulls_last=True), "data_entrada", "id"))
    if sum((row.quantidade_atual for row in lots), Decimal(0)) < quantity_kg:
        raise ValidationError({"quantity_kg": "Estoque elegível insuficiente. Lotes vencidos, inativos ou com entrada futura não podem ser fornecidos."})
    daily_requirement = plan.kg_per_head_day * batch.quantity
    if daily_requirement > Decimal("99999999999.999"):
        raise ValidationError("A necessidade diária excede o limite permitido.")
    remaining, cost = quantity_kg, Decimal(0)
    delivery = CattleFeedDelivery.objects.create(plan=plan, plan_version=plan.version, date=date, quantity_kg=quantity_kg, remaining_before_kg=remaining_before_kg, available_after_kg=remaining_before_kg + quantity_kg, daily_requirement_kg=daily_requirement, head_count=batch.quantity, cost=0, request_key=request_key, notes=notes, created_by=user)
    for lot in lots:
        if remaining <= 0: break
        take = min(remaining, lot.quantidade_atual)
        cost += take * (lot.custo_unitario or Decimal(0))
        registrar_movimentacao(item=item, lote=lot, tipo="saida", quantidade=take, responsavel=user, farm=batch.farm, cattle_delivery=delivery, destino=f"Cocho · {batch.batch_code}", observacao=f"Fornecimento bovino {delivery.pk}. Transferência ao cocho; não registrar novamente como consumo do almoxarifado.")
        remaining -= take
    if cost > Decimal("99999999999999.99"):
        raise ValidationError("O custo do fornecimento excede o limite permitido.")
    delivery.cost = cost.quantize(Decimal("0.01"))
    delivery.save(update_fields=["cost", "updated_at"])
    return delivery
