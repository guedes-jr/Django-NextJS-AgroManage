"""
Read-side query functions for the crops app.
"""
from decimal import Decimal

from django.db.models import Sum


def get_plantation_dashboard(plantation):
    """Return dashboard data for a single plantation."""
    from django.utils import timezone

    today = timezone.now().date()
    days_cultivation = (plantation.actual_harvest_date or today) - plantation.planting_date
    days_remaining = None
    if plantation.expected_harvest_date:
        diff = (plantation.expected_harvest_date - today).days
        days_remaining = max(diff, 0)

    area = plantation.planted_area_ha or plantation.field.area_ha or Decimal("1")
    investment = plantation.investment_total
    real_revenue = (
        plantation.finance_transactions.filter(category__category_type="revenue")
        .exclude(status="cancelled")
        .aggregate(total=Sum("amount"))["total"]
        or Decimal("0")
    )
    # Expenses come from the operation records (same base as investment_total),
    # not from finance mirrors that may be outdated.
    real_expenses = investment

    estimated_revenue = plantation.estimated_revenue or Decimal("0")
    estimated_production = plantation.estimated_production_kg or Decimal("0")
    estimated_bags = plantation.estimated_bags or Decimal("0")

    cost_per_ha = (investment / area).quantize(Decimal("0.01")) if area else Decimal("0")
    estimated_revenue_per_ha = (estimated_revenue / area).quantize(Decimal("0.01")) if area else Decimal("0")
    estimated_profit = (estimated_revenue - investment).quantize(Decimal("0.01"))
    estimated_profit_per_ha = (estimated_profit / area).quantize(Decimal("0.01")) if area else Decimal("0")
    estimated_roi = ((estimated_profit / investment) * 100).quantize(Decimal("0.01")) if investment else Decimal("0")
    real_profit = (real_revenue - real_expenses).quantize(Decimal("0.01"))

    return {
        "id": plantation.id,
        "name": str(plantation),
        "crop_name": plantation.crop_name,
        "crop_type_display": plantation.get_crop_type_display(),
        "field_name": plantation.field.name,
        "farm_name": plantation.farm.name if plantation.farm else "",
        "variety": plantation.variety or "",
        "area_ha": str(area),
        "planting_date": plantation.planting_date.isoformat(),
        "expected_harvest_date": plantation.expected_harvest_date.isoformat() if plantation.expected_harvest_date else None,
        "actual_harvest_date": plantation.actual_harvest_date.isoformat() if plantation.actual_harvest_date else None,
        "status": plantation.status,
        "status_display": plantation.get_status_display(),
        "days_in_cultivation": days_cultivation.days,
        "days_remaining": days_remaining,
        "investment_total": str(investment),
        "cost_per_ha": str(cost_per_ha),
        "estimated_revenue": str(estimated_revenue),
        "estimated_revenue_per_ha": str(estimated_revenue_per_ha),
        "estimated_profit": str(estimated_profit),
        "estimated_profit_per_ha": str(estimated_profit_per_ha),
        "estimated_roi": str(estimated_roi),
        "real_profit": str(real_profit),
        "estimated_production_kg": str(estimated_production),
        "estimated_bags": str(estimated_bags),
        "population": plantation.population,
        "spacing": plantation.spacing or "",
        "responsible_name": plantation.responsible_user.full_name if plantation.responsible_user else "",
    }


