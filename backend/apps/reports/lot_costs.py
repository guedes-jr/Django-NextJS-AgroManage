"""Bulk direct batch costs plus the documented monthly sire allocation."""

import unicodedata
from collections import defaultdict
from decimal import Decimal

from django.db.models import Q

from apps.finance.models import Transaction
from apps.inventory.models import ConsumoRacao, ItemEstoque, MovimentacaoEstoque
from apps.livestock.models import (
    AnimalBatch,
    BatchPhaseHistory,
    Birth,
    ClinicalRecord,
    FeedingRecord,
    HistoricoEvento,
    LitterMedication,
    Mating,
    VaccinationRecord,
)

COST_KEYS = (
    "lactation_feed",
    "gestation_feed",
    "reproduction",
    "purchase",
    "maternity",
    "nursery",
    "growth",
    "finishing",
    "medication",
    "labor",
)
PHASE_KEYS = {
    "lactante": "lactation_feed",
    "lactacao": "lactation_feed",
    "gestante": "gestation_feed",
    "gestacao": "gestation_feed",
    "gestacao_maternidade": "maternity",
    "maternidade": "maternity",
    "creche": "nursery",
    "crescimento": "growth",
    "engorda": "finishing",
}
BREEDING_CATEGORIES = {
    "Matriz",
    "Marrã",
    "Reprodutor",
    "Cachaço",
    "Touro",
    "Vaca",
    "Novilha",
}


def normalize(value):
    return "".join(
        c
        for c in unicodedata.normalize("NFKD", value or "").lower()
        if not unicodedata.combining(c)
    )


def maternal_feed_costs(organization, batch_ids):
    """Return gestation/lactation feed allocated from each mother to her litter."""
    births_by_female = defaultdict(list)
    for birth in (
        Birth.objects.filter(batch_id__in=batch_ids, female__farm__organization=organization)
        .select_related("pregnancy", "litter")
    ):
        births_by_female[str(birth.female_id)].append(birth)
    if not births_by_female:
        return {}

    allocations = defaultdict(list)
    for feed in (
        ConsumoRacao.objects.filter(
            organization=organization, animais__id__in=births_by_female
        )
        .distinct()
        .prefetch_related("animais")
    ):
        key = PHASE_KEYS.get(normalize(feed.fase_destino))
        if key not in {"gestation_feed", "lactation_feed"}:
            continue
        targets = set()
        for animal in feed.animais.all():
            for birth in births_by_female.get(str(animal.pk), []):
                if key == "gestation_feed":
                    matches_period = birth.pregnancy.start_date <= feed.data_inicio <= birth.birth_date
                else:
                    weaning_date = getattr(getattr(birth, "litter", None), "weaning_date", None)
                    matches_period = birth.birth_date <= feed.data_inicio and (
                        not weaning_date or feed.data_inicio <= weaning_date
                    )
                if matches_period:
                    targets.add(str(birth.batch_id))
        if not targets:
            continue
        # A single entry may cover more than one selected mother. Divide it once,
        # instead of applying the whole value to every litter.
        share = feed.custo_total / len(targets)
        remainder = feed.custo_total - (share * len(targets))
        for index, batch_id in enumerate(sorted(targets)):
            allocations[batch_id].append((feed, share + (remainder if index == 0 else Decimal(0)), key))
    return allocations


