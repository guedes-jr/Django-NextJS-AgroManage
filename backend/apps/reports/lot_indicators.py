"""Zootechnical indicators for the swine lot report.

Uses the same rules as the productivity tab (``productivity.py``): phase windows,
recorded weights only (no estimation), deaths from "Mortalidade de Lote" events
and feed from ``ConsumoRacao``. Feed conversion and cost per kg only count feed
recorded between the first and last weighing, as the productivity tab does.
"""
from decimal import Decimal

from apps.inventory.models import ConsumoRacao
from apps.livestock.models import AnimalBatch

from .productivity import batch_phase_windows

SWINE_CODES = ["suino", "suinos"]


def _current_window(windows, start, end):
    """Latest phase window that overlaps the selected period."""
    overlapping = [item for item in windows if item[1] and item[1] <= end and (item[2] is None or item[2] >= start)]
    return overlapping[-1] if overlapping else None


def swine_lot_indicators(organization, start, end, batch_ids=None):
    batches = AnimalBatch.objects.filter(farm__organization=organization, species__code__in=SWINE_CODES)
    if batch_ids is not None:
        batches = batches.filter(pk__in=batch_ids)
    batches = list(batches.prefetch_related("phase_histories", "weights", "historicos"))
    feeds = ConsumoRacao.objects.filter(organization=organization, lote_animal__in=batches,
        data_inicio__gte=start, data_inicio__lte=end)
    feed_by_batch = {}
    for feed in feeds:
        feed_by_batch.setdefault(feed.lote_animal_id, []).append(feed)

    initial_quantity = current_quantity = deaths = 0
    initial_weight_sum, initial_weight_quantity = 0., 0
    current_weight_sum, current_weight_quantity = 0., 0
    gain_kg = animal_days = feed_animal_days = 0.
    feed_kg, feed_cost = 0., Decimal("0")
    conversion_feed = conversion_gain = 0.
    conversion_cost = Decimal("0")
    lots = 0

    for batch in batches:
        window = _current_window(batch_phase_windows(batch, phases=None), start, end)
        if not window:
            continue
        lots += 1
        phase, entered, exited, entry_weight, entry_quantity, history = window
        events = sorted(batch.historicos.all(), key=lambda item: item.data_evento)
        sale = next((item.metadata for item in reversed(events) if item.tipo_evento == "Fechamento de Venda do Lote"), None)
        window_start, window_end = max(start, entered), min(exited or end, end)
        followed = any(item[1] == exited for item in batch_phase_windows(batch, phases=None) if item[1] and item[1] > entered)
        batch_deaths = sum(int(item.metadata.get("quantidade_mortes", 0)) for item in events
            if item.tipo_evento == "Mortalidade de Lote" and window_start <= item.data_evento <= window_end
            and not (followed and item.data_evento == exited))
        if sale and sale.get("phase") == phase and sale.get("exit_date") == str(exited):
            final = int(sale["quantity"])
        else:
            final = history.quantity if history and exited else batch.quantity
        base = int(entry_quantity) if entry_quantity is not None else final + batch_deaths
        initial_quantity += base
        current_quantity += final
        deaths += batch_deaths
        if entry_weight is not None:
            initial_weight_sum += float(entry_weight) * base
            initial_weight_quantity += base

        observed = [(item.weighing_date, float(item.weight_kg)) for item in batch.weights.all()
            if window_start <= item.weighing_date <= window_end and not (followed and item.weighing_date == exited)]
        if entry_weight is not None and entered >= start:
            observed.insert(0, (entered, float(entry_weight)))
        if exited and exited <= end and history and history.avg_weight_kg is not None:
            observed.append((exited, float(history.avg_weight_kg)))
        observed.sort(key=lambda item: item[0])
        if observed:
            current_weight_sum += observed[-1][1] * final
            current_weight_quantity += final

        window_feeds = [item for item in feed_by_batch.get(batch.pk, [])
            if window_start <= item.data_inicio <= window_end and (not item.fase_destino or item.fase_destino == phase)]
        feed_kg += sum(float(item.quantidade) for item in window_feeds)
        feed_cost += sum((item.custo_total or Decimal("0") for item in window_feeds), Decimal("0"))
        feed_animal_days += max((window_end - window_start).days, 0) * final

        if len(observed) >= 2:
            first, last = observed[0], observed[-1]
            days, gain = (last[0] - first[0]).days, last[1] - first[1]
            if days > 0 and gain > 0 and final > 0:
                gain_kg += gain * final
                animal_days += days * final
                matching = [item for item in window_feeds if first[0] <= item.data_inicio and item.data_fim <= last[0]]
                if matching:
                    conversion_feed += sum(float(item.quantidade) for item in matching)
                    conversion_cost += sum((item.custo_total or Decimal("0") for item in matching), Decimal("0"))
                    conversion_gain += gain * final

    return {
        "start": str(start), "end": str(end), "lots": lots,
        "initial_quantity": initial_quantity,
        "initial_weight_kg": initial_weight_sum / initial_weight_quantity if initial_weight_quantity else None,
        "current_quantity": current_quantity,
        "current_weight_kg": current_weight_sum / current_weight_quantity if current_weight_quantity else None,
        "daily_gain_kg": gain_kg / animal_days if animal_days else None,
        "total_gain_kg": gain_kg if animal_days else None,
        "feed_conversion": conversion_feed / conversion_gain if conversion_gain else None,
        "deaths": deaths,
        "mortality_pct": deaths / initial_quantity * 100 if initial_quantity else None,
        "feed_kg": feed_kg,
        "feed_per_animal_day_kg": feed_kg / feed_animal_days if feed_animal_days and feed_kg else None,
        "feed_cost": float(feed_cost),
        "cost_per_kg_gain": float(conversion_cost) / conversion_gain if conversion_gain else None,
    }
