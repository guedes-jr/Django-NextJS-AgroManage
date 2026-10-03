"""Bulk direct batch costs plus the documented monthly sire allocation."""

import unicodedata
from collections import defaultdict
from decimal import Decimal

from django.db.models import Q

from apps.finance.models import Transaction
from apps.inventory.models import ConsumoRacao
from apps.livestock.models import (
    AnimalBatch,
    BatchPhaseHistory,
    Birth,
    ClinicalRecord,
    FeedingRecord,
    HistoricoEvento,
    LitterMedication,
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


def enrich_lot_costs(organization, rows):
    if not rows:
        return rows
    ids = [row["id"] for row in rows]
    batches = {
        str(batch.pk): batch
        for batch in AnimalBatch.objects.filter(
            farm__organization=organization
        ).select_related("mother__farm")
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
        batch_id__in=ids, batch__farm__organization=organization
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
    for tx in (
        Transaction.objects.filter(organization=organization)
        .filter(Q(animal_batch_id__in=ids) | Q(reference__in=references))
        .select_related("category")
    ):
        batch_id = (
            str(tx.animal_batch_id)
            if str(tx.animal_batch_id) in costs
            else references.get(tx.reference)
        )
        if tx.reference == f"PURCHASE-BATCH-{batch_id}":
            recorded_purchases.add(batch_id)
        if tx.status == "cancelled":
            continue
        if tx.category.category_type == "revenue":
            if tx.status == "paid":
                sales[batch_id] += tx.amount
            continue
        category = normalize(tx.category.name)
        key = None
        if tx.reference == f"PURCHASE-BATCH-{batch_id}":
            key = (
                "purchase"
                if batches[batch_id].category not in BREEDING_CATEGORIES
                else None
            )
        elif tx.reference.startswith("LABOR-SWINE-") or "mao de obra" in category:
            key = "labor"
        elif any(word in category for word in ("medicamento", "vacina", "tratamento")):
            key = "medication"
        elif any(word in category for word in ("semen", "reprodutor", "cobertura")):
            key = "reproduction"
        else:
            key = phase_at(batch_id, tx.due_date)
        add(batch_id, tx.amount, key)

    from .sire_costs import allocate_sire_costs

    sire_allocation = allocate_sire_costs(organization, batches, sources)
    for batch_id in ids:
        for entry in sire_allocation["entries"].get(batch_id, []):
            add(batch_id, Decimal(entry["amount"]), "reproduction")

    sale_quantities = {}
    for event in HistoricoEvento.objects.filter(
        farm__organization=organization,
        lote_id__in=ids,
        tipo_evento="Fechamento de Venda do Lote",
    ).order_by("created_at"):
        sale_quantities[str(event.lote_id)] = event.metadata.get("quantity")
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
        cost_quantity = (
            sale_quantities.get(batch_id) if batch.status == "sold" else batch.quantity
        )
        row.update(
            reproduction_allocation_pending=batch_id
            in sire_allocation["pending_batches"],
            phase=batch.phase,
            production_type=production,
            matrices=sorted(names),
            missing_cost_count=missing[batch_id],
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
