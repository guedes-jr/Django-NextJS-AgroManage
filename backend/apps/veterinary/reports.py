"""Read models for the Relatório and Cobrança tabs (prototype vRx*, vCo, vRespPn)."""
from collections import OrderedDict
from datetime import date
from decimal import Decimal

from . import selectors
from .models import VeterinaryProcedure
from .serializers import procedure_data

Kind = VeterinaryProcedure.Kind


def _norm(text):
    from .services import normalize

    return normalize(text)


def report(organization, filters, today):
    """Rows for "Cada procedimento" or "Resumo por animal", already filtered, plus KPIs."""
    clients, states = selectors.load_state(organization)
    all_procedures = [p for s in states.values() for p in s.procedures]
    by_animal = selectors.procedures_by_animal(all_procedures)
    latest = {aid: s.last.id for aid, s in states.items() if s.last}

    client_id = filters.get("client") or ""
    day = filters.get("date")
    proc = filters.get("procedure") or ""
    result = filters.get("result") or ""
    bull = _norm(filters.get("bull"))
    category = filters.get("category") or ""
    responsible = _norm(filters.get("responsible"))
    query = _norm(filters.get("q"))

    rows = []
    for p in all_procedures:
        state = states[p.animal_id]
        client = clients.get(p.client_id)
        if client is None:
            continue
        if client_id and str(p.client_id) != client_id:
            continue
        if day and p.date != day:
            continue
        kind = selectors.report_kind(p)
        conduct = selectors.report_conduct(p)
        if proc and kind != proc and conduct != proc:
            continue
        outcome = selectors.report_result(p, by_animal[p.animal_id])
        if result and outcome != result:
            continue
        sire = selectors.report_bull(p, by_animal[p.animal_id])
        if bull and _norm(sire) != bull:
            continue
        cat = p.category or state.animal.category
        if category and cat != category:
            continue
        if responsible and _norm(p.responsible) != responsible:
            continue
        animal = state.animal
        if query and query not in _norm(f"{animal.identifier} {animal.name} {client.name}"):
            continue
        is_latest = latest.get(p.animal_id) == p.id
        rows.append({
            **procedure_data(p, today), "client": str(client.id), "client_name": client.name, "farm_name": client.farm_name,
            "animal": str(animal.id), "identifier": animal.identifier, "animal_name": animal.name, "category": cat,
            "report_kind": kind, "report_result": outcome, "origin": selectors.pregnancy_origin(p, by_animal[p.animal_id]),
            "report_bull": sire, "next": selectors.next_procedure(state) if is_latest else None,
        })
    rows.sort(key=lambda r: (r["date"], r["id"]), reverse=True)
    chosen = {r["id"] for r in rows}
    selected = [p for p in all_procedures if str(p.id) in chosen]
    rate = selectors.pregnancy_rate(selected, by_animal)
    inseminations = [p for p in selected if p.kind in selectors.INSEMINATIONS]
    diagnoses = [p for p in selected if p.kind in selectors.DIAGNOSES]
    pregnant = sum(1 for p in diagnoses if p.result == VeterinaryProcedure.Result.PREGNANT)
    stats = {
        "procedures": len(rows), "animals": len({r["animal"] for r in rows}), "inseminations": len(inseminations),
        "pregnant": pregnant, "open": len(diagnoses) - pregnant, "rate": rate["rate"],
        "rate_total": rate["total"], "rate_pregnant": rate["pregnant"],
    }
    return {
        "rows": rows, "animals": _animal_summary(rows, states, today) if filters.get("mode") == "animal" else [],
        "stats": stats, "bulls": _bulls(all_procedures, by_animal), "responsibles": _responsibles(all_procedures),
        "recent_dates": _recent_dates(all_procedures, client_id),
    }


