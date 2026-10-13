"""Create a durable WhatsApp delivery for each visible operational event stage."""

from django.db.models import Q
from django.utils import timezone

from .models import Notification, NotificationDelivery, NotificationType


def event_key(organization, species, alert):
    due = alert.get("due_date")
    today = timezone.localdate().isoformat()
    stage = (
        ("scheduled" if due > today else "due" if due == today else "overdue")
        if due
        else "active"
    )
    return f"livestock.operational:{organization.pk}:{species}:{alert['alert_key']}:{stage}"


def collect_operational_notifications():
    from apps.accounts.models import User
    from apps.livestock.models import (
        AcknowledgedOperationalAlert,
        Animal,
        AnimalBatch,
        Species,
    )
    from apps.livestock.operational_alerts import operational_alerts

    from .categories import category_policy
    from .services import NotificationService

    policy = category_policy("animal_cycle")
    if not policy.enabled or not policy.whatsapp_enabled:
        return 0

    users = (
        User.objects.filter(
            is_active=True,
            organization__is_active=True,
            receive_system_alerts=True,
            phone_is_whatsapp=True,
            notification_preference__whatsapp_reproductive_alerts=True,
            notification_preference__animal_alerts=True,
        )
        .select_related("organization", "notification_preference")
        .prefetch_related("allowed_livestock")
    )
    cache = {}
    created = 0
    organization_codes = {}
    for user in users.iterator(chunk_size=100):
        if user.organization_id not in organization_codes:
            organization_codes[user.organization_id] = list(
                Species.objects.filter(
                    Q(
                        pk__in=Animal.objects.filter(
                            farm__organization_id=user.organization_id
                        ).values("species_id")
                    )
                    | Q(
                        pk__in=AnimalBatch.objects.filter(
                            farm__organization_id=user.organization_id
                        ).values("species_id")
                    )
                ).values_list("code", flat=True)
            )
        codes = organization_codes[user.organization_id]
        allowed = (
            [s.code for s in user.allowed_livestock.all()]
            if user.role == "operator"
            else codes
            if user.role in ["admin", "manager"]
            else []
        )
        for code in allowed:
            cache_key = (user.organization_id, code)
            if cache_key not in cache:
                cache[cache_key] = operational_alerts(user.organization, code)
            alerts = cache[cache_key]
            confirmed = set(
                AcknowledgedOperationalAlert.objects.filter(
                    user=user,
                    organization=user.organization,
                    alert_key__in=[a["alert_key"] for a in alerts],
                ).values_list("alert_key", flat=True)
            )
            for alert in alerts:
                if alert["alert_key"] in confirmed:
                    continue
                legacy_key = alert.get("legacy_event_key")
                if (
                    legacy_key
                    and alert.get("due_date", "") <= timezone.localdate().isoformat()
                    and NotificationDelivery.objects.filter(
                        notification__user=user,
                        notification__event_key=legacy_key,
                        channel="whatsapp_web",
                        status__in=["pending", "sent", "unknown"],
                    ).exists()
                ):
                    continue
                key = event_key(user.organization, code, alert)
                existing = Notification.objects.filter(user=user, event_key=key).first()
                if existing:
                    if not existing.deliveries.filter(channel="whatsapp_web").exists():
                        NotificationService.schedule_external_delivery(
                            existing, only_channels=["whatsapp_web"]
                        )
                    continue
                notification = NotificationService.create(
                    user,
                    title=f"Alerta operacional — {alert['text'][:140]}",
                    message=f"{alert['text']}\n{alert['time']}",
                    notif_type=NotificationType.ANIMAL,
                    category="animal_cycle",
                    priority="high"
                    if alert["type"] in ["danger", "error", "warning"]
                    else "medium",
                    link=f"/home/rebanho/{code}",
                    event_key=key,
                    in_app=False,
                    schedule=False,
                )
                if notification:
                    NotificationService.schedule_external_delivery(
                        notification,
                        only_channels=[NotificationDelivery.Channel.WHATSAPP_WEB],
                    )
                    created += 1
    return created
