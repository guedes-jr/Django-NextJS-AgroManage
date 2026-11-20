"""
Write rules of the Área do veterinário, ported from the approved prototype.

`register_procedure` follows the prototype's layered save (vkSave): a pending protocol stage
(D8/D9 removal) is answered first, then an animal in protocol answers whether the IATF
insemination was done, otherwise a pregnancy diagnosis with conduct and alerts is recorded.
`quick_register` is the inline launch of the Animals tab (vqSave).
"""
import unicodedata
from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from django.utils.translation import gettext as translate_message
from rest_framework.exceptions import ValidationError

from . import selectors
from .models import (
    Category,
    VeterinaryAlert,
    VeterinaryAnimal,
    VeterinaryClient,
    VeterinaryProcedure,
    VeterinarySettings,
)

Kind = VeterinaryProcedure.Kind
Result = VeterinaryProcedure.Result
Conduct = VeterinaryProcedure.Conduct
AlertKind = VeterinaryAlert.Kind
DEFAULT_RETURN_DAYS = {Conduct.OBSERVE_HEAT: 21, Conduct.INDUCTION: 10}


def today():
    return timezone.localdate()


def fail(message):
    raise ValidationError({"detail": translate_message(message)})


def normalize(text):
    text = unicodedata.normalize("NFD", str(text or ""))
    return "".join(c for c in text if not unicodedata.combining(c)).lower().strip()


def settings_for(organization):
    obj, _ = VeterinarySettings.objects.get_or_create(organization=organization)
    return obj


def find_animal(organization, client, query):
    """Same lookup as the prototype: identifier or name, accents and case ignored."""
    key = normalize(query)
    if not key or client is None:
        return None
    for animal in VeterinaryAnimal.objects.filter(organization=organization, client=client):
        if normalize(animal.identifier) == key or (animal.name and normalize(animal.name) == key):
            return animal
    return None


def animal_state(animal):
    state = selectors.AnimalState(animal)
    state.procedures = sorted(animal.procedures.all(), key=selectors.order_key, reverse=True)
    state.open_alerts = sorted(animal.alerts.filter(done=False), key=lambda a: (a.date, a.created_at))
    return state


def remember_responsible(organization, responsible):
    if responsible:
        VeterinarySettings.objects.filter(organization=organization).update(last_responsible=responsible)


def protocol_alerts(management_days, start):
    length = 11 if management_days == 11 else 10
    return [
        (AlertKind.REMOVAL, length - 2, start + timedelta(days=length - 2), None),
        (AlertKind.INSEMINATE, length, start + timedelta(days=length), None),
    ]


def create_alerts(organization, procedure, specs):
    return [
        VeterinaryAlert.objects.create(
            organization=organization, client=procedure.client, animal=procedure.animal, procedure=procedure,
            kind=kind, day=day, date=when, reference_date=reference,
        )
        for kind, day, when, reference in specs
    ]


def close_open_alerts(animal):
    animal.alerts.filter(done=False).update(done=True)


def parse_int(value):
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return None


# ---- Lançar atendimento -----------------------------------------------------------------

@transaction.atomic
def register_procedure(*, organization, user, data):
    """Saves one procedure for one animal; returns (procedure, alerts, animal_created, branch)."""
    config = settings_for(organization)
    when = data.get("date")
    if not when:
        fail("Informe a data.")
    client = data.get("client")
    new_client = (data.get("new_client_name") or "").strip()
    if client is None and not new_client:
        fail("Informe o nome do cliente.")
    query = (data.get("animal") or "").strip()
    if not query:
        fail("Digite o nome ou o número do animal.")
    responsible = (data.get("responsible") or "").strip()
    notes = (data.get("notes") or "").strip()
    animal = find_animal(organization, client, query) if client else None

    if animal is not None:
        state = animal_state(animal)
        step = selectors.pending_protocol_step(state)
        if step is not None:
            return _protocol_step(organization, user, animal, state, step, data, responsible, notes)
        if selectors.status(state) == "protocol":
            return _iatf_insemination(organization, user, animal, state, data, responsible, notes, config, when)
    return _diagnosis(organization, user, client, new_client, animal, query, data, responsible, notes, config, when)


def _step_done(data):
    done = data.get("step_done")
    if done not in ("yes", "no"):
        fail("Escolha Feito ou Não feito.")
    return done == "yes"