def _animal_summary(rows, states, today):
    """One line per animal (prototype vRxA), oldest procedure first."""
    summary = OrderedDict()
    for row in reversed(rows):
        entry = summary.get(row["animal"])
        if entry is None:
            entry = summary[row["animal"]] = {
                "animal": row["animal"], "identifier": row["identifier"], "animal_name": row["animal_name"],
                "client_name": row["client_name"], "category": row["category"], "count": 0, "inseminations": [],
                "bulls": [], "result": "", "calving_date": None, "last": None,
            }
        entry["count"] += 1
        entry["category"] = row["category"]
        entry["last"] = {"report_kind": row["report_kind"], "date": row["date"]}
        if row["kind"] in selectors.INSEMINATIONS:
            entry["inseminations"].append(row["date"])
        if row["report_bull"] and row["report_bull"] not in entry["bulls"]:
            entry["bulls"].append(row["report_bull"])
        if row["kind"] in selectors.DIAGNOSES:
            entry["result"] = "pregnant" if row["result"] == "pregnant" else "open"
            entry["calving_date"] = row["calving_date"] if row["result"] == "pregnant" else None
        elif row["kind"] in selectors.INSEMINATIONS and entry["result"] != "pregnant":
            entry["result"] = "awaiting"
    by_id = {str(aid): s for aid, s in states.items()}
    output = []
    for entry in summary.values():
        state = by_id.get(entry["animal"])
        entry["next"] = selectors.next_procedure(state) if state else None
        output.append(entry)
    output.sort(key=lambda e: _natural(e["identifier"]))
    return output


def _natural(text):
    import re

    return [int(part) if part.isdigit() else part.lower() for part in re.split(r"(\d+)", str(text))]


def _bulls(procedures, by_animal):
    counts = OrderedDict()
    for p in procedures:
        name = selectors.report_bull(p, by_animal[p.animal_id])
        if name:
            key = _norm(name)
            counts.setdefault(key, {"name": name, "count": 0})["count"] += 1
    return sorted(counts.values(), key=lambda b: b["name"])


def _responsibles(procedures):
    seen = OrderedDict()
    for p in procedures:
        name = (p.responsible or "").strip()
        if name:
            seen.setdefault(_norm(name), name)
    return sorted(seen.values())


def _recent_dates(procedures, client_id):
    counts = {}
    for p in procedures:
        if client_id and str(p.client_id) != client_id:
            continue
        counts[p.date] = counts.get(p.date, 0) + 1
    return [{"date": d, "count": counts[d]} for d in sorted(counts, reverse=True)[:6]]


# ---- Cobrança ----------------------------------------------------------------------------

def month_bounds(month):
    import calendar

    return date(month.year, month.month, 1), date(month.year, month.month, calendar.monthrange(month.year, month.month)[1])


def billing(organization, month, client_id=None):
    start, end = month_bounds(month)
    procedures = list(
        VeterinaryProcedure.objects.filter(organization=organization, date__gte=start, date__lte=end)
        .select_related("client", "animal").order_by("date", "created_at")
    )
    zero = Decimal("0")
    total = sum((p.value for p in procedures), zero)
    received = sum((p.value for p in procedures if p.paid), zero)
    clients = OrderedDict()
    from .models import VeterinaryClient

    for client in VeterinaryClient.objects.filter(organization=organization):
        clients[str(client.id)] = {"id": str(client.id), "name": client.name, "farm_name": client.farm_name, "count": 0, "total": zero, "receivable": zero}
    responsibles = OrderedDict()
    for p in procedures:
        row = clients.get(str(p.client_id))
        if row:
            row["count"] += 1
            row["total"] += p.value
            if not p.paid:
                row["receivable"] += p.value
        key = p.responsible or ""
        bucket = responsibles.setdefault(key, {"name": key, "count": 0, "value": zero})
        bucket["count"] += 1
        bucket["value"] += p.value
    detail = None
    if client_id and client_id in clients:
        detail = [
            {**procedure_data(p), "identifier": p.animal.identifier}
            for p in procedures if str(p.client_id) == client_id
        ]
    return {
        "month": start.isoformat()[:7], "count": len(procedures), "total": total, "received": received,
        "receivable": total - received, "clients": list(clients.values()), "detail": detail,
        "responsibles": list(responsibles.values()),
    }


def receivable_by_client(organization):
    """Unpaid value per client over all time (Clientes and Resumo)."""
    from django.db.models import Count, Q, Sum

    rows = VeterinaryProcedure.objects.filter(organization=organization).values("client").annotate(
        receivable=Sum("value", filter=Q(paid=False)), count=Count("id"),
    )
    return {str(r["client"]): {"receivable": r["receivable"] or Decimal("0"), "count": r["count"]} for r in rows}
