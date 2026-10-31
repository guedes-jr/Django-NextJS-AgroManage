"""Read models for the cattle workspace; all queries start with the tenant."""

from decimal import Decimal

from django.db.models import Avg, Count, Q, Sum
from django.utils import timezone

from .models import (
    Animal,
    AnimalBatch,
    CattleManagement,
    CattleMilkRecord,
    CattlePasture,
    Pregnancy,
)


def cattle_overview(organization, farm=None):
    if farm:
        from rest_framework import serializers

        farm = serializers.UUIDField().run_validation(farm)
    animals = Animal.objects.filter(
        farm__organization=organization, species__code="bovinos", status="active"
    )
    batches = AnimalBatch.objects.filter(
        farm__organization=organization, species__code="bovinos", status="active"
    )
    if farm:
        animals = animals.filter(farm_id=farm)
        batches = batches.filter(farm_id=farm)
    standalone = animals.filter(batch__isnull=True)
    categories = {}
    for row in batches.values("category").annotate(total=Sum("quantity")):
        categories[row["category"] or "Sem categoria"] = row["total"]
    for row in standalone.values("category").annotate(total=Count("id")):
        key = row["category"] or "Sem categoria"
        categories[key] = categories.get(key, 0) + row["total"]
    today = timezone.localdate()
    milk = CattleMilkRecord.objects.filter(
        animal__farm__organization=organization,
        date__gte=today.replace(day=1),
        date__lte=today,
    )
    if farm:
        milk = milk.filter(animal__farm_id=farm)
    milk_totals = milk.aggregate(
        produced=Sum("liters"), discarded=Sum("discarded_liters")
    )
    pastures = CattlePasture.objects.filter(farm__organization=organization)
    if farm:
        pastures = pastures.filter(farm_id=farm)
    from .cattle_operations import cattle_agenda, agenda_row
    # Keep the overview bounded, with separate space for upcoming and overdue work.
    today_events = list(cattle_agenda(organization, farm, "today")[:8])
    upcoming_events = list(cattle_agenda(organization, farm, "upcoming")[:8])
    overdue_events = list(cattle_agenda(organization, farm, "overdue")[:4])
    agenda = [agenda_row(row) for row in [*today_events, *upcoming_events, *overdue_events]]
    agenda_count = cattle_agenda(organization, farm).count()
    return {
        "total_head": sum(categories.values()),
        "identified_animals": animals.count(),
        "active_batches": batches.count(),
        "pregnant_females": animals.filter(
            gender="F", reproductive_status="gestante"
        ).count(),
        "lactating_females": animals.filter(
            Q(cattle_profile__is_lactating=True)
            | Q(cattle_profile__isnull=True, reproductive_status="lactante"),
            gender="F",
        ).count(),
        "average_identified_weight": animals.aggregate(value=Avg("current_weight_kg"))[
            "value"
        ],
        "milk_produced_month": milk_totals["produced"] or Decimal(0),
        "milk_discarded_month": milk_totals["discarded"] or Decimal(0),
        "milk_usable_month": (milk_totals["produced"] or Decimal(0))
        - (milk_totals["discarded"] or Decimal(0)),
        "pasture_area_ha": pastures.aggregate(total=Sum("area_ha"))["total"]
        or Decimal(0),
        "categories": [
            {"category": key, "quantity": value}
            for key, value in sorted(categories.items())
        ],
        "agenda": agenda,
        "agenda_count": agenda_count,
    }


def dairy_overview(organization, day, farm=None):
    animals = Animal.objects.filter(farm__organization=organization, species__code="bovinos", status="active")
    milk = CattleMilkRecord.objects.filter(animal__farm__organization=organization, animal__species__code="bovinos", date=day)
    if farm:
        animals = animals.filter(farm_id=farm)
        milk = milk.filter(animal__farm_id=farm)
    lactating = Q(gender="F") & (Q(cattle_profile__is_lactating=True) | Q(cattle_profile__isnull=True, reproductive_status="lactante"))
    cows = Q(gender="F", category__in=["Vaca", "Matriz"])
    counts = animals.aggregate(
        lactating_cows=Count("pk", filter=lactating),
        total_cows=Count("pk", filter=cows),
        non_lactating_cows=Count("pk", filter=cows & ~lactating),
        young_females=Count("pk", filter=Q(gender="F", category__in=["Bezerro", "Novilha"])),
        bulls=Count("pk", filter=Q(gender="M", category__in=["Touro", "Reprodutor"])),
    )
    volumes = milk.aggregate(produced=Sum("liters"), discarded=Sum("discarded_liters"), milked_cows=Count("animal_id", distinct=True))
    produced = volumes["produced"] or Decimal(0)
    discarded = volumes["discarded"] or Decimal(0)
    return {**counts, "date": day, "herd_as_of": timezone.localdate(),
            "produced_liters": produced, "discarded_liters": discarded,
            "usable_liters": produced - discarded, "milked_cows": volumes["milked_cows"],
            "average_per_milked_cow": produced / volumes["milked_cows"] if volumes["milked_cows"] else None}


def milk_withdrawal_for(animal, day):
    from .models import CattleManagementEntry

    return CattleManagementEntry.objects.filter(
        animal=animal,
        management__status="confirmed",
        management__kind="sanitary",
        management__date__lte=day,
        management__milk_withdrawal_until__gte=day,
    ).exists()


def cattle_withdrawals(queryset):
    """Correlated subqueries keep withdrawal dates from multiplying animal rows."""
    from django.db.models import DateField, OuterRef, Subquery

    from .models import CattleManagementEntry

    applications = CattleManagementEntry.objects.filter(
        animal_id=OuterRef("pk"),
        management__status="confirmed",
        management__kind="sanitary",
        management__date__lte=timezone.localdate(),
    )
    return queryset.annotate(
        **{
            field: Subquery(
                applications.exclude(**{f"management__{field}": None})
                .order_by(f"-management__{field}")
                .values(f"management__{field}")[:1],
                output_field=DateField(),
            )
            for field in ("milk_withdrawal_until", "meat_withdrawal_until")
        }
    )
