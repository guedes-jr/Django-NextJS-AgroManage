"""
Derived state of the Área do veterinário, ported rule by rule from the approved prototype.

Everything works on per-animal lists already loaded in memory (see `load_state`), so pages
compute status, next procedure and report columns for many animals without N+1 queries.
Texts are not built here: the API returns codes and dates; the web composes translated labels.
"""
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, timedelta

from .models import VeterinaryAlert, VeterinaryAnimal, VeterinaryClient, VeterinaryProcedure

Kind = VeterinaryProcedure.Kind
Result = VeterinaryProcedure.Result
Conduct = VeterinaryProcedure.Conduct
AlertKind = VeterinaryAlert.Kind

INSEMINATIONS = {Kind.INSEMINATION, Kind.IATF_INSEMINATION}
DIAGNOSES = {Kind.ULTRASOUND, Kind.PALPATION}
GESTATION_DAYS = 283


def order_key(procedure):
    return (procedure.date, procedure.created_at)


@dataclass
class AnimalState:
    animal: VeterinaryAnimal
    procedures: list = field(default_factory=list)  # newest first
    open_alerts: list = field(default_factory=list)  # oldest date first

    @property
    def last(self):
        return self.procedures[0] if self.procedures else None


def load_state(organization, client=None):
    """Load clients, animals, procedures and open alerts of one organization in four queries."""
    clients = {c.id: c for c in VeterinaryClient.objects.filter(organization=organization)}
    animals = VeterinaryAnimal.objects.filter(organization=organization)
    procedures = VeterinaryProcedure.objects.filter(organization=organization)
    alerts = VeterinaryAlert.objects.filter(organization=organization, done=False)
    if client is not None:
        animals, procedures, alerts = animals.filter(client=client), procedures.filter(client=client), alerts.filter(client=client)
    states = {a.id: AnimalState(a) for a in animals}
    for p in procedures:
        if p.animal_id in states:
            states[p.animal_id].procedures.append(p)
    for a in alerts:
        if a.animal_id in states:
            states[a.animal_id].open_alerts.append(a)
    for state in states.values():
        state.procedures.sort(key=order_key, reverse=True)
        state.open_alerts.sort(key=lambda x: (x.date, x.created_at))
    return clients, states


# ---- status (prototype vSt) -------------------------------------------------------------

def status(state):
    last = state.last
    if last is None:
        return "none"
    if last.conduct == Conduct.IATF_PROTOCOL and last.result != Result.PREGNANT:
        return "protocol"
    if last.kind in INSEMINATIONS:
        return "inseminated"
    if last.kind == Kind.PROTOCOL:
        return "protocol"
    if last.kind in DIAGNOSES and last.result == Result.PREGNANT:
        return "pregnant"
    if last.result == Result.OPEN:
        return "open"
    return "attended"


STATUS_TONE = {"pregnant": "success", "inseminated": "info", "protocol": "warning", "open": "danger", "attended": "neutral", "none": "neutral"}


# ---- protocol / insemination source (vkIns, vkSrc) ---------------------------------------

def management_length(procedure):
    return 11 if procedure.management_days == 11 else 10


def insemination_date(procedure, open_alerts):
    """Expected IATF insemination: the open "inseminate" alert, else D0 + 10/11 days."""
    pending = [a for a in open_alerts if a.kind == AlertKind.INSEMINATE]
    if pending:
        return pending[0].date
    start = procedure.protocol_start or procedure.date
    return start + timedelta(days=management_length(procedure))


def protocol_source(state):
    """Latest protocol or insemination not yet followed by a pregnancy (prototype vkSrc)."""
    source = next((p for p in state.procedures if p.conduct == Conduct.IATF_PROTOCOL or p.kind in INSEMINATIONS), None)
    if source is None:
        return None
    if any(p.result == Result.PREGNANT and order_key(p) > order_key(source) for p in state.procedures):
        return None
    if source.conduct == Conduct.IATF_PROTOCOL:
        return {
            "kind": "protocol", "procedure": source, "insemination_date": insemination_date(source, state.open_alerts),
            "bull": source.bull, "cycling": source.cycling, "management_days": management_length(source),
            "protocol_start": source.protocol_start or source.date,
        }
    return {"kind": "insemination", "procedure": source, "insemination_date": source.date, "bull": source.semen,
            "cycling": "", "management_days": None, "protocol_start": None}


def pending_protocol_step(state):
    """Open protocol stage that is not the insemination (prototype vk8: the D8/D9 removal)."""
    if status(state) != "protocol" or not state.open_alerts:
        return None
    first = state.open_alerts[0]
    return first if first.kind != AlertKind.INSEMINATE else None


def not_inseminated_date(state, today):
    """Protocol whose insemination date passed without an insemination (prototype vNaoIns)."""
    found = None
    for proc in sorted(state.procedures, key=order_key):
        if not (proc.conduct == Conduct.IATF_PROTOCOL or proc.kind == Kind.PROTOCOL) or proc.kind in INSEMINATIONS:
            continue
        start = proc.protocol_start or proc.date
        if any((p.conduct == Conduct.IATF_PROTOCOL or p.kind == Kind.PROTOCOL) and (p.protocol_start or p.date) > start for p in state.procedures):
            continue
        if any(p.kind in INSEMINATIONS and not p.not_done and p.date >= start for p in state.procedures):
            continue
        expected = insemination_date(proc, state.open_alerts)
        missed = any(p.not_done and p.date >= start and p.step == "insemination" for p in state.procedures)
        if expected < today or missed:
            found = expected
    return found


