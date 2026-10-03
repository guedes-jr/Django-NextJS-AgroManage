from __future__ import annotations

from datetime import date
from decimal import Decimal
import re
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


def vaccination_inventory_quantity(vaccine_item, dosage_ml=None) -> Decimal:
    """Convert the applied dosage in ml to the unit used by the inventory item."""
    dosage = Decimal(str(dosage_ml or 0))
    if dosage <= 0:
        return Decimal("1.00")

    unit = vaccine_item.unidade_medida
    if unit == "ml":
        quantity = dosage
    elif unit == "l":
        quantity = dosage / Decimal("1000")
    elif unit == "dose":
        match = re.search(r"\d+(?:[.,]\d+)?", vaccine_item.volume_por_dose or "")
        volume_per_dose = Decimal(match.group(0).replace(",", ".")) if match else Decimal("0")
        quantity = dosage / volume_per_dose if volume_per_dose > 0 else dosage
    elif unit == "unidade" and vaccine_item.doses_por_embalagem:
        match = re.search(r"\d+(?:[.,]\d+)?", vaccine_item.volume_por_dose or "")
        volume_per_dose = Decimal(match.group(0).replace(",", ".")) if match else Decimal("0")
        package_volume = volume_per_dose * vaccine_item.doses_por_embalagem
        quantity = dosage / package_volume if package_volume > 0 else dosage
    else:
        quantity = dosage

    return quantity.quantize(Decimal("0.01"))


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
        HistoricoEvento.objects.create(
            farm=nursery.farm, lote=nursery, tipo_evento='Transferência de Leitões',
            descricao=f'Desmame parcial: {weaned_quantity} leitões de {maternity_batch.batch_code}.',
            data_evento=weaning_date,
            metadata={
                'source_batch_ids': [str(maternity_batch.pk)],
                'source_quantities': {str(maternity_batch.pk): weaned_quantity},
                'source_available_quantities': {str(maternity_batch.pk): available},
            },
        )
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


def batch_sale_summary(batch):
    if hasattr(batch, 'sale_closures'):
        return batch.sale_closures[0].metadata if batch.sale_closures else None
    event = batch.historicos.filter(tipo_evento='Fechamento de Venda do Lote').order_by('-created_at').first()
    return event.metadata if event else None


def finalize_batch_sale(batch, data, quantity, amount):
    from django.db.models import Sum
    sales = list(batch.historicos.filter(tipo_evento='Venda de Animais'))
    if any(event.data_evento > data['date'] for event in sales):
        from rest_framework.exceptions import ValidationError
        raise ValidationError({'date': 'O fechamento não pode ocorrer antes das vendas anteriores.'})
    sold_quantity = quantity + sum(int(event.metadata['quantity']) for event in sales)
    total_weight = data['weight_kg'] + sum((Decimal(event.metadata['weight_kg']) for event in sales), Decimal('0'))
    total_amount = amount + sum((Decimal(event.metadata['amount']) for event in sales), Decimal('0'))
    average = total_weight / sold_quantity
    if total_amount > Decimal('9999999999.99') or average > Decimal('999999.99'):
        from rest_framework.exceptions import ValidationError
        raise ValidationError({'weight_kg': 'Os totais do lote excedem os limites permitidos.'})
    phase = batch.phase_histories.filter(phase=batch.phase, exit_date__isnull=True).first()
    entry_event = batch.historicos.filter(tipo_evento='Entrada de Lote').order_by('data_evento').first()
    entry = entry_event.metadata if entry_event else {}
    entry_weight = phase.avg_weight_kg if phase else entry.get('peso_medio_entrada')
    entry_quantity = phase.quantity if phase else entry.get('quantidade')
    start = phase.entry_date if phase else batch.entry_date
    days = (data['date'] - start).days
    gain = average - Decimal(str(entry_weight)) if entry_weight is not None else None
    feed = (batch.feeding_records.filter(date__range=(start, data['date'])).aggregate(total=Sum('quantity_kg'))['total'] or Decimal('0'))
    feed += (batch.consumos.filter(data_inicio__range=(start, data['date'])).aggregate(total=Sum('quantidade'))['total'] or Decimal('0'))
    summary = {
        'phase': batch.phase, 'quantity': sold_quantity, 'total_weight_kg': str(total_weight),
        'avg_weight_kg': str(average), 'amount': str(total_amount),
        'entry_quantity': entry_quantity, 'entry_weight_kg': str(entry_weight) if entry_weight is not None else None,
        'entry_date': start.isoformat(), 'exit_date': data['date'].isoformat(),
        'daily_weight_gain': str(gain / days) if gain is not None and days > 0 else None,
        'feed_conversion': str(feed / (gain * sold_quantity)) if gain is not None and gain > 0 and feed > 0 else None,
    }
    consolidate_batch_phase_exit(batch, data['date'], exit_quantity=sold_quantity, exit_weight_kg=average)
    HistoricoEvento.objects.create(farm=batch.farm, lote=batch, tipo_evento='Fechamento de Venda do Lote',
        descricao=f'Venda finalizada: {sold_quantity} animais, {total_weight} kg.', data_evento=data['date'], metadata=summary)
    batch.avg_weight_kg = average.quantize(Decimal('0.01'))
    batch.sale_value = total_amount
    return summary


