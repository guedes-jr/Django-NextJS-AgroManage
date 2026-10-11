"""Aggregate notification metrics without loading recipient records."""

from datetime import datetime, time, timedelta

from django.db.models import Avg, Count, DurationField, ExpressionWrapper, F, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone

from .models import Notification, NotificationDailyGuard, NotificationDelivery


def notification_metrics(days, category="", channel=""):
    since = timezone.make_aware(
        datetime.combine(timezone.localdate() - timedelta(days=days - 1), time.min)
    )
    notifications = Notification.objects.filter(created_at__gte=since)
    guard = NotificationDailyGuard.objects.filter(day__gte=since.date())
    if category:
        notifications = notifications.filter(category=category)
        guard = guard.filter(category=category)
    deliveries = NotificationDelivery.objects.filter(notification__in=notifications)
    if channel:
        deliveries = deliveries.filter(channel=channel)
    counts = {
        row["status"]: row["total"]
        for row in deliveries.values("status").annotate(total=Count("pk"))
    }
    settled = sum(counts.get(status, 0) for status in ("sent", "failed", "unknown"))
    latency = deliveries.filter(status="sent").aggregate(
        value=Avg(
            ExpressionWrapper(
                F("delivered_at") - F("created_at"), output_field=DurationField()
            )
        )
    )["value"]
    return {
        "days": days,
        "notifications": notifications.count(),
        "in_app": notifications.filter(show_in_app=True).count(),
        "read": notifications.filter(show_in_app=True, is_read=True).count(),
        "statuses": counts,
        "success_rate": round(counts.get("sent", 0) * 100 / settled, 1)
        if settled
        else None,
        "average_seconds": round(latency.total_seconds(), 1) if latency else None,
        "stale_pending": deliveries.filter(
            status="pending", created_at__lt=timezone.now() - timedelta(minutes=30)
        ).count(),
        "channels": list(
            deliveries.values("channel", "status").annotate(total=Count("pk"))
        ),
        "categories": list(
            deliveries.values("notification__category", "status").annotate(
                total=Count("pk")
            )
        ),
        "daily": list(
            deliveries.annotate(day=TruncDate("created_at"))
            .values("day", "status")
            .annotate(total=Count("pk"))
            .order_by("day")
        ),
        "noise": guard.aggregate(
            duplicates=Sum("duplicate_count"),
            grouped=Sum("grouped_count"),
            limited=Sum("limited_count"),
        ),
    }