def default_coverage_method(state):
    """Artificial insemination when the animal already has an insemination done (vkMetDef)."""
    if any(p.kind in INSEMINATIONS and not p.not_done for p in state.procedures):
        return VeterinaryProcedure.CoverageMethod.ARTIFICIAL
    return ""


# ---- next procedure (vNP) and deadline bucket (vResD) ------------------------------------

def next_procedure(state):
    """Returns {"code", "day", "date"}; the web turns the code into a translated label."""
    if state.open_alerts:
        alert = state.open_alerts[0]
        return {"code": f"alert_{alert.kind}", "day": alert.day, "date": alert.date}
    last = state.last
    current = status(state)
    if last is None:
        return {"code": "first", "day": None, "date": None}
    if current == "protocol":
        source = protocol_source(state)
        return {"code": "inseminate_iatf", "day": None, "date": source["insemination_date"] if source else None}
    if current == "inseminated":
        return {"code": "ultrasound", "day": None, "date": last.date + timedelta(days=30)}
    if current == "pregnant":
        return {"code": "calving", "day": None, "date": last.calving_date}
    if current == "open":
        if last.conduct == Conduct.DISCARD:
            return {"code": "discard", "day": None, "date": None}
        if last.conduct == Conduct.OBSERVE_HEAT:
            return {"code": "observe_heat", "day": None, "date": last.date + timedelta(days=last.return_days or 21)}
        if last.conduct == Conduct.INDUCTION:
            return {"code": "induction_review", "day": None, "date": last.date + timedelta(days=last.return_days or 7)}
        return {"code": "define_conduct", "day": None, "date": None}
    return {"code": "new", "day": None, "date": None}


def deadline(next_step, today):
    when = next_step["date"]
    if not when:
        return "nodate"
    if when < today:
        return "late"
    if when == today:
        return "today"
    return "week" if when <= today + timedelta(days=7) else "later"


def gestation_now(procedure, today):
    """Current gestation age of a pregnancy diagnosis (vGN)."""
    if procedure is None or procedure.result != Result.PREGNANT:
        return 0
    if procedure.coverage_date:
        return max(0, (today - procedure.coverage_date).days)
    return (procedure.gestation_days or 0) + max(0, (today - procedure.date).days)


# ---- report columns (vRK, vRRes, vRCd, vRB) and pregnancy rate (vTaxa) --------------------

def report_kind(procedure):
    if procedure.not_done:
        return "insemination_not_done"
    if procedure.kind in INSEMINATIONS:
        return "insemination"
    if procedure.kind in DIAGNOSES:
        return "diagnosis"
    if procedure.kind == Kind.PROTOCOL:
        return "iatf_protocol"
    return "other"


def report_conduct(procedure):
    if procedure.conduct:
        return procedure.conduct
    return Conduct.IATF_PROTOCOL if procedure.kind == Kind.PROTOCOL else ""


def report_result(procedure, animal_procedures):
    """Diagnosis result, or for an insemination the first diagnosis after it."""
    if procedure.kind in DIAGNOSES:
        return {Result.PREGNANT: "pregnant", Result.OPEN: "open"}.get(procedure.result, "")
    if procedure.kind in INSEMINATIONS:
        later = sorted((p for p in animal_procedures if p.kind in DIAGNOSES and order_key(p) > order_key(procedure)), key=order_key)
        if not later:
            return "awaiting"
        return "pregnant" if later[0].result == Result.PREGNANT else "open"
    return ""


def pregnancy_origin(procedure, animal_procedures):
    """How a pregnancy was obtained (vRCd): stated method, else an earlier insemination."""
    if not (procedure.kind in DIAGNOSES and procedure.result == Result.PREGNANT):
        return report_conduct(procedure)
    if procedure.coverage_method:
        return "natural" if procedure.coverage_method == VeterinaryProcedure.CoverageMethod.NATURAL else "artificial"
    if procedure.origin_kind:
        return "artificial"
    earlier = any(p.kind in INSEMINATIONS and not p.not_done and order_key(p) < order_key(procedure) for p in animal_procedures)
    return "artificial" if earlier else "natural"


def title_case(text):
    return " ".join(word[:1].upper() + word[1:] for word in (text or "").split())


def report_bull(procedure, animal_procedures):
    bull = title_case(procedure.semen or procedure.bull)
    if bull or procedure.kind not in DIAGNOSES:
        return bull
    previous = sorted((p for p in animal_procedures if p.kind in INSEMINATIONS and p.date <= procedure.date and p.id != procedure.id), key=order_key, reverse=True)
    return title_case(previous[0].semen or previous[0].bull) if previous else ""


def pregnancy_rate(procedures, by_animal):
    """Only inseminations whose diagnosis is known count (prototype vTaxa)."""
    outcome = {}
    for proc in procedures:
        insemination = None
        if proc.kind in INSEMINATIONS:
            insemination = proc
        elif proc.kind in DIAGNOSES and proc.result in (Result.PREGNANT, Result.OPEN):
            earlier = sorted((p for p in by_animal[proc.animal_id] if p.kind in INSEMINATIONS and order_key(p) < order_key(proc)), key=order_key, reverse=True)
            insemination = earlier[0] if earlier else None
        if insemination is None:
            continue
        result = report_result(insemination, by_animal[insemination.animal_id])
        if result in ("pregnant", "open"):
            outcome[insemination.id] = result
    total = len(outcome)
    pregnant = sum(1 for r in outcome.values() if r == "pregnant")
    return {"total": total, "pregnant": pregnant, "open": total - pregnant, "rate": (pregnant / total * 100) if total else None}


def procedures_by_animal(procedures):
    grouped = defaultdict(list)
    for p in procedures:
        grouped[p.animal_id].append(p)
    return grouped


def today_or(value=None):
    return value or date.today()
