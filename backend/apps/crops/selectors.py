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

    estimated_revenue = plantation.estimated_revenue or Decimal("0")
    estimated_production = plantation.estimated_production_kg or Decimal("0")
    estimated_bags = plantation.estimated_bags or Decimal("0")

    cost_per_ha = (investment / area).quantize(Decimal("0.01")) if area else Decimal("0")
    estimated_revenue_per_ha = (estimated_revenue / area).quantize(Decimal("0.01")) if area else Decimal("0")
    estimated_profit = (estimated_revenue - investment).quantize(Decimal("0.01"))
    estimated_profit_per_ha = (estimated_profit / area).quantize(Decimal("0.01")) if area else Decimal("0")
    estimated_roi = ((estimated_profit / investment) * 100).quantize(Decimal("0.01")) if investment else Decimal("0")

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
        "estimated_production_kg": str(estimated_production),
        "estimated_bags": str(estimated_bags),
        "population": plantation.population,
        "spacing": plantation.spacing or "",
        "responsible_name": plantation.responsible_user.full_name if plantation.responsible_user else "",
    }


def get_crops_dashboard(organization):
    """Return aggregated KPIs for all plantations in the organization."""
    from decimal import Decimal
    from django.db.models import Sum, Count, Q
    from django.utils import timezone

    qs = PlantingCycle.objects.filter(organization=organization)
    today = timezone.now().date()

    total_active = qs.exclude(status__in=["finished", "cancelled"]).count()
    total_plantations = qs.count()
    total_area = (
        qs.aggregate(total=Sum("planted_area_ha"))["total"] or Decimal("0")
    )
    total_investment = (
        qs.aggregate(total=Sum("investment_total"))["total"] or Decimal("0")
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
    plantations_with_investment = qs.filter(investment_total__gt=0)
    if plantations_with_investment.exists():
        total_profit = sum(
            (p.estimated_revenue or Decimal("0")) - p.investment_total
            for p in plantations_with_investment
        )
        total_inv = sum(p.investment_total for p in plantations_with_investment)
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
