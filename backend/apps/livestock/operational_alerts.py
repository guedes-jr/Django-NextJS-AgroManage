"""Read-only alert selectors shared by dashboards and scheduled WhatsApp delivery."""

import datetime
import hashlib

from django.db.models import Count, Q
from django.utils import timezone

from .models import Animal, AnimalBatch, Birth, HeatRecord, Litter, Mating, Pregnancy


def _operational_alert_key(species_code, kind, text, context=""):
    payload = f"{species_code}|{kind}|{text}|{context}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _event_alert_metadata(species_code, kind, event_id, due_date):
    return {
        "due_date": due_date.isoformat(),
        "alert_key": _operational_alert_key(
            species_code, kind, "", f"{event_id}|{due_date.isoformat()}"
        ),
    }


def _heat_prediction_alerts(organization, species_code, horizon_days=45):
    """Build alerts for predicted heats that are overdue or approaching."""
    today = timezone.localdate()
    predictions = (
        HeatRecord.objects.filter(
            animal__farm__organization=organization,
            animal__species__code=species_code,
            animal__status=AnimalBatch.Status.ACTIVE,
            animal__reproductive_status__in=[
                Animal.ReproductiveStatus.VAZIA,
                Animal.ReproductiveStatus.EM_PREPARO,
                Animal.ReproductiveStatus.PRONTA,
                Animal.ReproductiveStatus.AGUARDANDO_COBERTURA,
            ],
            is_predicted=True,
            heat_number__in=(2, 3),
            heat_date__lte=today + datetime.timedelta(days=horizon_days),
        )
        .values("heat_number", "heat_date")
        .annotate(total=Count("id"))
        .order_by("heat_date", "heat_number")
    )

    alerts = []
    for prediction in predictions:
        heat_date = prediction["heat_date"]
        days = (heat_date - today).days
        total = prediction["total"]
        is_coverage = prediction["heat_number"] == 3
        event = "cobertura" if is_coverage else "2º cio"
        subject = "marrã" if species_code == "suinos" else "novilha"
        subject_label = subject if total == 1 else f"{subject}s"
        formatted_date = heat_date.strftime("%d/%m/%Y")

        if days < 0:
            alerts.append(
                {
                    **_event_alert_metadata(
                        species_code,
                        "predicted-heat",
                        prediction["heat_number"],
                        heat_date,
                    ),
                    "type": "danger",
                    "icon": "⚠️",
                    "text": f"{total} {subject_label} com {event} previsto em atraso ({formatted_date}).",
                    "time": f"Há {abs(days)} dia{'s' if abs(days) != 1 else ''}",
                }
            )
        elif days == 0:
            alerts.append(
                {
                    **_event_alert_metadata(
                        species_code,
                        "predicted-heat",
                        prediction["heat_number"],
                        heat_date,
                    ),
                    "type": "warning",
                    "icon": "🎯" if is_coverage else "🔴",
                    "text": f"{total} {subject_label} com {event} previsto para hoje.",
                    "time": "Hoje",
                }
            )
        else:
            alerts.append(
                {
                    **_event_alert_metadata(
                        species_code,
                        "predicted-heat",
                        prediction["heat_number"],
                        heat_date,
                    ),
                    "type": "warning" if is_coverage else "info",
                    "icon": "🎯" if is_coverage else "📅",
                    "text": f"{total} {subject_label} com {event} previsto para {formatted_date}.",
                    "time": f"Em {days} dia{'s' if days != 1 else ''}",
                }
            )
    return alerts