def _protocol_copy(state):
    last = state.last
    return {
        "conduct": Conduct.IATF_PROTOCOL, "cycling": last.cycling if last else "",
        "management_days": (last.management_days if last else None) or 10,
        "protocol_start": (last.protocol_start or last.date) if last else None, "bull": last.bull if last else "",
    }


def _protocol_step(organization, user, animal, state, alert, data, responsible, notes):
    done = _step_done(data)
    step_date = data.get("step_date")
    if done:
        if not step_date:
            fail("Informe a data em que foi feito.")
        if step_date > today():
            fail("A data não pode ser no futuro.")
    procedure = VeterinaryProcedure.objects.create(
        organization=organization, client=animal.client, animal=animal, date=step_date if done else data["date"],
        kind=Kind.OTHER, value=Decimal("0"), notes=notes, responsible=responsible, category=animal.category,
        step="removal", step_day=alert.day, not_done=not done, created_by=user, **_protocol_copy(state),
    )
    if done:
        alert.done = True
        alert.save(update_fields=["done", "updated_at"])
    remember_responsible(organization, responsible)
    return procedure, [], False, "protocol_step"


def _iatf_insemination(organization, user, animal, state, data, responsible, notes, config, when):
    done = _step_done(data)
    source = selectors.protocol_source(state)
    close_open_alerts(animal)
    if done:
        step_date = data.get("step_date")
        if not step_date:
            fail("Informe a data da inseminação.")
        if step_date > today():
            fail("A data da inseminação não pode ser no futuro.")
        procedure = VeterinaryProcedure.objects.create(
            organization=organization, client=animal.client, animal=animal, date=step_date, kind=Kind.INSEMINATION,
            semen=(data.get("step_bull") or "").strip(), value=config.price(Kind.INSEMINATION), notes=notes,
            responsible=responsible, category=animal.category, step="insemination",
            origin_kind=source["kind"] if source else "", created_by=user,
        )
        alerts = create_alerts(organization, procedure, [(AlertKind.ULTRASOUND, None, step_date + timedelta(days=30), None)])
    else:
        procedure = VeterinaryProcedure.objects.create(
            organization=organization, client=animal.client, animal=animal, date=when, kind=Kind.OTHER,
            value=Decimal("0"), notes=notes, responsible=responsible, category=animal.category,
            step="insemination", not_done=True, created_by=user, **_protocol_copy(state),
        )
        alerts = []
    remember_responsible(organization, responsible)
    return procedure, alerts, False, "iatf_insemination"


