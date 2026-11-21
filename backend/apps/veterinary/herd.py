"""Read-only view of the farm herd inside the Área do veterinário.

The farm segments keep recording reproduction and health; here the area only
consults the organization animals and those records. Admins and managers see
every species; a veterinarian sees the species the admin granted to them.
No cost or price fields are exposed.
"""
from django.db.models import OuterRef, Q, Subquery
from rest_framework.exceptions import NotFound

from apps.livestock.models import (
    Animal, Birth, HealthRecord, HeatRecord, Mating, Pregnancy, Species, VaccinationRecord,
)

PAGE_SIZE = 50


def display(obj, field):
    """Human label of a choice field (falls back to the raw value)."""
    value = getattr(obj, field, "") or ""
    getter = getattr(obj, f"get_{field}_display", None)
    return str(getter()) if value and getter else str(value)


def visible_species(user):
    organization_species = Species.objects.filter(
        Q(animals__farm__organization_id=user.organization_id)
    ).distinct()
    if user.role == "veterinarian":
        return organization_species.filter(pk__in=user.allowed_livestock.values("pk"))
    return organization_species


def _animals(user):
    return Animal.objects.filter(
        farm__organization_id=user.organization_id,
        species__in=visible_species(user),
    )


def animal_list(user, params):
    species = [{"code": row.code, "name": row.name} for row in visible_species(user).order_by("name")]
    queryset = _animals(user).select_related("species", "farm")
    if params.get("species"):
        queryset = queryset.filter(species__code=params["species"])
    if params.get("status", "active") != "all":
        queryset = queryset.filter(status="active")
    search = (params.get("q") or "").strip()
    if search:
        queryset = queryset.filter(Q(identifier__icontains=search) | Q(farm__name__icontains=search))

    last_vaccine = VaccinationRecord.objects.filter(animal=OuterRef("pk")).order_by("-application_date", "-created_at")
    last_health = HealthRecord.objects.filter(animal=OuterRef("pk")).order_by("-application_date", "-created_at")
    open_pregnancy = Pregnancy.objects.filter(female=OuterRef("pk"), status="active").order_by("-start_date")
    last_mating = Mating.objects.filter(female=OuterRef("pk")).order_by("-mating_date")
    queryset = queryset.annotate(
        last_vaccine_name=Subquery(last_vaccine.values("vaccine_name")[:1]),
        last_vaccine_date=Subquery(last_vaccine.values("application_date")[:1]),
        last_health_type=Subquery(last_health.values("treatment_type")[:1]),
        last_health_date=Subquery(last_health.values("application_date")[:1]),
        expected_birth=Subquery(open_pregnancy.values("expected_birth_date")[:1]),
        last_mating_date=Subquery(last_mating.values("mating_date")[:1]),
    ).order_by("species__name", "identifier", "id")

    try:
        page = max(int(params.get("page", 1)), 1)
    except (TypeError, ValueError):
        page = 1
    total = queryset.count()
    rows = queryset[(page - 1) * PAGE_SIZE: page * PAGE_SIZE]
    health_types = dict(HealthRecord._meta.get_field("treatment_type").choices or [])
    return {
        "species": species,
        "count": total,
        "page": page,
        "page_size": PAGE_SIZE,
        "results": [{
            "id": str(animal.pk),
            "identifier": animal.identifier,
            "species": animal.species.code,
            "species_name": animal.species.name,
            "farm_name": animal.farm.name,
            "category": display(animal, "category"),
            "gender": display(animal, "gender"),
            "status": animal.status,
            "reproductive_status": display(animal, "reproductive_status"),
            "birth_date": animal.birth_date.isoformat() if animal.birth_date else None,
            "last_vaccine": {"name": animal.last_vaccine_name, "date": animal.last_vaccine_date.isoformat()} if animal.last_vaccine_date else None,
            "last_health": {"type": health_types.get(animal.last_health_type, animal.last_health_type), "date": animal.last_health_date.isoformat()} if animal.last_health_date else None,
            "expected_birth": animal.expected_birth.isoformat() if animal.expected_birth else None,
            "last_mating": animal.last_mating_date.isoformat() if animal.last_mating_date else None,
        } for animal in rows],
    }


def animal_history(user, animal_id):
    animal = _animals(user).select_related("species", "farm").filter(pk=animal_id).first()
    if not animal:
        raise NotFound()
    events = []
    for mating in Mating.objects.filter(female=animal):
        events.append({"kind": "mating", "date": mating.mating_date, "title": display(mating, "mating_type"),
                       "detail": mating.sire.identifier if mating.sire_id else mating.sire_info, "status": display(mating, "status")})
    for pregnancy in Pregnancy.objects.filter(female=animal):
        events.append({"kind": "pregnancy", "date": pregnancy.start_date, "title": display(pregnancy, "status"),
                       "detail": pregnancy.expected_birth_date.isoformat() if pregnancy.expected_birth_date else "", "status": pregnancy.status})
    for birth in Birth.objects.filter(female=animal):
        events.append({"kind": "birth", "date": birth.birth_date, "title": "",
                       "detail": f"{birth.live_born} / {birth.stillborn}", "status": ""})
    for heat in HeatRecord.objects.filter(animal=animal):
        events.append({"kind": "heat", "date": heat.heat_date, "title": "", "detail": heat.notes or "",
                       "status": "predicted" if heat.is_predicted else ""})
    for vaccine in VaccinationRecord.objects.filter(animal=animal):
        events.append({"kind": "vaccination", "date": vaccine.application_date, "title": vaccine.vaccine_name,
                       "detail": vaccine.next_dose_date.isoformat() if vaccine.next_dose_date else "", "status": vaccine.dose_type or ""})
    for record in HealthRecord.objects.filter(animal=animal):
        events.append({"kind": "health", "date": record.application_date, "title": display(record, "treatment_type"),
                       "detail": record.description or "", "status": record.veterinary or ""})
    events = [event for event in events if event["date"]]
    events.sort(key=lambda event: event["date"], reverse=True)
    for event in events:
        event["date"] = event["date"].isoformat()
    return {
        "id": str(animal.pk),
        "identifier": animal.identifier,
        "species_name": animal.species.name,
        "farm_name": animal.farm.name,
        "reproductive_status": display(animal, "reproductive_status"),
        "events": events,
    }
