"""Explicit corrections of collective cattle headcounts, using the existing history."""
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from .models import Animal, AnimalBatch, HistoricoEvento


def validate_headcount_edit(instance, values):
    if instance and instance.species.code == "bovinos" and "quantity" in values:
        # Even an unchanged value can overwrite a concurrent movement after validation.
        raise ValidationError({"quantity": "Altere o efetivo por um lançamento, com motivo e conferência do saldo atual."})


@transaction.atomic
def adjust_headcount(batch, user, *, quantity, expected_quantity, reason, request_key):
    batch = AnimalBatch.objects.select_for_update().select_related("farm", "species").get(
        pk=batch.pk, farm__organization=user.organization, species__code="bovinos",
    )
    key = str(request_key)
    previous = batch.historicos.filter(tipo_evento="Ajuste de efetivo", metadata__request_key=key).first()
    if previous:
        if (previous.metadata["quantity_after"], previous.metadata["quantity_before"], previous.metadata["reason"]) != (quantity, expected_quantity, reason):
            raise ValidationError({"request_key": "Identificação já utilizada em outro lançamento."})
        return previous
    if batch.status != "active":
        raise ValidationError("Ajustes são permitidos somente em lotes ativos.")
    if batch.quantity != expected_quantity:
        raise ValidationError({"expected_quantity": "O efetivo mudou. Atualize o lote e confira o novo saldo antes de lançar."})
    if quantity == batch.quantity:
        raise ValidationError({"quantity": "Informe um efetivo diferente do atual."})
    if quantity < Animal.objects.filter(batch=batch, status="active").count():
        raise ValidationError({"quantity": "O efetivo não pode ser menor que a quantidade de animais identificados ativos vinculados ao lote."})
    today = timezone.localdate()
    if batch.entry_date > today:
        raise ValidationError("A entrada do lote não pode estar no futuro.")
    event = HistoricoEvento.objects.create(
        farm=batch.farm, lote=batch, tipo_evento="Ajuste de efetivo", data_evento=today,
        descricao=f"Efetivo ajustado de {batch.quantity} para {quantity}. Motivo: {reason}",
        metadata={"request_key": key, "quantity_before": batch.quantity, "quantity_after": quantity,
                  "delta": quantity - batch.quantity, "reason": reason,
                  "responsible_id": str(user.pk), "responsible": user.full_name,
                  "recorded_at": timezone.now().isoformat()},
    )
    batch.quantity = quantity
    batch.save(update_fields=["quantity", "updated_at"])
    return event


def movement_row(event):
    return {"id": str(event.pk), "date": event.data_evento, "kind": event.tipo_evento,
            "description": event.descricao, "details": event.metadata, "created_at": event.created_at}
