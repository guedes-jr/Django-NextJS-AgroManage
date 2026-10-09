"""Read models and session metadata for the platform WhatsApp panel."""
from django.contrib.auth import get_user_model
from django.db.models import Count
from django.utils import timezone

from apps.notifications.models import NotificationDelivery
from apps.notifications.tasks import _whatsapp_phone
from common.wppconnect import wpp_request


def connected_account():
    data, detail = wpp_request("host-device")
    if detail:
        return {"account": None, "detail": detail}
    profile = data.get("response")
    if not isinstance(profile, dict):
        return {"account": None, "detail": "O serviço não disponibilizou os dados da conta."}
    number = profile.get("phoneNumber") or profile.get("id") or ""
    if isinstance(number, dict):
        number = number.get("user") or number.get("_serialized") or ""
    phone = str(number).split("@")[0].split(":")[0]
    name = profile.get("pushname") or profile.get("name") or ""
    return {"account": {"name": name if isinstance(name, str) else "", "phone": phone if phone.isdigit() else ""}, "detail": ""}


def alert_overview():
    users = get_user_model().objects.filter(
        is_active=True, organization__isnull=False,
        notification_preference__whatsapp_reproductive_alerts=True,
        notification_preference__animal_alerts=True,
    )
    opted_in = users.count()
    eligible = 0
    invalid_phone = 0
    for phone, role in users.values_list("phone", "role").iterator():
        if not _whatsapp_phone(phone):
            invalid_phone += 1
        elif role in ("owner", "admin"):
            # Scheduled reproductive events use create_for_organization's default roles.
            eligible += 1
    deliveries = NotificationDelivery.objects.filter(channel=NotificationDelivery.Channel.WHATSAPP_WEB)
    counts = {value: 0 for value in NotificationDelivery.Status.values}
    counts.update({row["status"]: row["total"] for row in deliveries.values("status").annotate(total=Count("id"))})
    return {
        "checked_at": timezone.now().isoformat(),
        "opted_in_users": opted_in, "eligible_users": eligible,
        "invalid_phone_users": invalid_phone,
        "alert_types": ["Vacinas reprodutivas programadas", "Próxima cobertura"],
        "counts": counts,
    }


def alert_deliveries(status=""):
    queryset = NotificationDelivery.objects.filter(
        channel=NotificationDelivery.Channel.WHATSAPP_WEB,
    ).select_related("notification__user__organization").order_by("-created_at", "-id")
    return queryset.filter(status=status) if status else queryset


def delivery_row(delivery):
    notification = delivery.notification
    user = notification.user
    return {
        "id": str(delivery.id), "title": notification.title,
        "recipient": user.full_name, "phone": user.phone,
        "organization": user.organization.name if user.organization else "",
        "status": delivery.status, "attempts": delivery.attempts,
        "last_error": delivery.last_error, "created_at": delivery.created_at,
        "delivered_at": delivery.delivered_at, "updated_at": delivery.updated_at,
    }