def _scheduled_reproductive_alerts(
    organization, species_code, include_birth_vaccines=True
):
    """Expose scheduled pregnancy checks and vaccines as dashboard alerts."""
    today = timezone.localdate()
    alerts = []

    pending_matings = Mating.objects.filter(
        female__farm__organization=organization,
        female__species__code=species_code,
        female__status=AnimalBatch.Status.ACTIVE,
        status=Mating.Status.PENDING_DG,
    ).select_related("female")
    for mating in pending_matings:
        due_date = mating.mating_date + datetime.timedelta(days=21)
        days = (due_date - today).days
        if days < 0:
            alert_type, time_label = (
                "danger",
                f"Há {abs(days)} dia{'s' if abs(days) != 1 else ''}",
            )
            text = f"Diagnóstico de prenhez de {mating.female.identifier} está atrasado desde {due_date.strftime('%d/%m/%Y')}."
        elif days == 0:
            alert_type, time_label = "warning", "Hoje"
            text = f"Diagnóstico de prenhez de {mating.female.identifier} previsto para hoje."
        else:
            alert_type, time_label = "info", f"Em {days} dia{'s' if days != 1 else ''}"
            text = f"Diagnóstico de prenhez de {mating.female.identifier} previsto para {due_date.strftime('%d/%m/%Y')}."
        alerts.append(
            {
                "type": alert_type,
                "icon": "🔬",
                "text": text,
                "time": time_label,
                **_event_alert_metadata(species_code, "diagnosis", mating.id, due_date),
            }
        )

    scheduled_heats = Litter.objects.filter(
        birth__female__farm__organization=organization,
        birth__female__species__code=species_code,
        birth__female__status=AnimalBatch.Status.ACTIVE,
        weaning_date__isnull=False,
        next_mating_notice_date__isnull=False,
    ).select_related("birth__female")
    for litter in scheduled_heats:
        due_date = litter.next_mating_notice_date
        days = (due_date - today).days
        identifier = litter.birth.female.identifier
        if days < 0:
            alert_type = "danger"
            time_label = f"Há {abs(days)} dia{'s' if abs(days) != 1 else ''}"
            text = f"Próximo cio da matriz {identifier} está atrasado desde {due_date.strftime('%d/%m/%Y')}."
        elif days == 0:
            alert_type = "warning"
            time_label = "Hoje"
            text = f"Próximo cio da matriz {identifier} previsto para hoje."
        else:
            alert_type = "info"
            time_label = f"Em {days} dia{'s' if days != 1 else ''}"
            text = f"Próximo cio da matriz {identifier} previsto para {due_date.strftime('%d/%m/%Y')}."
        alerts.append(
            {
                "type": alert_type,
                "icon": "🔴",
                "text": text,
                "time": time_label,
                "legacy_event_key": f"livestock.next_mating:{litter.id}",
                **_event_alert_metadata(
                    species_code, "post-weaning-heat", litter.id, due_date
                ),
            }
        )

    vaccine_matings = (
        Mating.objects.filter(
            female__farm__organization=organization,
            female__species__code=species_code,
            female__status=AnimalBatch.Status.ACTIVE,
            reproductive_vaccine_item__isnull=False,
            reproductive_vaccine_due_date__isnull=False,
        )
        .exclude(
            Q(status=Mating.Status.FAILED)
            | Q(
                pregnancy__status__in=[
                    Pregnancy.Status.LOST,
                    Pregnancy.Status.COMPLETED,
                ]
            )
        )
        .select_related("female", "reproductive_vaccine_item")
    )
    for mating in vaccine_matings:
        due_date = mating.reproductive_vaccine_due_date
        days = (due_date - today).days
        if days < 0:
            alert_type, time_label = (
                "danger",
                f"Há {abs(days)} dia{'s' if abs(days) != 1 else ''}",
            )
            state = "está atrasada desde"
        elif days == 0:
            alert_type, time_label = "warning", "Hoje"
            state = "está agendada para hoje —"
        else:
            alert_type, time_label = "info", f"Em {days} dia{'s' if days != 1 else ''}"
            state = "agendada para"
        text = (
            f"Vacina {mating.reproductive_vaccine_item.nome} de {mating.female.identifier} "
            f"{state} {due_date.strftime('%d/%m/%Y')}."
        )
        alerts.append(
            {
                "type": alert_type,
                "icon": "💉",
                "text": text,
                "time": time_label,
                "legacy_event_key": f"livestock.reproductive_vaccine.mating:{mating.id}",
                **_event_alert_metadata(
                    species_code, "mating-vaccine", mating.id, due_date
                ),
            }
        )

    if include_birth_vaccines:
        alerts.extend(_scheduled_birth_vaccine_alerts(organization, species_code))

    return alerts


def _scheduled_birth_vaccine_alerts(organization, species_code):
    """Return only postpartum reproductive-vaccine alerts."""
    today = timezone.localdate()
    alerts = []
    birth_vaccines = Birth.objects.filter(
        female__farm__organization=organization,
        female__species__code=species_code,
        female__status=AnimalBatch.Status.ACTIVE,
        reproductive_vaccine_item__isnull=False,
        reproductive_vaccine_due_date__isnull=False,
    ).select_related("female", "reproductive_vaccine_item")

    for birth in birth_vaccines:
        due_date = birth.reproductive_vaccine_due_date
        days = (due_date - today).days
        alert_type = "danger" if days < 0 else "warning" if days == 0 else "info"
        time_label = (
            f"Há {abs(days)} dia{'s' if abs(days) != 1 else ''}"
            if days < 0
            else "Hoje"
            if days == 0
            else f"Em {days} dia{'s' if days != 1 else ''}"
        )
        if days < 0:
            state = "está atrasada desde"
        elif days == 0:
            state = "está agendada para hoje —"
        else:
            state = "agendada para"
        text = f"Vacina {birth.reproductive_vaccine_item.nome} de {birth.female.identifier} {state} {due_date.strftime('%d/%m/%Y')}."
        alerts.append(
            {
                "type": alert_type,
                "icon": "💉",
                "text": text,
                "time": time_label,
                "legacy_event_key": f"livestock.reproductive_vaccine.birth:{birth.id}",
                **_event_alert_metadata(
                    species_code, "birth-vaccine", birth.id, due_date
                ),
            }
        )

    return alerts


