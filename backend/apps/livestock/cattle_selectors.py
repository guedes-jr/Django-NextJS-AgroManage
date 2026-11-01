"""Read models for the cattle workspace; all queries start with the tenant."""

from decimal import Decimal

from django.db.models import Avg, Count, Q, Sum
from django.utils import timezone

from .models import (
    Animal,
    AnimalBatch,
    CattleManagement,
    CattleMilkRecord, CattleMilkDailyTotal,
    CattlePasture,
    Pregnancy,
)


def cattle_reproduction_groups():
    lactating = Q(cattle_profile__is_lactating=True) | Q(cattle_profile__isnull=True, reproductive_status="lactante")
    female = Q(gender="F")
    return {
        "heifers": female & Q(category="Novilha"),
        "cows": female & Q(category__in=["Vaca", "Matriz"]),
        "lactating": female & lactating,
        "dry": female & Q(category__in=["Vaca", "Matriz"]) & ~lactating & (Q(reproductive_status="descanso") | Q(has_dry_off=True)),
        "open": female & Q(category__in=["Vaca", "Matriz"]) & ~Q(reproductive_status__in=["coberta", "gestante"]) & ~lactating,
        "covered": female & Q(reproductive_status="coberta"),
        "pregnant": female & Q(reproductive_status="gestante"),
        "suckling": female & lactating,
        "calves": Q(category="Bezerro", cattle_profile__weaning_date__isnull=True),
    }


def with_cattle_reproduction(queryset):
    from django.db.models import OuterRef, Subquery, Exists
    from .models import Mating, HistoricoEvento
    return queryset.annotate(
        has_dry_off=Exists(HistoricoEvento.objects.filter(matriz_id=OuterRef("pk"), tipo_evento="Secagem", data_evento__lte=timezone.localdate())),
        last_mating_date=Subquery(Mating.objects.filter(female_id=OuterRef("pk")).order_by("-mating_date", "-created_at").values("mating_date")[:1]),
        expected_birth_date=Subquery(Pregnancy.objects.filter(female_id=OuterRef("pk"), status="ongoing").order_by("-start_date", "-created_at").values("expected_birth_date")[:1]),
        pregnancy_start_date=Subquery(Pregnancy.objects.filter(female_id=OuterRef("pk"), status="ongoing").order_by("-start_date", "-created_at").values("start_date")[:1]),
    )


def cattle_overview(organization, farm=None, production=None):
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
    from .cattle_improvements import filter_purpose
    animals, batches = filter_purpose(animals, production), filter_purpose(batches, production)
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
    daily_totals = CattleMilkDailyTotal.objects.filter(farm__organization=organization, date__gte=today.replace(day=1), date__lte=today)
    if farm:
        daily_totals = daily_totals.filter(farm_id=farm)
    aggregate_totals = daily_totals.aggregate(produced=Sum("liters"), discarded=Sum("discarded_liters"))
    milk_totals = {key: (milk_totals[key] or Decimal(0)) + (aggregate_totals[key] or Decimal(0)) for key in ("produced", "discarded")}
    pastures = CattlePasture.objects.filter(farm__organization=organization)
    if farm:
        pastures = pastures.filter(farm_id=farm)
    from .cattle_operations import cattle_agenda, agenda_row
    # Keep the overview bounded, with separate space for upcoming and overdue work.
    today_events = list(cattle_agenda(organization, farm, "today", production=production)[:8])
    upcoming_events = list(cattle_agenda(organization, farm, "upcoming", production=production)[:8])
    overdue_events = list(cattle_agenda(organization, farm, "overdue", production=production)[:4])
    agenda = [agenda_row(row) for row in [*today_events, *upcoming_events, *overdue_events]]
    agenda_count = cattle_agenda(organization, farm, production=production).count()
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
    animals = animals.filter(cattle_purpose__in=["dairy", "dual"])
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
    daily_totals = CattleMilkDailyTotal.objects.filter(farm__organization=organization, date=day)
    if farm:
        daily_totals = daily_totals.filter(farm_id=farm)
    aggregate_totals = daily_totals.aggregate(produced=Sum("liters"), discarded=Sum("discarded_liters"), total_count=Count("pk"))
    has_total = aggregate_totals["total_count"] > 0
    volumes["produced"] = (volumes["produced"] or Decimal(0)) + (aggregate_totals["produced"] or Decimal(0))
    volumes["discarded"] = (volumes["discarded"] or Decimal(0)) + (aggregate_totals["discarded"] or Decimal(0))
    produced = volumes["produced"] or Decimal(0)
    discarded = volumes["discarded"] or Decimal(0)
    return {**counts, "date": day, "herd_as_of": timezone.localdate(),
            "produced_liters": produced, "discarded_liters": discarded,
            "usable_liters": produced - discarded, "milked_cows": None if has_total else volumes["milked_cows"],
            "average_per_milked_cow": produced / volumes["milked_cows"] if volumes["milked_cows"] and not has_total else None}


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
