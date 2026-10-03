"""Monthly sire upkeep allocated to matings and traced through recorded litter transfers."""

from collections import defaultdict
from decimal import ROUND_DOWN, Decimal

from django.db.models import Prefetch, Q

from apps.finance.models import Transaction
from apps.inventory.models import ConsumoRacao
from apps.livestock.models import (
    Animal,
    AnimalBatch,
    Birth,
    ClinicalRecord,
    FeedingRecord,
    HealthRecord,
    HistoricoEvento,
    Mating,
    VaccinationRecord,
)

CENT = Decimal("0.01")


def split_money(amount, weights):
    """Largest-remainder split: every recorded cent is allocated exactly once."""
    weights = {str(key): Decimal(value) for key, value in weights.items() if value > 0}
    total = sum(weights.values(), Decimal(0))
    if not total:
        return {}
    amount = Decimal(amount).quantize(CENT)
    exact = {key: amount * weight / total for key, weight in weights.items()}
    rounded = {
        key: value.quantize(CENT, rounding=ROUND_DOWN) for key, value in exact.items()
    }
    cents = int((amount - sum(rounded.values(), Decimal(0))) / CENT)
    ordered = sorted(exact, key=lambda key: (-(exact[key] - rounded[key]), key))
    for key in ordered[:cents]:
        rounded[key] += CENT
    return rounded