def _piglet_iron_alerts(organization, species_code):
    """Schedule iron supplementation for swine litters three days after birth."""
    if species_code != "suinos":
        return []

    today = timezone.localdate()
    recent_births = (
        Birth.objects.filter(
            female__farm__organization=organization,
            female__species__code=species_code,
            birth_date__gte=today - datetime.timedelta(days=14),
            birth_date__lte=today,
        )
        .exclude(
            litter__weaning_date__isnull=False,
        )
        .select_related("female")
    )

    alerts = []
    for birth in recent_births.order_by("birth_date", "female__identifier"):
        due_date = birth.birth_date + datetime.timedelta(days=3)
        days = (due_date - today).days
        if days < 0:
            alert_type = "danger"
            time_label = f"Há {abs(days)} dia{'s' if abs(days) != 1 else ''}"
        elif days == 0:
            alert_type = "warning"
            time_label = "Hoje"
        else:
            alert_type = "info"
            time_label = f"Em {days} dia{'s' if days != 1 else ''}"

        text = f"Leitegada da matriz {birth.female.identifier}: aplicar ferro."
        alerts.append(
            {
                "type": alert_type,
                "icon": "💉",
                "text": text,
                "time": time_label,
                **_event_alert_metadata(
                    species_code, "piglet-iron", birth.id, due_date
                ),
            }
        )
    return alerts


def _expected_birth_alerts(organization, species_code):
    """Expose every ongoing pregnancy's expected birth as a dated alert."""
    today = timezone.localdate()
    alerts = []
    pregnancies = Pregnancy.objects.filter(
        female__farm__organization=organization,
        female__species__code=species_code,
        female__status=AnimalBatch.Status.ACTIVE,
        status=Pregnancy.Status.ONGOING,
        birth__isnull=True,
        expected_birth_date__isnull=False,
    ).select_related("female")

    for pregnancy in pregnancies.order_by("expected_birth_date", "female__identifier"):
        due_date = pregnancy.expected_birth_date
        days = (due_date - today).days
        formatted_date = due_date.strftime("%d/%m/%Y")
        if days < 0:
            alert_type = "danger"
            time_label = f"Há {abs(days)} dia{'s' if abs(days) != 1 else ''}"
            text = f"Parto da matriz {pregnancy.female.identifier} está atrasado desde {formatted_date}."
        elif days == 0:
            alert_type, time_label = "warning", "Hoje"
            text = f"Parto da matriz {pregnancy.female.identifier} previsto para hoje."
        else:
            alert_type = "warning" if days <= 7 else "info"
            time_label = f"Em {days} dia{'s' if days != 1 else ''}"
            text = f"Parto da matriz {pregnancy.female.identifier} previsto para {formatted_date}."
        alerts.append(
            {
                "type": alert_type,
                "icon": "🐷",
                "text": text,
                "time": time_label,
                **_event_alert_metadata(
                    species_code, "expected-birth", pregnancy.id, due_date
                ),
            }
        )

    return alerts