def _diagnosis(organization, user, client, new_client, animal, query, data, responsible, notes, config, when):
    category = data.get("category") or (animal.category if animal else "")
    if category not in Category.values:
        fail("Escolha a categoria do animal.")
    diagnosis = data.get("diagnosis")
    if diagnosis not in (Result.PREGNANT, Result.OPEN):
        fail("Escolha o diagnóstico: prenha ou vazia.")
    conduct = data.get("conduct") or ""
    if diagnosis == Result.OPEN and conduct not in (Conduct.IATF_PROTOCOL, Conduct.OBSERVE_HEAT, Conduct.INDUCTION, Conduct.DISCARD):
        fail("Escolha a conduta: protocolo IATF, observar cio, indução ou descarte.")
    method = data.get("coverage_method") or ""
    if diagnosis == Result.PREGNANT and method not in VeterinaryProcedure.CoverageMethod.values[1:]:
        fail("Escolha como foi a cobertura: inseminação artificial ou monta natural.")

    if client is None:
        client = VeterinaryClient.objects.filter(organization=organization, name=new_client).first() or VeterinaryClient.objects.create(organization=organization, name=new_client)
        animal = find_animal(organization, client, query)
    source = selectors.protocol_source(animal_state(animal)) if animal else None

    coverage = data.get("coverage_date")
    gestation = parse_int(data.get("gestation_days"))
    calving = data.get("calving_date")
    bull = (data.get("bull") or "").strip()
    if diagnosis == Result.PREGNANT:
        if source and not data.get("edit") and not data.get("confirm_pregnancy"):
            fail('Marque a opção "Confirmar prenhez" para confirmar.')
        if source and not data.get("edit"):
            coverage = coverage or source["insemination_date"]
            bull = bull or source["bull"]
        if not coverage and gestation is None:
            fail("Informe a data da cobertura ou a idade gestacional.")
        if not coverage:
            coverage = when - timedelta(days=gestation)
        gestation = max(0, (when - coverage).days)
        calving = calving or coverage + timedelta(days=selectors.GESTATION_DAYS)

    animal_created = animal is None
    if animal_created:
        animal = VeterinaryAnimal.objects.create(organization=organization, client=client, identifier=query, category=category)
    elif animal.category != category:
        animal.category = category
        animal.save(update_fields=["category", "updated_at"])
    close_open_alerts(animal)

    protocol = diagnosis == Result.OPEN and conduct == Conduct.IATF_PROTOCOL
    management = 11 if parse_int(data.get("management_days")) == 11 else 10
    start = data.get("protocol_start") or when
    if protocol and start > today():
        fail("O início do protocolo não pode ser no futuro.")
    return_days = 0
    if conduct in DEFAULT_RETURN_DAYS:
        typed = parse_int(data.get("return_days"))
        return_days = typed if typed is not None else DEFAULT_RETURN_DAYS[conduct]

    procedure = VeterinaryProcedure.objects.create(
        organization=organization, client=client, animal=animal, date=when, kind=Kind.ULTRASOUND, result=diagnosis,
        value=config.price(Kind.ULTRASOUND), notes=notes, responsible=responsible, category=category,
        conduct=conduct if diagnosis == Result.OPEN else "",
        cycling=(data.get("cycling") or VeterinaryProcedure.Cycling.CYCLING) if protocol else "",
        management_days=management if protocol else None, protocol_start=start if protocol else None,
        return_days=return_days, discard_reason=(data.get("discard_reason") or "") if conduct == Conduct.DISCARD else "",
        coverage_date=coverage if diagnosis == Result.PREGNANT else None,
        gestation_days=gestation if diagnosis == Result.PREGNANT else 0,
        bull=bull if (diagnosis == Result.PREGNANT or protocol) else "",
        calving_date=calving if diagnosis == Result.PREGNANT else None,
        coverage_method=method if diagnosis == Result.PREGNANT else "",
        origin_kind=source["kind"] if (diagnosis == Result.PREGNANT and source) else "", created_by=user,
    )
    specs = []
    if diagnosis == Result.PREGNANT and calving:
        specs.append((AlertKind.CALVING, None, calving - timedelta(days=7), calving))
    if protocol:
        specs += protocol_alerts(management, start)
    if conduct == Conduct.OBSERVE_HEAT and diagnosis == Result.OPEN:
        specs.append((AlertKind.OBSERVE_HEAT, None, when + timedelta(days=return_days), None))
    if conduct == Conduct.INDUCTION and diagnosis == Result.OPEN:
        specs.append((AlertKind.INDUCTION_REVIEW, None, when + timedelta(days=return_days), None))
    alerts = create_alerts(organization, procedure, specs)
    remember_responsible(organization, responsible)
    return procedure, alerts, animal_created, "diagnosis"


# ---- Animals tab: inline launch (vqSave) --------------------------------------------------

def quick_kind(state):
    current = selectors.status(state)
    if current == "protocol":
        step = selectors.next_procedure(state)["code"]
        return "protocol_insemination" if step in ("alert_inseminate", "inseminate_iatf") else "protocol_step"
    if current == "inseminated":
        return "ultrasound"
    if current == "pregnant":
        return "pregnant"
    return "general"


