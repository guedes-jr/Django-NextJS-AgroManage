"""Create a durable WhatsApp delivery for each visible operational event stage."""

from datetime import date, timedelta
from uuid import UUID

from django.conf import settings
from django.db.models import Q
from django.utils import timezone

from .models import Notification, NotificationDelivery, NotificationType


def within_whatsapp_window(alert):
    """Dated operational reminders start three local calendar days before due."""
    due = alert.get("due_date")
    if not due:
        return True
    try:
        return date.fromisoformat(due) <= timezone.localdate() + timedelta(days=3)
    except (TypeError, ValueError):
        return False


def event_key(organization, species, alert):
    due = alert.get("due_date")
    today = timezone.localdate().isoformat()
    stage = (
        ("upcoming_3d" if due > today else "due" if due == today else "overdue")
        if due
        else "active"
    )
    return f"livestock.operational:{organization.pk}:{species}:{alert['alert_key']}:{stage}"


def telegram_livestock_alert_allowed(user, alert):
    from apps.livestock.models import Birth, Litter, Mating

    from .operator_scope import authorized_events

    prefix, _, source_id = (alert.get("legacy_event_key") or "").partition(":")
    model = {
        "livestock.reproductive_vaccine.birth": Birth,
        "livestock.reproductive_vaccine.mating": Mating,
        "livestock.next_mating": Litter,
    }.get(prefix)
    if model is None:
        return False
    try:
        pk = UUID(source_id)
    except ValueError:
        return False
    return authorized_events(model, user).filter(pk=pk).exists()


def livestock_alert_active(notification, *, telegram_only=False):
    if not notification.event_key.startswith("livestock.operational:"):
        return True
    from apps.livestock.models import AcknowledgedOperationalAlert
    from apps.livestock.operational_alerts import operational_alerts

    parts = notification.event_key.split(":")
    if len(parts) != 5 or parts[1] != str(notification.user.organization_id):
        return False
    if AcknowledgedOperationalAlert.objects.filter(
        user=notification.user, organization_id=notification.user.organization_id, alert_key=parts[3]
    ).exists():
        return False
    return any(
        within_whatsapp_window(alert)
        and event_key(notification.user.organization, parts[2], alert) == notification.event_key
        and (not telegram_only or telegram_livestock_alert_allowed(notification.user, alert))
        for alert in operational_alerts(notification.user.organization, parts[2])
    )


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
    from .telegram_delivery import telegram_delivery_configured, telegram_recipient

    policy = category_policy("animal_cycle")
    telegram_enabled = policy.telegram_enabled and telegram_delivery_configured()
    if not policy.enabled or not (policy.whatsapp_enabled or telegram_enabled):
        return 0

    recipients = Q(pk__in=[])
    if policy.whatsapp_enabled:
        recipients |= Q(phone_is_whatsapp=True, notification_preference__whatsapp_reproductive_alerts=True)
    if telegram_enabled:
        from .telegram import bot_username

        recipients |= Q(
            organization__slug__in=settings.TELEGRAM_PILOT_ORGANIZATIONS,
            notification_preference__telegram_reproductive_alerts=True,
            telegramconnection__bot_username=bot_username(),
            telegramconnection__chat_id__isnull=False,
        )
    users = (
        User.objects.filter(
            recipients,
            is_active=True,
            organization__is_active=True,
            organization__recovery_isolated=False,
            receive_system_alerts=True,
            notification_preference__animal_alerts=True,
        )
        .select_related("organization", "notification_preference", "telegramconnection")
        .prefetch_related("allowed_livestock")
    )
    cache = {}
    created = 0
    organization_codes = {}
    switches = {}

    def whatsapp_on(organization, code):
        """Configurações › Recursos dos segmentos: species without the option stay on."""
        from apps.organizations import segment_features as features

        segment = features.species_segment(code)
        if segment is None:
            return True
        key = (organization.pk, segment)
        if key not in switches:
            switches[key] = features.enabled(organization, segment, features.WHATSAPP)
        return switches[key]
    for user in users.iterator(chunk_size=100):
        telegram_chat = telegram_recipient(user) if telegram_enabled else None
        whatsapp_opted_in = (
            policy.whatsapp_enabled and user.phone_is_whatsapp
            and user.notification_preference.whatsapp_reproductive_alerts
        )
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
            whatsapp_allowed = whatsapp_opted_in and whatsapp_on(user.organization, code)
            if not whatsapp_allowed and not telegram_chat:
                continue
            cache_key = (user.organization_id, code)
            if cache_key not in cache:
                cache[cache_key] = [
                    alert for alert in operational_alerts(user.organization, code)
                    if within_whatsapp_window(alert)
                ]
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
                skip_whatsapp = (
                    whatsapp_allowed and legacy_key
                    and alert.get("due_date", "") <= timezone.localdate().isoformat()
                    and NotificationDelivery.objects.filter(
                        notification__user=user,
                        notification__event_key=legacy_key,
                        channel="whatsapp_web",
                        status__in=["pending", "sent", "unknown"],
                    ).exists()
                )
                channels = []
                if whatsapp_allowed and not skip_whatsapp:
                    channels.append(NotificationDelivery.Channel.WHATSAPP_WEB)
                if telegram_chat and telegram_livestock_alert_allowed(user, alert):
                    channels.append(NotificationDelivery.Channel.TELEGRAM)
                if not channels:
                    continue
                key = event_key(user.organization, code, alert)
                existing = Notification.objects.filter(user=user, event_key=key).first()
                if existing:
                    pending_channels = set(channels) - set(existing.deliveries.values_list("channel", flat=True))
                    if pending_channels:
                        NotificationService.schedule_external_delivery(existing, policy=policy, only_channels=pending_channels)
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
                    link="/home/seguimento/gado-de-corte" if code == "bovinos" else f"/home/seguimento/{code}",
                    event_key=key,
                    in_app=False,
                    schedule=False,
                )
                if notification:
                    NotificationService.schedule_external_delivery(
                        notification,
                        policy=policy, only_channels=channels,
                    )
                    created += 1
    return created
