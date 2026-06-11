from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Optional

from django.utils import timezone

from .models import AnimalBatch, BatchPhaseHistory, HistoricoEvento


PHASE_LABELS = {
    "creche": "Creche",
    "crescimento": "Crescimento",
    "engorda": "Terminação/Engorda",
    "gestacao_maternidade": "Gestação/Maternidade",
    "maternidade": "Maternidade",
    "reproducao": "Reprodução",
}


def consolidate_batch_phase_exit(
    batch: AnimalBatch,
    exit_date: date,
    *,
    exit_quantity: Optional[int] = None,
    exit_weight_kg: Optional[Decimal] = None,
    phase: Optional[str] = None,
) -> Optional[BatchPhaseHistory]:
    """Freeze the open phase record with final exit metrics."""
    target_phase = phase or batch.phase
    if not target_phase:
        return None

    phase_record, created = BatchPhaseHistory.objects.get_or_create(
        batch=batch,
        phase=target_phase,
        exit_date__isnull=True,
        defaults={
            "quantity": exit_quantity if exit_quantity is not None else batch.quantity,
            "avg_weight_kg": exit_weight_kg if exit_weight_kg is not None else batch.avg_weight_kg,
            "entry_date": batch.entry_date,
            "exit_date": exit_date,
        },
    )
    if not created:
        phase_record.exit_date = exit_date
        if exit_weight_kg is not None:
            phase_record.avg_weight_kg = exit_weight_kg
        if exit_quantity is not None:
            phase_record.quantity = exit_quantity
        phase_record.save(
            update_fields=["exit_date", "avg_weight_kg", "quantity", "updated_at"]
        )
    return phase_record


def open_batch_phase(
    batch: AnimalBatch,
    phase: str,
    entry_date: date,
    *,
    quantity: Optional[int] = None,
    avg_weight_kg: Optional[Decimal] = None,
) -> BatchPhaseHistory:
    """Create the in-progress phase record for a batch."""
    return BatchPhaseHistory.objects.create(
        batch=batch,
        phase=phase,
        quantity=quantity if quantity is not None else batch.quantity,
        avg_weight_kg=avg_weight_kg if avg_weight_kg is not None else batch.avg_weight_kg,
        entry_date=entry_date,
    )


def transfer_batch_phase(
    batch: AnimalBatch,
    new_phase: str,
    exit_date: date,
    *,
    exit_quantity: Optional[int] = None,
    exit_weight_kg: Optional[Decimal] = None,
    notes: str = "",
) -> AnimalBatch:
    """Move a batch to a new phase and freeze the previous one."""
    old_phase = batch.phase

    if old_phase:
        consolidate_batch_phase_exit(
            batch,
            exit_date,
            exit_quantity=exit_quantity,
            exit_weight_kg=exit_weight_kg,
        )

    update_fields = ["phase", "entry_date"]
    batch.phase = new_phase
    batch.entry_date = exit_date
    if exit_quantity is not None:
        batch.quantity = int(exit_quantity)
        update_fields.append("quantity")
    if exit_weight_kg is not None:
        batch.avg_weight_kg = exit_weight_kg
        update_fields.append("avg_weight_kg")
    batch.save(update_fields=update_fields)

    open_batch_phase(
        batch,
        new_phase,
        exit_date,
        quantity=batch.quantity,
        avg_weight_kg=batch.avg_weight_kg,
    )

    old_label = PHASE_LABELS.get(old_phase, old_phase or "N/A")
    new_label = PHASE_LABELS.get(new_phase, new_phase)
    HistoricoEvento.objects.create(
        farm=batch.farm,
        tipo_evento="Transferência de Fase",
        descricao=(
            f"Lote {batch.batch_code} transferido de {old_label} para {new_label}. "
            f"Qtd: {batch.quantity} animais. Peso médio de saída: {exit_weight_kg or '-'} kg."
            + (f" {notes}" if notes else "")
        ),
        data_evento=exit_date,
        lote=batch,
        metadata={
            "fase_anterior": old_phase,
            "fase_nova": new_phase,
            "quantidade": batch.quantity,
            "peso_medio_saida": float(exit_weight_kg) if exit_weight_kg else None,
        },
    )
    return batch


def record_maternity_exit_on_weaning(
    batch: AnimalBatch,
    weaning_date: date,
    *,
    weaned_quantity: int,
    avg_weaning_weight_kg: Optional[Decimal] = None,
) -> None:
    """Freeze maternity metrics when piglets move to nursery."""
    consolidate_batch_phase_exit(
        batch,
        weaning_date,
        exit_quantity=weaned_quantity,
        exit_weight_kg=avg_weaning_weight_kg,
        phase="maternidade",
    )


def finalize_batch_current_phase(batch: AnimalBatch, exit_date: Optional[date] = None) -> None:
    """Close the current phase when a batch is finished/sold without a transfer."""
    if not batch.phase:
        return
    consolidate_batch_phase_exit(
        batch,
        exit_date or timezone.now().date(),
        exit_quantity=batch.quantity,
        exit_weight_kg=batch.avg_weight_kg,
    )