def semen_costs(organization, batch_ids):
    """Recover semen stock consumption recorded with the female in its note."""
    semen_ids = [
        item["id"]
        for item in ItemEstoque.objects.filter(organization=organization).values("id", "categoria", "categorias")
        if item["categoria"] == "semen" or "semen" in (item["categorias"] or [])
    ]
    if not semen_ids:
        return {}
    births = list(
        Birth.objects.filter(batch_id__in=batch_ids, female__farm__organization=organization)
        .select_related("pregnancy__mating", "female")
    )
    if not births:
        return {}
    movements = (
        MovimentacaoEstoque.objects.filter(item_id__in=semen_ids, tipo="consumo")
        .select_related("lote")
    )
    costs = defaultdict(Decimal)
    for movement in movements:
        unit_cost = movement.lote.custo_unitario if movement.lote else None
        if unit_cost is None:
            continue
        note = movement.observacao or ""
        targets = [
            birth
            for birth in births
            if birth.pregnancy.mating.mating_type in {Mating.MatingType.AI, Mating.MatingType.IATF}
            and any(key in note for key in (str(birth.female_id), birth.female.identifier))
        ]
        if not targets:
            continue
        amount = movement.quantidade * unit_cost
        share, remainder = divmod(amount, len(targets))
        for index, birth in enumerate(targets):
            costs[str(birth.batch_id)] += share + (remainder if index == 0 else Decimal(0))
    return costs


def labor_quantity_on(batch, day, histories, first_entry, closed_balance, sales, deaths):
    dates = [value for value in (
        batch.entry_date, first_entry, histories[0].entry_date if histories else None,
    ) if value]
    if dates and day < min(dates):
        return 0
    if batch.status != AnimalBatch.Status.ACTIVE and (not batch.exit_date or day >= batch.exit_date):
        return 0
    if batch.status == AnimalBatch.Status.ACTIVE:
        current = batch.quantity
    elif closed_balance is not None:
        current = closed_balance
    elif batch.status == AnimalBatch.Status.SOLD and sales:
        current = 0
    else:
        current = batch.quantity
    return current + sum(quantity for event_day, quantity in (*sales, *deaths) if event_day > day)


def has_swine_labor_population(organization, day, *, farm=None, batch=None):
    phases = {AnimalBatch.Phase.CRECHE, AnimalBatch.Phase.CRESCIMENTO, AnimalBatch.Phase.ENGORDA}
    lots = AnimalBatch.objects.filter(
        farm__organization=organization, species__code="suinos",
    ).exclude(category__in=BREEDING_CATEGORIES).prefetch_related("phase_histories")
    if farm:
        lots = lots.filter(farm=farm)
    if batch:
        lots = lots.filter(pk=batch.pk)
    lots = list(lots)
    timelines = defaultdict(list)
    for event in HistoricoEvento.objects.filter(
        farm__organization=organization, lote_id__in=[lot.pk for lot in lots],
        tipo_evento__in=["Entrada de Lote", "Encerramento de Saldo", "Venda de Animais", "Mortalidade de Lote"],
    ).order_by("data_evento", "created_at"):
        timelines[event.lote_id].append(event)

    for lot in lots:
        histories = sorted(lot.phase_histories.all(), key=lambda row: row.entry_date)
        current = next((row for row in reversed(histories) if row.entry_date <= day
                        and (row.exit_date is None or day < row.exit_date)), None)
        phase = current.phase if current else lot.phase if lot.entry_date and day >= lot.entry_date else None
        if phase not in phases:
            continue
        first_entry = closed_balance = None
        sales, deaths = [], []
        for event in timelines[lot.pk]:
            metadata = event.metadata or {}
            if event.tipo_evento == "Entrada de Lote":
                first_entry = first_entry or event.data_evento
            elif event.tipo_evento == "Encerramento de Saldo":
                closed_balance = int(metadata.get("quantity") or 0)
            elif event.tipo_evento == "Venda de Animais":
                sales.append((event.data_evento, int(metadata.get("quantity") or 0)))
            else:
                deaths.append((event.data_evento, int(metadata.get("quantidade_mortes") or 0)))
        if labor_quantity_on(lot, day, histories, first_entry, closed_balance, sales, deaths) > 0:
            return True
    return False


