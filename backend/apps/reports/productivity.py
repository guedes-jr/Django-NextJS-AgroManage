"""Recorded swine phase indicators, without estimating missing weights or causes."""
from collections import defaultdict
from datetime import date
from decimal import Decimal

from django.db.models import Q
from django.utils import timezone

from apps.farms.models import Farm
from apps.finance.models import Transaction
from apps.inventory.models import ConsumoRacao, ItemEstoque, MovimentacaoEstoque
from apps.livestock.models import Animal, AnimalBatch, Birth, HistoricoEvento, VaccinationRecord

PHASES = ("creche", "crescimento", "engorda")
CATEGORY_PHASE = {"Leitão": "creche", "Crescimento": "crescimento", "Terminação": "engorda"}


def swine_phase_indicators(organization, year, farm_id=None):
    start, end = date(year, 1, 1), min(date(year, 12, 31), timezone.localdate())
    farms = Farm.objects.filter(organization=organization)
    batches = AnimalBatch.objects.filter(farm__organization=organization, species__code__in=["suino", "suinos"])
    if farm_id:
        batches = batches.filter(farm_id=farm_id)
    batches = list(batches.prefetch_related("phase_histories", "weights", "historicos"))
    feeds = ConsumoRacao.objects.filter(organization=organization, farm__organization=organization,
        data_inicio__gte=start, data_inicio__lte=end)
    if farm_id:
        feeds = feeds.filter(farm_id=farm_id)
    feeds = list(feeds.filter(Q(lote_animal__species__code__in=["suino", "suinos"])
        | Q(animais__species__code__in=["suino", "suinos"])
        | Q(lote_animal__isnull=True, item_estoque__especie_animal__in=["suino", "suinos"])).distinct())
    feed_by_batch = defaultdict(list)
    for feed in feeds:
        feed_by_batch[feed.lote_animal_id].append(feed)
    stats = {phase: {"quantity": 0, "weight_sum": 0., "weight_quantity": 0,
        "deaths": 0, "mortality_base": 0, "feed_kg": None, "gain_kg": 0., "animal_days": 0,
        "conversion_feed": 0., "conversion_gain": 0., "sold": 0,
        "sale_days": 0, "sale_quantity": 0} for phase in PHASES}
    phase_windows = {}
    for batch in batches:
        histories = sorted(batch.phase_histories.all(), key=lambda item: item.entry_date)
        events = sorted(batch.historicos.all(), key=lambda item: item.data_evento)
        entry = next((item for item in events if item.tipo_evento == "Entrada de Lote"), None)
        sale = next((item.metadata for item in reversed(events) if item.tipo_evento == "Fechamento de Venda do Lote"), None)
        weights = sorted(batch.weights.all(), key=lambda item: item.weighing_date)
        windows = []
        for index, history in enumerate(histories):
            previous = histories[index-1] if index else None
            metadata = entry.metadata if entry else {}
            initial_weight = history.avg_weight_kg if history.exit_date is None else previous.avg_weight_kg if previous else metadata.get("peso_medio_entrada")
            initial_quantity = history.quantity if history.exit_date is None else previous.quantity if previous else metadata.get("quantidade")
            if sale and sale.get("phase") == history.phase and sale.get("exit_date") == str(history.exit_date):
                initial_weight, initial_quantity = sale.get("entry_weight_kg"), sale.get("entry_quantity")
            windows.append((history.phase, history.entry_date, history.exit_date, initial_weight, initial_quantity, history))
        if not windows and (batch.phase or CATEGORY_PHASE.get(batch.category)) in PHASES:
            metadata = entry.metadata if entry else {}
            windows.append((batch.phase or CATEGORY_PHASE[batch.category], batch.entry_date, batch.exit_date,
                metadata.get("peso_medio_entrada"), metadata.get("quantidade"), None))
        phase_windows[batch.pk] = windows
        for phase, entered, exited, initial_weight, initial_quantity, history in windows:
            if phase not in stats or not entered or entered > end or (exited and exited < start):
                continue
            stat = stats[phase]
            phase_end = min(exited or end, end)
            # A transfer day belongs to the newly opened phase; final sale days
            # remain in the sold phase when no following phase starts that day.
            followed = any(item[1] == exited for item in windows if item[1] and item[1] > entered)
            deaths = sum(int(item.metadata.get("quantidade_mortes", 0)) for item in events
                if item.tipo_evento == "Mortalidade de Lote" and max(start, entered) <= item.data_evento <= phase_end
                and not (followed and item.data_evento == exited))
            final_quantity = int(sale["quantity"]) if sale and sale.get("phase") == phase and sale.get("exit_date") == str(exited) else history.quantity if history and exited else batch.quantity
            base = int(initial_quantity) if initial_quantity is not None else final_quantity + deaths
            stat["quantity"] += base
            stat["deaths"] += deaths
            stat["mortality_base"] += base
            observed = [(item.weighing_date, float(item.weight_kg)) for item in weights
                if max(start, entered) <= item.weighing_date <= phase_end and not (followed and item.weighing_date == exited)]
            if initial_weight is not None and entered >= start:
                observed.insert(0, (entered, float(initial_weight)))
            if exited and exited <= end and history and history.avg_weight_kg is not None:
                observed.append((exited, float(history.avg_weight_kg)))
            if observed:
                observed.sort(key=lambda item: item[0])
                stat["weight_sum"] += observed[-1][1] * final_quantity
                stat["weight_quantity"] += final_quantity
            if len(observed) >= 2:
                first, last = observed[0], observed[-1]
                days, gain = (last[0]-first[0]).days, last[1]-first[1]
                if days > 0 and gain > 0 and final_quantity > 0:
                    stat["gain_kg"] += gain * final_quantity
                    stat["animal_days"] += days * final_quantity
                    matching_feed = [item for item in feed_by_batch[batch.pk]
                        if first[0] <= item.data_inicio and item.data_fim <= last[0]
                        and (not item.fase_destino or item.fase_destino == phase)]
                    if matching_feed:
                        stat["conversion_feed"] += sum(float(item.quantidade) for item in matching_feed)
                        stat["conversion_gain"] += gain * final_quantity
            if batch.status == "sold" and batch.exit_date and start <= batch.exit_date <= end and phase == (batch.phase or CATEGORY_PHASE.get(batch.category)):
                stat["sold"] += final_quantity
                stat["sale_days"] += (batch.exit_date - entered).days * final_quantity
                stat["sale_quantity"] += final_quantity
    for feed in feeds:
        phase = feed.fase_destino
        if phase not in stats:
            windows = phase_windows.get(feed.lote_animal_id, [])
            matches = [item for item in windows if item[1] and item[1] <= feed.data_inicio and
                (item[2] is None or feed.data_inicio < item[2] or
                 (feed.data_inicio == item[2] and not any(other[1] == item[2] for other in windows)))]
            phase = matches[-1][0] if matches else None
        if phase in stats:
            stats[phase]["feed_kg"] = (stats[phase]["feed_kg"] or 0) + float(feed.quantidade)
    result = {}
    for phase, stat in stats.items():
        result[phase] = {
            "quantity": stat["quantity"], "weight_kg": stat["weight_sum"] / stat["weight_quantity"] if stat["weight_quantity"] else None,
            "feed_kg": stat["feed_kg"], "mortality_pct": stat["deaths"] / stat["mortality_base"] * 100 if stat["mortality_base"] else None,
            "daily_gain_kg": stat["gain_kg"] / stat["animal_days"] if stat["animal_days"] else None,
            "feed_conversion": stat["conversion_feed"] / stat["conversion_gain"] if stat["conversion_gain"] else None,
            "sold": stat["sold"], "days_to_sale": stat["sale_days"] / stat["sale_quantity"] if stat["sale_quantity"] else None,
        }
    conversion_gain = sum(item["conversion_gain"] for item in stats.values())
    # Financial results use the same selected year and farm, not another tab's month.
    transactions = Transaction.objects.filter(organization=organization, status="paid",
        payment_date__gte=start, payment_date__lte=end, planting_cycle__isnull=True).filter(
        Q(species__code__in=["suino", "suinos"]) | Q(animal_batch__species__code__in=["suino", "suinos"]) |
        Q(category__name__icontains="suin") | Q(category__name__icontains="suín"))
    if farm_id:
        transactions = transactions.filter(Q(farm_id=farm_id) | Q(animal_batch__farm_id=farm_id))
    amounts = list(transactions.select_related("category"))
    cost = sum((item.amount for item in amounts if item.category.category_type == "expense" and not item.reference.startswith("LOTE-")), Decimal("0"))
    revenue = sum((item.amount for item in amounts if item.category.category_type == "revenue"), Decimal("0"))
    cost += sum((item.custo_total for item in feeds), Decimal("0"))
    vaccines = VaccinationRecord.objects.filter(farm__organization=organization, species__code__in=["suino", "suinos"], application_date__range=(start, end))
    if farm_id:
        vaccines = vaccines.filter(farm_id=farm_id)
    cost += sum((item.inventory_cost_snapshot or Decimal("0") for item in vaccines), Decimal("0"))
    semen_ids = [item.pk for item in ItemEstoque.objects.filter(organization=organization,
        especie_animal__in=["suino", "suinos", "multiplo"])
        if item.categoria == "semen" or "semen" in (item.categorias or [])]
    semen = MovimentacaoEstoque.objects.filter(item_id__in=semen_ids, tipo="consumo",
        data_movimentacao__date__range=(start, end)).select_related("lote")
    if farm_id:
        semen = semen.filter(farm_id=farm_id)
    cost += sum((item.quantidade * item.lote.custo_unitario for item in semen if item.lote), Decimal("0"))
    missing_purchase_batches = [batch for batch in batches if batch.origin == "purchased"
        and batch.purchase_value and batch.entry_date and start <= batch.entry_date <= end]
    references = {f"PURCHASE-BATCH-{batch.pk}" for batch in missing_purchase_batches}
    recorded = set(Transaction.objects.filter(organization=organization, reference__in=references).values_list("reference", flat=True))
    cost += sum((batch.purchase_value for batch in missing_purchase_batches if f"PURCHASE-BATCH-{batch.pk}" not in recorded), Decimal("0"))
    births = Birth.objects.filter(female__farm__organization=organization,
        female__species__code__in=["suino", "suinos"], birth_date__range=(start, end))
    maternal_deaths = HistoricoEvento.objects.filter(farm__organization=organization,
        matriz__species__code__in=["suino", "suinos"], tipo_evento="Mortalidade Maternidade", data_evento__range=(start, end))
    if farm_id:
        births = births.filter(female__farm_id=farm_id)
        maternal_deaths = maternal_deaths.filter(farm_id=farm_id)
    birth_records = list(births)
    total_live = sum(item.live_born for item in birth_records)
    registered_deaths = list(maternal_deaths)
    crushing_deaths = sum(int(item.metadata.get("quantidade", 0)) for item in registered_deaths
        if str(item.metadata.get("causa", "")).upper() == "ESMAGAMENTO")
    classified = sum(int(item.metadata.get("quantidade", 0)) for item in registered_deaths
        if item.metadata.get("causa") not in (None, "", "DESCONHECIDA", "Não informada"))
    total_deaths = sum(item.mortality for item in birth_records)
    crushing_pct = crushing_deaths / total_live * 100 if total_live and classified == total_deaths else None
    breeding = Animal.objects.filter(farm__organization=organization, species__code__in=["suino", "suinos"], status="active")
    if farm_id:
        breeding = breeding.filter(farm_id=farm_id)
    distribution = {phase: sum(batch.quantity for batch in batches if batch.status == "active" and (batch.phase or CATEGORY_PHASE.get(batch.category)) == phase) for phase in PHASES}
    distribution["maternity"] = breeding.filter(reproductive_status="lactante", gender="F").count()
    distribution["reproduction"] = breeding.exclude(reproductive_status="lactante", gender="F").count()
    females = Animal.objects.filter(farm__organization=organization, species__code__in=["suino", "suinos"], status="active", gender="F", category="Matriz")
    if farm_id:
        females = females.filter(farm_id=farm_id)
    matrices = females.count()
    return {"crushing_mortality_pct": crushing_pct, "distribution": distribution, "year": year, "farm": farm_id, "phases": result,
        "feed_conversion": sum(item["conversion_feed"] for item in stats.values()) / conversion_gain if conversion_gain else None,
        "profit_per_matrix": float((revenue-cost)/matrices) if matrices else None,
        "farms": [{"id": str(item.pk), "name": item.name} for item in farms],
        "missing_reasons": {"daily_gain_kg": "Registre peso de entrada e uma pesagem posterior na mesma fase.",
            "feed_conversion": "Registre pesagens com ganho de peso e consumo de ração entre essas pesagens.",
            "feed_kg": "Nenhum consumo de ração foi registrado nesta fase no período.",
            "weight_kg": "Nenhuma pesagem foi registrada nesta fase no período.",
            "days_to_sale": "Nenhuma venda com datas de entrada e saída foi registrada nesta fase."}}