@transaction.atomic
def quick_register(*, organization, user, animal, data):
    when = data.get("date")
    if not when:
        fail("Informe a data.")
    if when > today():
        fail("A data não pode ser depois de hoje.")
    state = animal_state(animal)
    kind = quick_kind(state)
    config = settings_for(organization)
    responsible = config.last_responsible
    base = {"client": animal.client, "animal": animal.identifier, "category": animal.category, "responsible": responsible}

    if kind == "pregnant":
        fail("Esta vaca está prenha. Não há nada para lançar agora.")
    if kind == "protocol_insemination":
        done = _step_done(data)
        if done and not (data.get("bull") or "").strip():
            fail("Informe o touro ou sêmen usado.")
        payload = {**base, "date": today(), "step_done": data["step_done"], "step_date": when, "step_bull": data.get("bull"), "notes": data.get("notes")}
        return register_procedure(organization=organization, user=user, data=payload)
    if kind == "protocol_step":
        done = _step_done(data)
        reschedule = data.get("reschedule_to")
        if not done and reschedule and reschedule < today():
            fail("Remarque para hoje ou uma data futura.")
        alert = state.open_alerts[0] if state.open_alerts else None
        procedure = VeterinaryProcedure.objects.create(
            organization=organization, client=animal.client, animal=animal, date=when if done else today(),
            kind=Kind.OTHER, value=Decimal("0"), notes=(data.get("notes") or "").strip(), category=animal.category,
            step="removal", step_day=alert.day if alert else None, not_done=not done,
            rescheduled_to=reschedule if not done else None, created_by=user, **_protocol_copy(state),
        )
        if alert is not None:
            if done:
                alert.done = True
            elif reschedule:
                alert.date = reschedule
            alert.save(update_fields=["done", "date", "updated_at"])
        return procedure, [], False, "protocol_step"
    action = data.get("action") if kind == "general" else "diagnosis"
    if action == "insemination":
        bull = (data.get("bull") or "").strip()
        if not bull:
            fail("Informe o touro ou sêmen usado.")
        close_open_alerts(animal)
        procedure = VeterinaryProcedure.objects.create(
            organization=organization, client=animal.client, animal=animal, date=when, kind=Kind.INSEMINATION,
            semen=bull, value=config.price(Kind.INSEMINATION), category=animal.category, created_by=user,
        )
        alerts = create_alerts(organization, procedure, [(AlertKind.ULTRASOUND, None, when + timedelta(days=30), None)])
        return procedure, alerts, False, "insemination"
    if action == "protocol":
        payload = {**base, "date": when, "diagnosis": Result.OPEN, "conduct": Conduct.IATF_PROTOCOL,
                   "cycling": data.get("cycling"), "management_days": data.get("management_days"), "protocol_start": when}
        return register_procedure(organization=organization, user=user, data=payload)
    if action != "diagnosis":
        fail("Escolha o que foi feito.")
    diagnosis = data.get("diagnosis")
    if diagnosis not in (Result.PREGNANT, Result.OPEN):
        fail("Escolha prenha ou vazia.")
    if diagnosis == Result.OPEN:
        if not data.get("conduct"):
            fail("Escolha a conduta para a vaca vazia.")
        payload = {**base, "date": when, "diagnosis": diagnosis, "conduct": data["conduct"], "cycling": data.get("cycling"),
                   "management_days": data.get("management_days"), "protocol_start": when}
        return register_procedure(organization=organization, user=user, data=payload)
    source = selectors.protocol_source(state)
    coverage = source["insemination_date"] if source and source["insemination_date"] <= when else None
    if coverage is None:
        days = parse_int(data.get("gestation_days"))
        if not days:
            fail("Informe os dias de gestação.")
        coverage = when - timedelta(days=days)
    payload = {**base, "date": when, "diagnosis": diagnosis, "coverage_date": coverage,
               "calving_date": coverage + timedelta(days=selectors.GESTATION_DAYS), "bull": source["bull"] if source else "",
               "confirm_pregnancy": True, "coverage_method": data.get("coverage_method") or selectors.default_coverage_method(state)}
    return register_procedure(organization=organization, user=user, data=payload)


# ---- Clients, billing and reset ----------------------------------------------------------

def delete_client(client):
    if client.procedures.exists():
        fail("Este cliente já tem atendimentos e não pode ser excluído.")
    client.delete()


def mark_month_paid(organization, client, month_start, month_end):
    return VeterinaryProcedure.objects.filter(
        organization=organization, client=client, date__gte=month_start, date__lte=month_end, paid=False,
    ).update(paid=True)


@transaction.atomic
def wipe(organization):
    counts = {
        "clients": VeterinaryClient.objects.filter(organization=organization).count(),
        "animals": VeterinaryAnimal.objects.filter(organization=organization).count(),
    }
    VeterinaryAlert.objects.filter(organization=organization).delete()
    VeterinaryProcedure.objects.filter(organization=organization).delete()
    VeterinaryAnimal.objects.filter(organization=organization).delete()
    VeterinaryClient.objects.filter(organization=organization).delete()
    return counts
