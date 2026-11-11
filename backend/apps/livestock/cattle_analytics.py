"""Read-only milk and cost reports with explicit source and calculation bases."""
from collections import defaultdict
from datetime import date
from decimal import Decimal
from django.db.models import Sum, Count, Q, F, Exists, OuterRef
from .models import Animal, AnimalBatch, CattleMilkRecord, CattleMilkDailyTotal, CattleManagement
from .cattle_improvements import filter_purpose


def milk_trends(organization, *, start, end, farm=None, animal=None, drop_percent=20):
    records = CattleMilkRecord.objects.filter(animal__farm__organization=organization, animal__species__code="bovinos", date__range=(start, end))
    totals = CattleMilkDailyTotal.objects.filter(farm__organization=organization, date__range=(start, end))
    if farm:
        records, totals = records.filter(animal__farm_id=farm), totals.filter(farm_id=farm)
    if animal:
        records = records.filter(animal_id=animal)
        totals = totals.none()
    days = defaultdict(lambda: {"produced": Decimal(0), "discarded": Decimal(0), "milked_cows": 0, "aggregate": False})
    for row in records.values("date").annotate(produced=Sum("liters"), discarded=Sum("discarded_liters"), cows=Count("animal_id", distinct=True)):
        days[row["date"]].update(produced=row["produced"], discarded=row["discarded"], milked_cows=row["cows"])
    for row in totals.values("date").annotate(produced=Sum("liters"), discarded=Sum("discarded_liters")):
        target = days[row["date"]]
        target["produced"] += row["produced"]
        target["discarded"] += row["discarded"]
        target["aggregate"], target["milked_cows"] = True, None
    series = [{"date": date.isoformat(), **values, "usable": values["produced"]-values["discarded"]} for date, values in sorted(days.items())]
    sessions = list(records.values("session").annotate(liters=Sum("liters"), records=Count("pk")).order_by("session"))
    # Compare adjacent recorded days only when both calendar days have ended.
    # This avoids raising a daily drop after only the morning milking was entered.
    from django.utils import timezone
    complete = [point for point in series if point["date"] < timezone.localdate().isoformat()]
    alert = None
    if len(complete) >= 2 and complete[-2]["produced"] > 0:
        previous, current = complete[-2:]
        consecutive = ( date.fromisoformat(current["date"]) - date.fromisoformat(previous["date"]) ).days == 1
        drop = (previous["produced"]-current["produced"]) / previous["produced"] * 100
        if consecutive and drop >= drop_percent:
            alert = {"date": current["date"], "previous_date": previous["date"], "drop_percent": round(drop, 2), "threshold": drop_percent,
                     "text": "Queda no volume registrado; confira se todos os turnos foram lançados antes de avaliar o desempenho."}
    return {"series": series, "sessions": sessions, "drop_alert": alert, "drop_threshold": drop_percent,
            "produced": sum((point["produced"] for point in series), Decimal(0)), "days_with_records": len(series),
            "scope": "individual" if animal else "farm", "note": "Dias sem registros não são considerados produção zero. Totais diários não são distribuídos por turno ou por vaca."}


def allocated_cost(amount, participants, selected_ids):
    """Equal per-participant allocation, with deterministic cent remainders."""
    if amount is None:
        return None
    identifiers = sorted(str(pk) for pk in participants)
    if not identifiers:
        return amount
    selected = {str(pk) for pk in selected_ids}
    cents = int((amount * 100).quantize(Decimal("1")))
    quotient, remainder = divmod(cents, len(identifiers))
    return Decimal(sum(quotient + (index < remainder) for index, pk in enumerate(identifiers) if pk in selected)) / 100


NATIVE_COST_MAX_ENTRIES = 5000
NATIVE_COST_MAX_ANIMALS = 10000