def enrich_lot_costs(organization, rows):
    if not rows:
        return rows
    ids = [row["id"] for row in rows]
    batches = {
        str(batch.pk): batch
        for batch in AnimalBatch.objects.filter(
            farm__organization=organization
        ).select_related("mother__farm", "species")
    }
    sources = defaultdict(list)
    through = AnimalBatch.source_batches.through
    for child, parent in through.objects.filter(
        from_animalbatch_id__in=batches
    ).values_list("from_animalbatch_id", "to_animalbatch_id"):
        if str(parent) in batches:
            sources[str(child)].append(str(parent))
    mothers = defaultdict(set)
    for batch_id, name in Birth.objects.filter(
        batch_id__in=batches, female__farm__organization=organization
    ).values_list("batch_id", "female__identifier"):
        mothers[str(batch_id)].add(name)
    histories = defaultdict(list)
    for history in BatchPhaseHistory.objects.filter(
        batch_id__in=batches, batch__farm__organization=organization
    ).order_by("entry_date"):
        histories[str(history.batch_id)].append(history)
    costs = {key: {name: None for name in COST_KEYS} for key in ids}
    totals = defaultdict(lambda: Decimal(0))
    sales = defaultdict(lambda: Decimal(0))
    missing = defaultdict(int)

    def add(batch_id, amount, key=None):
        batch_id = str(batch_id)
        if amount is None:
            missing[batch_id] += 1
            return
        totals[batch_id] += amount
        if key:
            costs[batch_id][key] = (costs[batch_id][key] or Decimal(0)) + amount

    def phase_at(batch_id, event_date, explicit=""):
        if explicit:
            return PHASE_KEYS.get(normalize(explicit))
        matches = [
            h
            for h in histories[str(batch_id)]
            if h.entry_date <= event_date
            and (not h.exit_date or event_date < h.exit_date)
        ]
        return PHASE_KEYS.get(normalize(matches[-1].phase)) if matches else None

    for feed in ConsumoRacao.objects.filter(
        organization=organization, lote_animal_id__in=ids
    ):
        add(
            feed.lote_animal_id,
            feed.custo_total,
            phase_at(feed.lote_animal_id, feed.data_inicio, feed.fase_destino),
        )
    for batch_id, entries in maternal_feed_costs(organization, ids).items():
        for feed, amount, key in entries:
            add(batch_id, amount, key)
    for batch_id, amount in semen_costs(organization, ids).items():
        add(batch_id, amount, "reproduction")
    for vaccine in VaccinationRecord.objects.filter(
        farm__organization=organization, batch_id__in=ids
    ):
        add(vaccine.batch_id, vaccine.inventory_cost_snapshot, "medication")
    for treatment in ClinicalRecord.objects.filter(
        farm__organization=organization, batch_id__in=ids
    ):
        add(treatment.batch_id, treatment.treatment_cost, "medication")
    for batch_id in FeedingRecord.objects.filter(
        farm__organization=organization, batch_id__in=ids
    ).values_list("batch_id", flat=True):
        missing[str(batch_id)] += 1
    for medication in (
        LitterMedication.objects.filter(birth__female__farm__organization=organization)
        .filter(Q(batch_id__in=ids) | Q(batch__isnull=True, birth__batch_id__in=ids))
        .select_related("birth")
    ):
        # This record has no cost snapshot; a current stock price is not a historic cost.
        missing[str(medication.batch_id or medication.birth.batch_id)] += 1

    references = {f"PURCHASE-BATCH-{key}": key for key in ids}
    references.update({f"SALE-BATCH-{key}": key for key in ids})
    recorded_purchases = set()
    general_labor = []  # labor not linked to a lot, with its production scope
    for tx in (
        Transaction.objects.filter(organization=organization)
        .filter(
            Q(animal_batch_id__in=ids)
            | Q(reference__in=references)
            | Q(reference__startswith="LABOR-SWINE-")
            | Q(category__name__icontains="mão de obra")
            | Q(category__name__icontains="mao de obra")
        )
        .select_related("category")
    ):
        linked_batch = str(tx.animal_batch_id) if str(tx.animal_batch_id) in costs else None
        batch_id = linked_batch or references.get(tx.reference)
        if tx.reference == f"PURCHASE-BATCH-{batch_id}":
            recorded_purchases.add(batch_id)
        if tx.status == "cancelled":
            continue
        if tx.category.category_type == "revenue":
            # Same recognition rule as the general dashboard and as the costs
            # above: a sale counts once recorded (pending or paid), not only
            # after it is received. Cancelled entries were skipped already.
            if batch_id is not None:
                sales[batch_id] += tx.amount
            continue
        category = normalize(tx.category.name)
        is_labor = tx.reference.startswith("LABOR-SWINE-") or "mao de obra" in category
        closed = batches.get(str(tx.animal_batch_id))
        linked_after_close = (
            closed is not None and closed.status != "active"
            and closed.exit_date is not None and tx.due_date >= closed.exit_date
        )
        if is_labor and tx.planting_cycle_id is None and (tx.animal_batch_id is None or linked_after_close):
            # A closed lot keeps its historic costs frozen: labor dated after its
            # closing goes to the lots still available on that date.
            general_labor.append((
                tx.due_date, tx.amount, tx.farm_id,
                tx.species_id or (closed.species_id if closed else None),
                tx.reference.startswith("LABOR-SWINE-"),
            ))
            continue
        if batch_id is None:
            continue
        key = None
        if tx.reference == f"PURCHASE-BATCH-{batch_id}":
            key = (
                "purchase"
                if batches[batch_id].category not in BREEDING_CATEGORIES
                else None
            )
        elif is_labor:
            key = "labor"
        elif any(word in category for word in ("medicamento", "vacina", "tratamento")):
            key = "medication"
        elif any(word in category for word in ("semen", "reprodutor", "cobertura")):
            key = "reproduction"
        else:
            key = phase_at(batch_id, tx.due_date)
        add(batch_id, tx.amount, key)

    sale_quantities = {}
    entry_quantities, sold_quantities, death_quantities = {}, defaultdict(int), defaultdict(int)
    sale_events, death_events = defaultdict(list), defaultdict(list)
    first_entries, closed_balances = {}, {}
    for event in HistoricoEvento.objects.filter(
        farm__organization=organization,
        lote_id__in=batches,
        tipo_evento__in=["Fechamento de Venda do Lote", "Entrada de Lote", "Venda de Animais", "Mortalidade de Lote", "Encerramento de Saldo"],
    ).order_by("data_evento", "created_at"):
        lot_id, metadata = str(event.lote_id), event.metadata or {}
        if event.tipo_evento == "Fechamento de Venda do Lote":
            sale_quantities[lot_id] = metadata.get("quantity")
        elif event.tipo_evento == "Entrada de Lote":
            entry_quantities.setdefault(lot_id, metadata.get("quantidade"))
            first_entries.setdefault(lot_id, event.data_evento)
        elif event.tipo_evento == "Encerramento de Saldo":
            closed_balances[lot_id] = int(metadata.get("quantity") or 0)
        elif event.tipo_evento == "Venda de Animais":
            sold_quantities[lot_id] += int(metadata.get("quantity") or 0)
            sale_events[lot_id].append((event.data_evento, int(metadata.get("quantity") or 0)))
        else:
            death_quantities[lot_id] += int(metadata.get("quantidade_mortes") or 0)
            death_events[lot_id].append((event.data_evento, int(metadata.get("quantidade_mortes") or 0)))

    def quantity_on(batch_id, day):
        return labor_quantity_on(
            batches[batch_id], day, histories[batch_id], first_entries.get(batch_id),
            closed_balances.get(batch_id), sale_events[batch_id], death_events[batch_id],
        )

    # General labor (not linked to a lot) is shared on its own date among the
    # production lots that had animals then. Sold lots keep what they received
    # while active and receive nothing after closing; later entries go only to
    # the lots still available.
    production_ids = sorted(
        batch_id for batch_id, batch in batches.items()
        if batch.category not in BREEDING_CATEGORIES
        and not (
            batch.phase == AnimalBatch.Phase.GESTACAO_MATERNIDADE
            and batch.category == AnimalBatch.Category.LEITAO
            and batch.origin == AnimalBatch.Origin.BORN
        )
    )
    for day, labor_amount, farm_id, species_id, swine_only in general_labor:
        weights = [
            (batch_id, quantity_on(batch_id, day)) for batch_id in production_ids
            if (not farm_id or batches[batch_id].farm_id == farm_id)
            and (not species_id or batches[batch_id].species_id == species_id)
            and (not swine_only or batches[batch_id].species.code == "suinos")
        ]
        weights = [(batch_id, quantity) for batch_id, quantity in weights if quantity > 0]
        total_quantity = sum(quantity for _, quantity in weights)
        if not total_quantity:
            continue
        distributed = Decimal(0)
        for index, (batch_id, quantity) in enumerate(weights):
            amount = (labor_amount * quantity / total_quantity).quantize(Decimal("0.01"))
            if index == len(weights) - 1:
                amount = labor_amount - distributed
            distributed += amount
            if batch_id in costs:
                add(batch_id, amount, "labor")

    from .sire_costs import allocate_sire_costs

    sire_allocation = allocate_sire_costs(organization, batches, sources)
    for batch_id in ids:
        for entry in sire_allocation["entries"].get(batch_id, []):
            add(batch_id, Decimal(entry["amount"]), "reproduction")

    for row in rows:
        batch_id = row["id"]
        batch = batches[batch_id]
        if (
            batch.origin == "purchased"
            and batch.purchase_value is not None
            and batch_id not in recorded_purchases
        ):
            add(
                batch_id,
                batch.purchase_value,
                "purchase" if batch.category not in BREEDING_CATEGORIES else None,
            )
        # Trace identity only: source costs stay on their original row, preventing duplication.
        visited, frontier, names, origins = set(), [batch_id], set(), set()
        while frontier:
            ancestor_id = frontier.pop()
            if ancestor_id in visited:
                continue
            visited.add(ancestor_id)
            ancestor = batches[ancestor_id]
            names.update(mothers[ancestor_id])
            if (
                ancestor.mother_id
                and ancestor.mother.farm.organization_id == organization.pk
            ):
                names.add(ancestor.mother.identifier)
            if sources[ancestor_id]:
                frontier.extend(sources[ancestor_id])
            else:
                origins.add(ancestor.origin)
        reproductive = batch.category in BREEDING_CATEGORIES
        production = (
            "Reprodução"
            if reproductive
            else "Misto"
            if len(origins) > 1
            else {
                "born": "Ciclo completo",
                "purchased": "Compra p/ engorda",
                "donated": "Doação",
            }.get(next(iter(origins), ""), "—")
        )
        total, sale = totals[batch_id], sales[batch_id]
        # A closed lot keeps its last quantity on the model; nobody is left in it.
        current_quantity = batch.quantity if batch.status == "active" else 0
        # Original lot size: entry record, else first phase entry, else what is left + what left it.
        total_quantity = entry_quantities.get(batch_id)
        if total_quantity is None and histories[batch_id]:
            total_quantity = histories[batch_id][0].quantity
        if total_quantity is None:
            # The closing sale records every animal sold; partial sales may be part of it.
            sold = max(sold_quantities[batch_id], int(sale_quantities.get(batch_id) or 0))
            total_quantity = current_quantity + sold + death_quantities[batch_id]
        # Cost per animal = lot total cost / total lot size (entry quantity), not the animals left or sold.
        cost_quantity = int(total_quantity) or None
        row.update(
            reproduction_allocation_pending=batch_id
            in sire_allocation["pending_batches"],
            phase=batch.phase,
            production_type=production,
            matrices=sorted(names),
            missing_cost_count=missing[batch_id],
            current_quantity=current_quantity,
            total_quantity=int(total_quantity),
            cost_quantity=cost_quantity,
            **{
                key: str(value) if value is not None else None
                for key, value in costs[batch_id].items()
            },
            total_cost=str(total),
            sales=str(sale),
            profit=str(sale - total),
            margin=str((sale - total) / sale * 100) if sale else None,
            cost_per_animal=str(total / cost_quantity) if cost_quantity else None,
        )
    return rows
