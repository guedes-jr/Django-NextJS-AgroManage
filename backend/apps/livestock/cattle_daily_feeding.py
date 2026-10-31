"""Today's feeding workboard, without financial information or historical guesses."""
from django.db.models import Prefetch
from django.utils import timezone

from .cattle_operations import feed_forecast, feed_plans
from .models import CattleGrazing, CattleFeedDelivery


def daily_feeding(organization):
    today = timezone.localdate()
    plans = feed_plans().filter(
        batch__farm__organization=organization, batch__status="active", batch__species__code="bovinos",
        is_active=True, start_date__lte=today,
    ).exclude(end_date__lt=today).prefetch_related(
        Prefetch("batch__grazings", queryset=CattleGrazing.objects.filter(
            exit_date__isnull=True,
        ).select_related("pasture"), to_attr="today_grazings"),
        Prefetch("deliveries", to_attr="today_deliveries",
                 queryset=CattleFeedDelivery.objects.filter(date=today).select_related("created_by").order_by("created_at")),
    ).order_by("batch__farm__name", "batch__batch_code", "item__nome", "id")
    rows = []
    for plan in plans:
        deliveries = plan.today_deliveries
        supplied = sum(row.quantity_kg for row in deliveries)
        forecast = feed_forecast(plan, today)
        rows.append({
            "id": str(plan.pk), "farm_name": plan.batch.farm.name,
            "batch_code": plan.batch.batch_code, "head_count": plan.batch.quantity,
            "pasture": ", ".join(row.pasture.name for row in plan.batch.today_grazings) or None,
            "item_name": plan.item.nome, "kg_per_head_day": plan.kg_per_head_day,
            "daily_requirement_kg": forecast["daily_requirement_kg"],
            "supplied_kg": supplied, "forecast": forecast,
            "deliveries": [{"id": str(row.pk), "quantity_kg": row.quantity_kg,
                            "remaining_before_kg": row.remaining_before_kg,
                            "recorded_by": row.created_by.full_name if row.created_by else "",
                            "created_at": row.created_at, "notes": row.notes} for row in deliveries],
        })
    return {"date": today, "results": rows}