def cattle_cost_report(organization, *, start, end, farm=None, batch=None, purpose=None, native=False):
    from apps.inventory.models import ConsumoRacao
    from apps.finance.models import Transaction
    from .models import VaccinationRecord, HealthRecord, CattleProtocolStep
    batches = filter_purpose(AnimalBatch.objects.filter(farm__organization=organization, species__code="bovinos"), purpose)
    animals = filter_purpose(Animal.objects.filter(farm__organization=organization, species__code="bovinos"), purpose)
    if farm:
        batches, animals = batches.filter(farm_id=farm), animals.filter(farm_id=farm)
    if batch:
        batches, animals = batches.filter(pk=batch), animals.filter(batch_id=batch)
    entries = []
    from rest_framework.exceptions import ValidationError
    def limited(rows):return rows[:NATIVE_COST_MAX_ENTRIES+1] if native else rows
    selected_ids = set(animals.values_list("pk", flat=True)[:NATIVE_COST_MAX_ANIMALS+1] if native else animals.values_list("pk", flat=True))
    if native and len(selected_ids)>NATIVE_COST_MAX_ANIMALS:raise ValidationError("Restrinja a fazenda/lote: muitos participantes para a análise mobile.")
    def add(source, key, date, description, amount, reference):
        if native and len(entries)>=NATIVE_COST_MAX_ENTRIES:raise ValidationError("Restrinja o período ou lote: análise mobile excede o limite de registros.")
        entries.append({"id": f"{source}:{key}", "source": source, "date": str(date), "description": description,
                        "amount": amount, "reference": str(reference) if reference else None})
    feeds = ConsumoRacao.objects.filter(organization=organization, data_inicio__gte=start, data_inicio__lte=end).filter(Q(lote_animal__in=batches) | Q(animais__in=animals)).distinct().select_related("item_estoque", "lote_animal").prefetch_related("animais")
    if native:
        foreign_participants=Animal.objects.filter(consumos_racao__pk=OuterRef('pk')).exclude(farm__organization=organization)
        feeds=feeds.filter(item_estoque__organization=organization).filter(Q(lote_animal__isnull=True)|Q(lote_animal__farm__organization=organization)).alias(invalid_participants=Exists(foreign_participants)).filter(invalid_participants=False)
    for row in limited(feeds):
        participants = list(row.animais.all())
        amount = allocated_cost(row.custo_total, [animal.pk for animal in participants], selected_ids) if participants else row.custo_total
        add("feed", row.pk, row.data_inicio, row.item_estoque.nome, amount, row.lote_animal_id)
    managements = CattleManagement.objects.filter(farm__organization=organization, status="confirmed", kind="sanitary", date__range=(start,end), entries__animal__in=animals).distinct().select_related("inventory_lot__item").prefetch_related("entries__animal")
    # Collective applications already produce HealthRecords; include their authoritative
    # management source only once instead of summing the generated records a second time.
    if native:
        from .models import CattleManagementEntry
        invalid_entries=CattleManagementEntry.objects.filter(management_id=OuterRef('pk')).exclude(Q(animal__farm_id=OuterRef('farm_id'))&Q(animal__species__code='bovinos'))
        managements=managements.filter(Q(inventory_lot__isnull=True)|Q(inventory_lot__item__organization=organization)).alias(invalid_entries=Exists(invalid_entries)).filter(invalid_entries=False)
    for row in limited(managements):
        participants = list(row.entries.all())
        selected = [entry for entry in participants if entry.animal_id in selected_ids]
        service_cost = row.cost_per_animal * len(selected)
        if service_cost or not row.inventory_lot_id:
            add("sanitary", f"{row.pk}:service", row.date, f"Serviço · {row.description}", service_cost, row.pk)
        if row.inventory_lot_id:
            material_cost = allocated_cost(row.inventory_cost_snapshot, [entry.animal_id for entry in participants], selected_ids)
            add("sanitary", f"{row.pk}:material", row.date, f"Material · {row.inventory_lot.item.nome} · {row.description}", material_cost, row.inventory_movement_id)
    health=HealthRecord.objects.filter(animal__in=animals, application_date__range=(start,end), cattle_management__isnull=True)
    if native:health=health.filter(farm_id=F('animal__farm_id'))
    for row in limited(health):
        add("health", row.pk, row.application_date, row.description, row.cost, row.animal_id)
    vaccines=VaccinationRecord.objects.filter(farm__organization=organization, species__code="bovinos", application_date__range=(start,end)).filter(Q(animal__in=animals) | Q(batch__in=batches)).distinct()
    if native:
        vaccines=vaccines.filter(Q(animal__isnull=True)|Q(animal__farm_id=F('farm_id'))).filter(Q(batch__isnull=True)|Q(batch__farm_id=F('farm_id'))).filter(Q(vaccine_item__isnull=True)|Q(vaccine_item__organization=organization))
    for row in limited(vaccines):
        add("vaccine", row.pk, row.application_date, row.vaccine_name, row.inventory_cost_snapshot, row.animal_id or row.batch_id)
    protocol_steps=CattleProtocolStep.objects.filter(run__animal__in=animals, executed_date__range=(start,end), inventory_movement__isnull=False).select_related("inventory_lot__item")
    if native:protocol_steps=protocol_steps.filter(run__protocol__organization=organization,inventory_lot__item__organization=organization,inventory_movement__item__organization=organization,inventory_movement__lote_id=F('inventory_lot_id'))
    for row in limited(protocol_steps):
        add("semen", row.pk, row.executed_date, row.inventory_lot.item.nome, row.inventory_cost_snapshot, row.inventory_movement_id)
    from .models import HistoricoEvento
    history=HistoricoEvento.objects.filter(lote__in=batches, tipo_evento="Sanidade de Lote Bovino", data_evento__range=(start,end))
    if native:history=history.filter(farm_id=F('lote__farm_id'))
    for row in limited(history):
        add("sanitary", f"{row.pk}:service", row.data_evento, f"Serviço · {row.descricao}", Decimal(row.metadata["service_cost"]), row.lote_id)
        material = row.metadata.get("material_cost")
        add("sanitary", f"{row.pk}:material", row.data_evento, f"Material · {row.descricao}", Decimal(material) if material is not None else None, row.metadata.get("inventory_movement"))
    # Cash/accounting expenses are a separate ledger view: never add them to physical
    # stock consumption, since a purchase may already finance the same material.
    cash = Transaction.objects.filter(organization=organization, category__category_type="expense", due_date__range=(start,end)).exclude(status="cancelled").filter(animal_batch__in=batches)
    if not batch and purpose in {None, "all"}:
        overhead = Transaction.objects.filter(organization=organization, category__category_type="expense", due_date__range=(start,end), animal_batch__isnull=True, species__code="bovinos").exclude(status="cancelled")
        if farm:
            overhead = overhead.filter(farm_id=farm)
        cash = (cash | overhead).distinct()
    if native:
        cash=cash.filter(category__organization=organization).filter(Q(farm__isnull=True)|Q(farm_id=F('animal_batch__farm_id')))
        if cash.count()>NATIVE_COST_MAX_ENTRIES:raise ValidationError("Restrinja o período ou lote: muitas despesas para a análise mobile.")
    cash_total = cash.aggregate(value=Sum("amount"))["value"] or Decimal(0)
    expenses = [{"id": str(row.pk), "date": str(row.due_date), "description": row.description, "amount": str(row.amount), "status": row.status, "reference": str(row.animal_batch_id) if row.animal_batch_id else "Não apropriada a lote"} for row in cash.order_by("-due_date", "-created_at")]
    totals = defaultdict(lambda: Decimal(0))
    for row in entries:
        if row["amount"] is not None:
            totals[row["source"]] += row["amount"]
    return {"entries": [{**row, "amount": str(row["amount"]) if row["amount"] is not None else None} for row in sorted(entries, key=lambda row: (row["date"],row["id"]), reverse=True)],
            "expenses": expenses, "totals": {key:str(value) for key,value in totals.items()}, "operational_total": str(sum(totals.values(), Decimal(0))), "expenses_by_due_date": str(cash_total),
            "missing_cost_count": sum(row["amount"] is None for row in entries),
            "note": "Consumo e aplicações são custos operacionais. Despesas financeiras são apresentadas separadamente e não são somadas novamente. Rateios individuais usam os participantes registrados, em partes iguais, com reconciliação dos centavos. Finalidade e lote dos participantes refletem o cadastro atual. Não inclui custos sem vínculo identificado ou apropriações presumidas."}