def operational_alerts(organization, species_code):
    """Every dated reproductive alert and operational threshold shown by phase views."""
    from .selectors import with_batch_birth_date

    today = timezone.localdate()
    alerts = [
        *_heat_prediction_alerts(organization, species_code),
        *_scheduled_reproductive_alerts(organization, species_code),
        *_expected_birth_alerts(organization, species_code),
        *_piglet_iron_alerts(organization, species_code),
    ]
    animals = Animal.objects.filter(
        farm__organization=organization, species__code=species_code, gender="F"
    )

    def add(text, kind, level="info", ids=()):
        alerts.append(
            {
                "text": text,
                "time": "Hoje",
                "type": level,
                "alert_key": _operational_alert_key(
                    species_code, kind, "", ",".join(sorted(str(pk) for pk in ids))
                ),
            }
        )

    young = animals.filter(
        category="Marrã" if species_code == "suinos" else "Novilha",
        reproductive_status__in=["pronta", "aguardando_cobertura"],
    )
    ids = list(young.values_list("pk", flat=True))
    n = len(ids)
    if n:
        add(
            f"{n} marrã{'s' if n > 1 else ''} pronta{'s' if n > 1 else ''} para cobertura.",
            "ready-mating",
            ids=ids,
        )
    females = animals.filter(category="Matriz" if species_code == "suinos" else "Vaca")
    ids = list(
        females.filter(
            reproductive_status__in=["vazia", "aguardando_cobertura"]
        ).values_list("pk", flat=True)
    )
    n = len(ids)
    if n > 5:
        add(f"{n} matrizes vazias — acima do ideal.", "empty-females", "danger", ids)
    ids = list(
        females.filter(reproductive_status="coberta").values_list("pk", flat=True)
    )
    n = len(ids)
    if n:
        add(
            f"{n} matrizes cobertas aguardando diagnóstico.",
            "pending-diagnosis",
            ids=ids,
        )
    births = Birth.objects.filter(
        female__farm__organization=organization, female__species__code=species_code
    ).exclude(litter__weaning_date__isnull=False)
    ids = [
        b.pk
        for b in births
        if b.birth_date + datetime.timedelta(days=b.expected_weaning_days) <= today
    ]
    n = len(ids)
    if n:
        add(
            f"{n} leitegada{'s' if n > 1 else ''} pronta{'s' if n > 1 else ''} para desmame.",
            "weaning",
            "warning",
            ids,
        )
    ids = [
        b.pk
        for b in births
        if b.total_born > 0 and (b.stillborn + b.mummified) / b.total_born > 0.15
    ]
    n = len(ids)
    if n:
        add(
            f"{n} leitegada{'s' if n > 1 else ''} com mortalidade ao nascer > 15%.",
            "mortality",
            "danger",
            ids,
        )
    batches = with_batch_birth_date(
        AnimalBatch.objects.filter(
            farm__organization=organization, species__code=species_code, status="active"
        )
    )
    nursery = [b for b in batches if b.phase == "creche"]
    ids = [
        b.pk
        for b in nursery
        if b.resolved_birth_date
        and b.resolved_birth_date + datetime.timedelta(days=70) <= today
    ]
    n = len(ids)
    if n:
        add(
            f"{n} lote{'s' if n > 1 else ''} pronto{'s' if n > 1 else ''} para transferência ao crescimento.",
            "nursery-ready",
            ids=ids,
        )
    for batch in nursery:
        if not batch.resolved_birth_date:
            continue
        due = batch.resolved_birth_date + datetime.timedelta(days=70)
        days = (due - today).days
        formatted = due.strftime("%d/%m/%Y")
        text = (
            f"Transferência do lote {batch.batch_code} para crescimento está atrasada desde {formatted}."
            if days < 0
            else f"Transferir o lote {batch.batch_code} para crescimento hoje."
            if days == 0
            else f"Transferir o lote {batch.batch_code} para crescimento em {formatted}."
        )
        alerts.append(
            {
                "text": text,
                "time": f"Há {abs(days)} dias"
                if days < 0
                else "Hoje"
                if days == 0
                else f"Em {days} dias",
                "type": "danger" if days < 0 else "warning" if days == 0 else "info",
                **_event_alert_metadata(
                    species_code, "nursery-to-growth", batch.pk, due
                ),
            }
        )
    ids = [
        b.pk
        for b in batches
        if b.phase == "crescimento" and b.avg_weight_kg and b.avg_weight_kg >= 60
    ]
    n = len(ids)
    if n:
        add(
            f"{n} lote{'s' if n > 1 else ''} com peso ≥60kg — apto{'s' if n > 1 else ''} para transferência à engorda.",
            "growth-ready",
            ids=ids,
        )
    ids = [
        b.pk
        for b in batches
        if b.phase == "engorda" and b.avg_weight_kg and b.avg_weight_kg >= 110
    ]
    n = len(ids)
    if n:
        add(
            f"{n} lote{'s' if n > 1 else ''} pronto{'s' if n > 1 else ''} para venda (≥110kg).",
            "sale-ready",
            ids=ids,
        )
    ids = [b.pk for b in batches if b.phase == "engorda" and not b.avg_weight_kg]
    n = len(ids)
    if n:
        add(
            f"{n} lote{'s' if n > 1 else ''} sem peso registrado.",
            "missing-weight",
            "warning",
            ids,
        )
    return list({alert["alert_key"]: alert for alert in alerts}.values())