@transaction.atomic
def register_batch_sale(batch, data):
    """Lock stock and record a full or partial sale and its revenue atomically."""
    from rest_framework.exceptions import ValidationError
    from apps.finance.models import FinancialCategory, Transaction
    import uuid

    batch = AnimalBatch.objects.select_for_update().select_related('farm', 'species').get(pk=batch.pk)
    if batch.status != AnimalBatch.Status.ACTIVE or batch.quantity < 1:
        raise ValidationError({'batch': 'Selecione um lote ativo com animais disponíveis.'})
    quantity = batch.quantity if data['mode'] == 'whole' else data['quantity']
    if quantity > batch.quantity:
        raise ValidationError({'quantity': 'A quantidade vendida não pode exceder o saldo disponível.'})
    closes_batch = quantity == batch.quantity
    amount = (data['weight_kg'] * data['price_per_kg']).quantize(Decimal('0.01'))
    if amount <= 0 or amount > Decimal('9999999999.99'):
        raise ValidationError({'price_per_kg': 'Valor total da venda fora do limite permitido.'})
    metadata = {
        'batch_code': batch.batch_code, 'quantity': quantity,
        'weight_kg': str(data['weight_kg']), 'price_per_kg': str(data['price_per_kg']),
        'buyer': data['buyer'], 'responsible': data.get('responsible', ''),
        'notes': data.get('notes', ''), 'amount': str(amount), 'mode': 'whole' if closes_batch else 'partial',
    }
    category, _ = FinancialCategory.objects.get_or_create(
        organization=batch.farm.organization, name='Venda de Animais', category_type='revenue',
    )
    # Create revenue before saving sold status so the legacy signal cannot duplicate it.
    reference = f'SALE-BATCH-{batch.pk}' if closes_batch else f'SALE-BATCH-{batch.pk}-{uuid.uuid4()}'
    revenue = Transaction.objects.create(
        organization=batch.farm.organization, farm=batch.farm, animal_batch=batch,
        species=batch.species, category=category,
        description=f'Venda de animais: {batch.batch_code} ({quantity} animais)',
        amount=amount, due_date=data['date'], payment_date=data['date'],
        status='paid', reference=reference, notes=data.get('notes', ''),
    )
    metadata['transaction_reference'] = revenue.reference
    if closes_batch:
        batch.status = AnimalBatch.Status.SOLD
        batch.exit_date = data['date']
        finalize_batch_sale(batch, data, quantity, amount)
    else:
        batch.quantity -= quantity
    batch.save()
    HistoricoEvento.objects.create(
        farm=batch.farm, lote=batch, tipo_evento='Venda de Animais',
        descricao=revenue.description, data_evento=data['date'], metadata=metadata,
    )
    return metadata


def batch_financial_details(batch):
    """Recorded batch costs, including source lots, without imputing missing prices."""
    from apps.finance.models import Transaction
    from .models import ClinicalRecord, LitterMedication, VaccinationRecord
    from django.db.models import Q
    batch_ids = {batch.pk}
    frontier = batch_ids
    while frontier:
        sources = set(AnimalBatch.objects.filter(pk__in=frontier).values_list('source_batches__pk', flat=True)) - {None} - batch_ids
        batch_ids.update(sources)
        frontier = sources
    entries = []
    def add(key, group, description, date, amount, quantity=None, unit=None):
        entries.append(dict(id=key, category=group, description=description, date=str(date),
            amount=str(amount) if amount is not None else None, quantity=str(quantity) if quantity is not None else None, unit=unit))
    from apps.inventory.models import ConsumoRacao
    for item in ConsumoRacao.objects.filter(lote_animal_id__in=batch_ids, organization=batch.farm.organization).select_related('item_estoque'):
        add(f'feed-{item.pk}', 'Ração', item.item_estoque.nome, item.data_inicio, item.custo_total, item.quantidade, 'kg')
    for item in VaccinationRecord.objects.filter(batch_id__in=batch_ids, farm__organization=batch.farm.organization):
        add(f'vaccine-{item.pk}', 'Vacinas', item.vaccine_name, item.application_date, item.inventory_cost_snapshot)
    for item in ClinicalRecord.objects.filter(batch_id__in=batch_ids, farm__organization=batch.farm.organization):
        add(f'clinical-{item.pk}', 'Tratamentos', item.clinical_notes or 'Tratamento clínico', item.record_date, item.treatment_cost)
    for item in LitterMedication.objects.filter(Q(batch_id__in=batch_ids) | Q(batch__isnull=True, birth__batch_id__in=batch_ids), birth__female__farm__organization=batch.farm.organization):
        add(f'medication-{item.pk}', 'Medicamentos / vacinas da leitegada', item.medicamento, item.data_aplicacao, None, item.inventory_quantity)
    for item in Transaction.objects.filter(animal_batch_id__in=batch_ids, organization=batch.farm.organization,
        category__category_type='expense').exclude(status='cancelled').select_related('category'):
        add(f'transaction-{item.pk}', item.category.name, item.description, item.due_date, item.amount)
    from apps.reports.sire_costs import allocate_sire_costs
    sire_allocation = allocate_sire_costs(batch.farm.organization)
    entries.extend(sire_allocation['entries'].get(str(batch.pk), []))
    totals = {}
    for item in entries:
        if item['amount'] is not None:
            totals[item['category']] = totals.get(item['category'], Decimal('0')) + Decimal(item['amount'])
    total = sum(totals.values(), Decimal('0'))
    summary = batch_sale_summary(batch)
    quantity = summary['quantity'] if summary else batch.quantity
    weight = Decimal(summary['total_weight_kg']) if summary else (batch.avg_weight_kg * quantity if batch.avg_weight_kg else None)
    return dict(batch_code=batch.batch_code, entries=sorted(entries, key=lambda item: item['date'], reverse=True),
        totals={key: str(value) for key, value in totals.items()}, total=str(total),
        cost_per_animal=str(total / quantity) if quantity else None,
        cost_per_kg=str(total / weight) if weight else None,
        missing_cost_count=sum(item['amount'] is None for item in entries),
        reproduction_allocation_pending=str(batch.pk) in sire_allocation['pending_batches'])