def get_crops_dashboard(organization):
    """Return aggregated KPIs for all plantations in the organization."""
    from decimal import Decimal
    from django.db.models import Sum, Count
    from django.utils import timezone
    from .models import PlantingCycle

    qs = PlantingCycle.objects.filter(organization=organization)
    today = timezone.now().date()

    total_active = qs.exclude(status__in=["finished", "cancelled"]).count()
    total_plantations = qs.count()
    total_area = (
        qs.aggregate(total=Sum("planted_area_ha"))["total"] or Decimal("0")
    )
    # investment_total é uma propriedade calculada a partir de transações e
    # operações relacionadas, não um campo do banco que possa receber Sum().
    plantations = list(qs)
    investments = [(plantation, plantation.investment_total) for plantation in plantations]
    total_investment = sum(
        (investment for _, investment in investments), Decimal("0")
    )
    total_estimated_revenue = (
        qs.aggregate(total=Sum("estimated_revenue"))["total"] or Decimal("0")
    )
    total_estimated_production = (
        qs.aggregate(total=Sum("estimated_production_kg"))["total"] or Decimal("0")
    )

    status_counts = dict(
        qs.values_list("status").annotate(count=Count("id"))
    )

    upcoming_harvests = qs.filter(
        expected_harvest_date__gte=today,
        expected_harvest_date__lte=today + timezone.timedelta(days=30),
        status__in=["growing", "management", "harvesting"],
    ).count()

    crop_type_counts = dict(
        qs.values_list("crop_type").annotate(count=Count("id"))
    )

    avg_roi = Decimal("0")
    plantations_with_investment = [
        (plantation, investment)
        for plantation, investment in investments
        if investment > 0
    ]
    if plantations_with_investment:
        total_profit = sum(
            (plantation.estimated_revenue or Decimal("0")) - investment
            for plantation, investment in plantations_with_investment
        )
        total_inv = sum(
            (investment for _, investment in plantations_with_investment),
            Decimal("0"),
        )
        if total_inv:
            avg_roi = (total_profit / total_inv * 100).quantize(Decimal("0.01"))

    return {
        "total_plantations": total_plantations,
        "total_active": total_active,
        "total_area_ha": str(total_area.quantize(Decimal("0.01"))),
        "total_investment": str(total_investment.quantize(Decimal("0.01"))),
        "total_estimated_revenue": str(total_estimated_revenue.quantize(Decimal("0.01"))),
        "total_estimated_production_kg": str(total_estimated_production.quantize(Decimal("0.01"))),
        "avg_roi": str(avg_roi),
        "upcoming_harvests": upcoming_harvests,
        "status_counts": status_counts,
        "crop_type_counts": crop_type_counts,
    }


def get_plantation_indicators(plantation):
    """Return financial and productive indicators for a plantation."""
    area = plantation.planted_area_ha or plantation.field.area_ha or Decimal("1")
    investment = plantation.investment_total
    cost_per_ha = (investment / area).quantize(Decimal("0.01")) if area else Decimal("0")
    estimated_revenue = plantation.estimated_revenue or Decimal("0")
    estimated_profit = (estimated_revenue - investment).quantize(Decimal("0.01"))
    estimated_roi = ((estimated_profit / investment) * 100).quantize(Decimal("0.01")) if investment else Decimal("0")

    return {
        "investment_total": str(investment),
        "cost_per_ha": str(cost_per_ha),
        "area_ha": str(area),
        "estimated_revenue": str(estimated_revenue),
        "estimated_profit": str(estimated_profit),
        "estimated_roi": str(estimated_roi),
        "estimated_production_kg": str(plantation.estimated_production_kg or "0"),
        "estimated_bags": str(plantation.estimated_bags or "0"),
    }


def operation_costs(cycles, start=None, end=None):
    """Cost of crop operations per (cycle id, finance category) from the records.

    The single source for every crop cost screen: the same cost each operation
    page shows (pesticides include their equipment), plus harvest packing. Dates
    use the operation date; ``start``/``end`` are optional inclusive bounds.
    """
    from collections import defaultdict

    from . import models as crop_models
    from .finance_sync import SPECS

    def in_range(day):
        return day is not None and (start is None or day >= start) and (end is None or day <= end)

    totals = defaultdict(Decimal)
    for spec in SPECS:
        queryset = getattr(crop_models, spec.model_name).objects.filter(plantation__in=cycles)
        if spec.model_name == "PesticideApplication":
            queryset = queryset.prefetch_related("equipments")
        for record in queryset:
            if in_range(spec.date(record)):
                cost = spec.cost(record)
                if cost:
                    totals[(record.plantation_id, spec.category)] += cost
    for harvest in crop_models.Harvest.objects.filter(planting_cycle__in=cycles, packing_cost__gt=0):
        if in_range(harvest.harvest_date):
            totals[(harvest.planting_cycle_id, "Embalagem")] += harvest.packing_cost
    return totals


AUTOMATIC_REFERENCE_PREFIXES = (
    "PLANTING-", "FERTILIZATION-", "FERTIGATION-", "PESTICIDE-", "IRRIGATION-",
    "LANDPREP-", "LABOR-", "HARVEST-PACK-",
)


def manual_expense_filter():
    """Q that excludes the finance mirrors of crop operations (keeps manual entries)."""
    from django.db.models import Q

    automatic = Q()
    for prefix in AUTOMATIC_REFERENCE_PREFIXES:
        automatic |= Q(reference__startswith=prefix)
    return ~(automatic & ~Q(reference__startswith="LABOR-SWINE-"))


