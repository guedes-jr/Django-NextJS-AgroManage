from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Optional

from django.db import transaction
from django.utils import timezone

from .models import Animal, AnimalBatch, BatchPhaseHistory, HistoricoEvento, Litter


PHASE_LABELS = {
    "creche": "Creche",
    "crescimento": "Crescimento",
    "engorda": "Terminação/Engorda",
    "gestacao_maternidade": "Gestação/Maternidade",
    "maternidade": "Maternidade",
    "reproducao": "Reprodução",
}


def ensure_birth_batch(birth) -> AnimalBatch:
    """Materialize the litter as a feedable maternity batch from the birth date."""
    if birth.batch_id:
        return birth.batch

    base_code = f"MAT-{birth.female.identifier}-{birth.birth_order}"
    code = base_code[:50]
    suffix = 1
    while AnimalBatch.objects.filter(farm=birth.female.farm, batch_code=code).exists():
        suffix += 1
        code = f"{base_code[:46]}-{suffix}"

    batch = AnimalBatch.objects.create(
        farm=birth.female.farm,
        species=birth.female.species,
        breed=birth.female.breed,
        batch_code=code,
        name=f"Leitegada {birth.female.identifier} - parto {birth.birth_order}",
        quantity=max(0, birth.live_born - birth.mortality),
        entry_date=birth.birth_date,
        phase=AnimalBatch.Phase.GESTACAO_MATERNIDADE,
        category=AnimalBatch.Category.LEITAO,
        origin=AnimalBatch.Origin.BORN,
        status=AnimalBatch.Status.ACTIVE,
        mother=birth.female,
        avg_weight_kg=birth.avg_weight_kg,
        notes="Lote criado automaticamente no registro do parto.",
    )
    open_batch_phase(
        batch,
        batch.phase,
        birth.birth_date,
        quantity=batch.quantity,
        avg_weight_kg=batch.avg_weight_kg,
    )
    birth.batch = batch
    birth.save(update_fields=["batch"])
    Litter.objects.get_or_create(birth=birth)
    return batch


@transaction.atomic
def wean_birth(
    birth,
    *,
    weaning_date: date,
    weaned_quantity: int,
    avg_weaning_weight_kg: Optional[Decimal] = None,
    weaning_type: str = "total",
    batch_code: str = "",
    next_mating_notice_days: Optional[int] = None,
) -> tuple[Litter, AnimalBatch]:
    """Move all or part of a maternity litter to nursery without losing history."""
    birth = birth.__class__.objects.select_for_update().get(pk=birth.pk)
    maternity_batch = ensure_birth_batch(birth)
    maternity_batch = AnimalBatch.objects.select_for_update().get(pk=maternity_batch.pk)
    available = maternity_batch.quantity
    if weaned_quantity < 1 or weaned_quantity > available:
        raise ValueError(f"Quantidade desmamada deve estar entre 1 e {available}.")

    notice_date = None
    if next_mating_notice_days:
        from datetime import timedelta
        notice_date = weaning_date + timedelta(days=next_mating_notice_days)
    litter, _ = Litter.objects.update_or_create(
        birth=birth,
        defaults={
            "weaning_date": weaning_date,
            "weaned_quantity": weaned_quantity,
            "avg_weaning_weight_kg": avg_weaning_weight_kg,
            "next_mating_notice_days": next_mating_notice_days,
            "next_mating_notice_date": notice_date,
        },
    )

    is_partial = weaning_type == "parcial" and weaned_quantity < available
    if is_partial:
        maternity_batch.quantity = available - weaned_quantity
        maternity_batch.save(update_fields=["quantity"])
        code = (batch_code or f"CRECHE-{maternity_batch.batch_code}")[:50]
        nursery = AnimalBatch.objects.create(
            farm=maternity_batch.farm,
            species=maternity_batch.species,
            breed=maternity_batch.breed,
            batch_code=code,
            name=maternity_batch.name,
            quantity=weaned_quantity,
            entry_date=weaning_date,
            phase=AnimalBatch.Phase.CRECHE,
            category=AnimalBatch.Category.LEITAO,
            origin=AnimalBatch.Origin.BORN,
            status=AnimalBatch.Status.ACTIVE,
            mother=birth.female,
            avg_weight_kg=avg_weaning_weight_kg,
            notes=f"Desmame parcial originado do lote {maternity_batch.batch_code}.",
        )
        nursery.source_batches.add(maternity_batch)
        open_batch_phase(nursery, nursery.phase, weaning_date)
    else:
        nursery = transfer_batch_phase(
            maternity_batch,
            AnimalBatch.Phase.CRECHE,
            weaning_date,
            exit_quantity=weaned_quantity,
            exit_weight_kg=avg_weaning_weight_kg,
            notes="Desmame da leitegada.",
        )

    female = birth.female
    female.reproductive_status = (
        Animal.ReproductiveStatus.LACTANTE
        if is_partial
        else Animal.ReproductiveStatus.AGUARDANDO_COBERTURA
    )
    female.save(update_fields=["reproductive_status"])
    return litter, nursery


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