def allocate_sire_costs(organization, batches=None, sources=None):
    if batches is None:
        batches = {
            str(batch.pk): batch
            for batch in AnimalBatch.objects.filter(farm__organization=organization)
        }
    if sources is None:
        sources = defaultdict(list)
        for target, source in AnimalBatch.source_batches.through.objects.filter(
            from_animalbatch_id__in=batches
        ).values_list("from_animalbatch_id", "to_animalbatch_id"):
            if str(source) in batches:
                sources[str(target)].append(str(source))
    matings = list(
        Mating.objects.filter(
            female__farm__organization=organization,
            sire__farm__organization=organization,
        )
        .select_related("sire", "female")
        .order_by("mating_date", "id")
    )
    if not matings:
        return {"entries": {}, "pending_batches": set()}
    sire_ids = {str(mating.sire_id) for mating in matings}
    # Include other registered animals in a shared sire batch in the denominator.
    sire_batch_ids = set(
        Animal.objects.filter(
            pk__in=sire_ids,
            farm__organization=organization,
            batch__farm__organization=organization,
        )
        .exclude(batch__isnull=True)
        .values_list("batch_id", flat=True)
    )
    batch_animals = defaultdict(list)
    for animal_id, batch_id in Animal.objects.filter(
        farm__organization=organization, batch_id__in=sire_batch_ids
    ).values_list("id", "batch_id"):
        batch_animals[str(batch_id)].append(str(animal_id))
    costs = defaultdict(lambda: Decimal(0))
    missing_periods = set()
    known_periods = set()

    def record(amount, event_date, recipients):
        recipients = sorted({str(key) for key in recipients})
        if not recipients:
            return
        shares = (
            split_money(amount, {key: 1 for key in recipients})
            if amount is not None
            else {}
        )
        for sire_id in sire_ids.intersection(recipients):
            period = (sire_id, event_date.year, event_date.month)
            if amount is None:
                missing_periods.add(period)
            else:
                costs[period] += shares[sire_id]
                known_periods.add(period)

    def targets(animal_id, batch_id):
        return [str(animal_id)] if animal_id else batch_animals.get(str(batch_id), [])

    for feed in (
        ConsumoRacao.objects.filter(organization=organization)
        .filter(Q(animais__id__in=sire_ids) | Q(lote_animal_id__in=sire_batch_ids))
        .distinct()
        .prefetch_related(
            Prefetch(
                "animais",
                queryset=Animal.objects.filter(farm__organization=organization),
            )
        )
    ):
        # All selected animals share the recorded feed cost, including females.
        selected = [str(animal.pk) for animal in feed.animais.all()]
        record(
            feed.custo_total,
            feed.data_inicio,
            selected or batch_animals.get(str(feed.lote_animal_id), []),
        )
    for feed in FeedingRecord.objects.filter(farm__organization=organization).filter(
        Q(animal_id__in=sire_ids) | Q(batch_id__in=sire_batch_ids)
    ):
        record(None, feed.date, targets(feed.animal_id, feed.batch_id))
    for vaccine in VaccinationRecord.objects.filter(
        farm__organization=organization
    ).filter(Q(animal_id__in=sire_ids) | Q(batch_id__in=sire_batch_ids)):
        record(
            vaccine.inventory_cost_snapshot,
            vaccine.application_date,
            targets(vaccine.animal_id, vaccine.batch_id),
        )
    for clinical in ClinicalRecord.objects.filter(
        farm__organization=organization, animal_id__in=sire_ids
    ):
        record(clinical.treatment_cost, clinical.record_date, [clinical.animal_id])
    for health in HealthRecord.objects.filter(
        farm__organization=organization, animal_id__in=sire_ids
    ):
        record(health.cost, health.application_date, [health.animal_id])
    purchase_refs = {f"PURCHASE-BATCH-{key}" for key in sire_batch_ids}
    for expense in (
        Transaction.objects.filter(
            organization=organization, category__category_type="expense"
        )
        .filter(Q(animal_batch_id__in=sire_batch_ids) | Q(reference__in=purchase_refs))
        .exclude(status="cancelled")
        .select_related("category")
    ):
        # Acquisition remains a purchase expense; this rule allocates operating upkeep.
        if (
            expense.reference in purchase_refs
            or expense.category.name == "Compra de Animais"
        ):
            continue
        record(
            expense.amount,
            expense.due_date,
            batch_animals.get(str(expense.animal_batch_id), []),
        )
    groups = defaultdict(list)
    for mating in matings:
        groups[
            (str(mating.sire_id), mating.mating_date.year, mating.mating_date.month)
        ].append(mating)
    roots = {}
    for birth in Birth.objects.filter(
        female__farm__organization=organization,
        batch_id__in=batches,
        pregnancy__mating_id__in=[m.pk for m in matings],
    ).select_related("pregnancy"):
        roots[str(birth.pregnancy.mating_id)] = (str(birth.batch_id), birth.birth_date)
    allocations = {}
    pending_roots = set()
    for period, covers in groups.items():
        shares = (
            split_money(costs[period], {str(m.pk): 1 for m in covers})
            if period in known_periods
            else {}
        )
        for mating in covers:
            key = str(mating.pk)
            if key not in roots:
                continue  # Pending/failed matings retain their share, never shift it to other litters.
            root_id, birth_date = roots[key]
            if period in missing_periods:
                pending_roots.add(root_id)
            if key not in shares:
                continue
            allocations[key] = {
                "balances": {root_id: shares[key]},
                "root": root_id,
                "birth_date": birth_date,
                "sire": mating.sire.identifier,
                "female": mating.female.identifier,
                "date": mating.mating_date.isoformat(),
                "period": f"{period[1]:04}-{period[2]:02}",
                "monthly_cost": str(costs[period]),
                "mating_count": len(covers),
                "mating_cost": str(shares[key]),
            }
    recorded_edges = set()
    events = HistoricoEvento.objects.filter(
        farm__organization=organization,
        lote_id__in=batches,
        tipo_evento__in=["Transferência de Leitões", "Junção de Lotes"],
    ).order_by("data_evento", "created_at", "id")
    for event in events:
        target = str(event.lote_id)
        metadata = event.metadata or {}
        source_ids = metadata.get("source_batch_ids", [])
        for source in source_ids:
            source = str(source)
            edge = (source, target)
            if source not in sources.get(target, []) or edge in recorded_edges:
                continue
            full = event.tipo_evento == "Junção de Lotes"
            transferred = (metadata.get("source_quantities") or {}).get(source)
            before = (metadata.get("source_available_quantities") or {}).get(source)
            if not full and (
                not isinstance(transferred, int)
                or not isinstance(before, int)
                or not 0 < transferred <= before
            ):
                continue
            recorded_edges.add(edge)
            if full and transferred == 0 and before == 0:
                continue  # No animals moved; mortality costs remain on the source lot.
            for allocation in allocations.values():
                balances = allocation["balances"]
                if source not in balances:
                    continue
                if event.data_evento < allocation["birth_date"]:
                    pending_roots.add(target)
                    continue
                amount = balances[source]
                if full:
                    moved = amount
                else:
                    moved = split_money(
                        amount, {target: transferred, source: before - transferred}
                    )[target]
                balances[source] -= moved
                balances[target] = balances.get(target, Decimal(0)) + moved
    # Unknown legacy edges are flagged only if a known sire allocation can reach them.
    children = defaultdict(list)
    for target, ancestors in sources.items():
        for source in ancestors:
            children[source].append(target)
    reachable = set()
    frontier = [a["root"] for a in allocations.values()] + list(pending_roots)
    while frontier:
        batch_id = frontier.pop()
        if batch_id in reachable:
            continue
        reachable.add(batch_id)
        frontier.extend(children[batch_id])
    uncertain_sources = set()
    for target, ancestors in sources.items():
        for source in ancestors:
            if source in reachable and (source, target) not in recorded_edges:
                uncertain_sources.add(source)
                pending_roots.add(source)
    # A missing split also makes later remaining-balance transfers uncertain.
    uncertain_allocations = set()
    for mating_id, allocation in allocations.items():
        descendants, frontier = set(), [allocation["root"]]
        while frontier:
            batch_id = frontier.pop()
            if batch_id in descendants:
                continue
            descendants.add(batch_id)
            frontier.extend(children[batch_id])
        if descendants.intersection(uncertain_sources):
            uncertain_allocations.add(mating_id)
            pending_roots.add(allocation["root"])
    pending = set()
    frontier = list(pending_roots)
    while frontier:
        batch_id = frontier.pop()
        if batch_id in pending:
            continue
        pending.add(batch_id)
        frontier.extend(children[batch_id])
    entries = defaultdict(list)
    for mating_id, allocation in allocations.items():
        if mating_id in uncertain_allocations:
            continue
        for batch_id, amount in allocation["balances"].items():
            entries[batch_id].append(
                {
                    "id": f"sire-allocation-{mating_id}-{batch_id}",
                    "category": "Reprodutor — rateio mensal",
                    "description": f"{allocation['sire']} • {allocation['period']} • custo mensal R$ {allocation['monthly_cost'].replace('.', ',')} / {allocation['mating_count']} cobertura(s) = R$ {allocation['mating_cost'].replace('.', ',')} por cobertura • matriz {allocation['female']}",
                    "date": allocation["date"],
                    "amount": str(amount),
                    "quantity": None,
                    "unit": None,
                    "sire": allocation["sire"],
                    "monthly_cost": allocation["monthly_cost"],
                    "mating_count": allocation["mating_count"],
                    "mating_cost": allocation["mating_cost"],
                }
            )
    return {"entries": dict(entries), "pending_batches": pending}