SALE_LOW_BALANCE_RATIO = Decimal("0.20")


def _weighted_average(pairs):
    total_count = sum((count for count, _ in pairs), Decimal("0"))
    if not total_count:
        return None
    return sum((count * weight for count, weight in pairs), Decimal("0")) / total_count


def sale_availability(organization):
    """Harvested − sold balance of each plantation, for the sales screen.

    Everything with a known weight is netted in kg: kg and tons, and sacks,
    boxes, bales… whose weight comes from the harvest (package weight of a
    packed harvest, or the unit weight informed at harvest time). A sale of
    800 sacks of a harvest packed in 30 kg sacks takes 24.000 kg from the
    balance. Units without a known weight keep their own balance.

    ``unit_weights`` gives kg per sale unit so the screen can show the
    remaining balance in the unit being sold. ``level`` is "ok" (> 20% of the
    harvested quantity left), "low" (≤ 20%) or "none" (nothing left).
    """
    from collections import defaultdict

    from .models import CropSale, Harvest, PlantingCycle

    harvested = defaultdict(Decimal)
    weights = defaultdict(lambda: defaultdict(list))  # cycle -> unit -> [(count, kg per unit)]
    for harvest in Harvest.objects.filter(planting_cycle__organization=organization).only(
        "planting_cycle_id", "quantity", "quantity_unit", "unit_weight_kg", "yield_kg",
        "packaged", "package_type", "package_weight_kg", "package_count",
    ):
        cycle_id = harvest.planting_cycle_id
        unit = harvest.quantity_unit or "kg"
        quantity = harvest.quantity if harvest.quantity is not None else harvest.yield_kg
        packed_kg = (
            Decimal(harvest.package_count) * harvest.package_weight_kg
            if harvest.packaged and harvest.package_count and harvest.package_weight_kg
            else None
        )
        if packed_kg:
            weights[cycle_id][harvest.package_type].append((Decimal(harvest.package_count), harvest.package_weight_kg))
        if unit != "kg" and quantity and harvest.unit_weight_kg:
            weights[cycle_id][unit].append((quantity, harvest.unit_weight_kg))

        kg = harvest.yield_kg or packed_kg
        if kg:
            harvested[(cycle_id, "kg")] += kg
        elif quantity:
            harvested[(cycle_id, unit)] += quantity

    unit_weights = {
        cycle_id: {unit: _weighted_average(pairs) for unit, pairs in units.items() if _weighted_average(pairs)}
        for cycle_id, units in weights.items()
    }

    sold = defaultdict(Decimal)
    for row in CropSale.objects.filter(organization=organization).values("planting_cycle_id", "quantity", "unit"):
        cycle_id, unit, quantity = row["planting_cycle_id"], row["unit"], row["quantity"]
        if unit == CropSale.Unit.TON:
            unit, quantity = "kg", quantity * 1000
        weight = unit_weights.get(cycle_id, {}).get(unit)
        if unit != "kg" and weight and not harvested.get((cycle_id, unit)):
            unit, quantity = "kg", quantity * weight
        sold[(cycle_id, unit)] += quantity

    result = []
    cycles = PlantingCycle.objects.filter(organization=organization).select_related("field").order_by("crop_name", "name")
    for cycle in cycles:
        units = sorted(
            {unit for (cycle_id, unit) in [*harvested, *sold] if cycle_id == cycle.id},
            key=lambda unit: (unit != "kg", unit),
        )
        balances = []
        for unit in units:
            done, gone = harvested[(cycle.id, unit)], sold[(cycle.id, unit)]
            available = done - gone
            if available <= 0 or done <= 0:
                level = "none"
            elif available <= done * SALE_LOW_BALANCE_RATIO:
                level = "low"
            else:
                level = "ok"
            balances.append({
                "unit": unit, "harvested": str(done), "sold": str(gone),
                "available": str(available), "level": level,
            })
        result.append({
            "planting_cycle": str(cycle.id), "name": cycle.name, "crop_name": cycle.crop_name,
            "field_name": cycle.field.name if cycle.field_id else "", "status": cycle.status,
            "balances": balances,
            "unit_weights": {
                unit: str(weight.quantize(Decimal("0.01")))
                for unit, weight in unit_weights.get(cycle.id, {}).items()
            },
        })
    return result
