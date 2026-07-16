from django.db import models


RETRYABLE_TASKS = {
    "apps.notifications.tasks.send_daily_notifications_digest",
    "apps.notifications.tasks.send_weekly_notifications_digest",
    "apps.notifications.tasks.check_stock_levels_notifications",
}


def active_maintenance_window():
    from django.utils import timezone
    from .models import MaintenanceWindow

    now = timezone.now()
    return MaintenanceWindow.objects.filter(
        is_active=True, starts_at__lte=now
    ).filter(models.Q(ends_at__isnull=True) | models.Q(ends_at__gt=now)).first()
