"""Tenant-scoped milk production read models; volumes never mix entry modes."""
from django.db.models import Q, Sum, Exists, OuterRef, Subquery, DecimalField
from .models import Animal, CattleMilkRecord, CattleMilkDailyTotal


def milk_totals_covering(queryset, start, end=None):
    """Periods are booked on their end date; overlapping entry modes stay exclusive."""
    from django.db.models.functions import Coalesce
    return queryset.annotate(effective_start=Coalesce('period_start', 'date')).filter(effective_start__lte=end or start, date__gte=start)


def milk_day_summary(organization, day, farm=None):
    from .cattle_selectors import dairy_overview
    result = dairy_overview(organization, day, farm)
    cows = milk_cows(organization, day, farm)
    # Aggregate entries carry no individual head count. Never invent a per-cow mean.
    has_total = milk_totals_covering(CattleMilkDailyTotal.objects.filter(farm__organization=organization, **({'farm_id': farm} if farm else {})), day).exists()
    return {**result, "expected_cows": cows.count(),
            "milked_cows": None if has_total else result["milked_cows"],
            "average_per_milked_cow": None if has_total else result["average_per_milked_cow"],
            "pending_cows": None if has_total else cows.filter(day_liters__isnull=True).count(),
            "aggregate_mode": has_total}


def milk_cows(organization, day, farm=None):
    records = CattleMilkRecord.objects.filter(animal_id=OuterRef("pk"), date=day)
    volumes = records.order_by().values("animal_id").annotate(total=Sum("liters")).values("total")
    totals = milk_totals_covering(CattleMilkDailyTotal.objects.filter(farm_id=OuterRef("farm_id")), day)
    cows = Animal.objects.filter(farm__organization=organization, species__code="bovinos", gender="F", category__in=["Vaca", "Matriz"])
    if farm:
        cows = cows.filter(farm_id=farm)
    return cows.annotate(
        has_milk=Exists(records), has_daily_total=Exists(totals),
        day_liters=Subquery(volumes[:1], output_field=DecimalField(max_digits=11, decimal_places=2)),
    ).filter(Q(has_milk=True) | (Q(status="active", cattle_purpose__in=["dairy", "dual"]) & (Q(cattle_profile__is_lactating=True) | Q(cattle_profile__isnull=True, reproductive_status="lactante")))).select_related("farm", "breed", "cattle_profile").order_by("identifier", "id")


def milk_cow_row(animal):
    profile = getattr(animal, "cattle_profile", None)
    return {"id": str(animal.pk), "identifier": animal.identifier,
            "name": profile.name if profile else "", "farm": str(animal.farm_id),
            "farm_name": animal.farm.name, "breed_name": animal.breed.name if animal.breed else "",
            "is_lactating": profile.is_lactating if profile else animal.reproductive_status == "lactante",
            "liters": animal.day_liters,
            "entry_status": "total" if animal.has_daily_total else "recorded" if animal.has_milk else "pending"}
