"""
Daily WhatsApp summary of the Área do veterinário returns (Recursos dos segmentos › WhatsApp).

One message per user and day, from 07:00, with what is late, due today and in the next three
days. Users opt in with the same reproductive WhatsApp alerts preference used by the herd.
"""
from datetime import timedelta

from django.utils import timezone

SEND_FROM_HOUR = 7
MAX_LINES = 12


def _lines(organization, today):
    from apps.tasks.agenda import VAGENDA_LABELS

    from .models import VeterinaryAlert

    alerts = (
        VeterinaryAlert.objects.filter(organization=organization, done=False, date__lte=today + timedelta(days=3))
        .select_related("animal", "client").order_by("date", "created_at")
    )
    late = due = soon = 0
    lines = []
    for alert in alerts:
        if alert.date < today:
            late += 1
            when = f"atrasado desde {alert.date:%d/%m}"
        elif alert.date == today:
            due += 1
            when = "hoje"
        else:
            soon += 1
            when = f"{alert.date:%d/%m}"
        if len(lines) < MAX_LINES:
            lines.append(f"• {VAGENDA_LABELS.get(alert.kind, alert.kind)} · {alert.animal.identifier} ({alert.client.name}) · {when}")
    return late, due, soon, lines, alerts.count()


def collect_veterinary_notifications(now=None):
    from apps.accounts.models import User
    from apps.notifications.models import Notification, NotificationDelivery, NotificationType
    from apps.notifications.services import NotificationService
    from apps.organizations import segment_features as features

    from .access import veterinary_enabled, veterinary_members_q

    now = timezone.localtime(now)
    if now.hour < SEND_FROM_HOUR:
        return 0
    today = now.date()
    users = User.objects.filter(
        veterinary_members_q(), is_active=True, organization__is_active=True, receive_system_alerts=True, phone_is_whatsapp=True,
        notification_preference__whatsapp_reproductive_alerts=True,
    ).select_related("organization")
    created = 0
    summaries = {}
    for user in users.iterator(chunk_size=100):
        organization = user.organization
        if organization.pk not in summaries:
            on = veterinary_enabled(organization) and features.enabled(organization, features.VETERINARY, features.WHATSAPP)
            summaries[organization.pk] = _lines(organization, today) if on else None
        summary = summaries[organization.pk]
        if not summary or not summary[4]:
            continue
        key = f"veterinary.daily:{organization.pk}:{today.isoformat()}"
        if Notification.objects.filter(user=user, event_key=key).exists():
            continue
        late, due, soon, lines, total = summary
        more = f"\n… e mais {total - len(lines)}" if total > len(lines) else ""
        notification = NotificationService.create(
            user,
            title=f"Área do veterinário — {late} atrasado(s), {due} hoje, {soon} nos próximos 3 dias",
            message="\n".join(lines) + more,
            notif_type=NotificationType.ANIMAL, category="animal_cycle", priority="high" if late else "medium",
            link="/home/veterinario?aba=al", event_key=key, in_app=True, schedule=False,
        )
        if notification:
            NotificationService.schedule_external_delivery(notification, only_channels=[NotificationDelivery.Channel.WHATSAPP_WEB])
            created += 1
    return created
