"""Dispatch eligible Telegram deliveries with a durable retry schedule."""
import json
import re
import uuid
from contextlib import closing
from datetime import timedelta
from http.client import HTTPException, HTTPSConnection

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from .categories import channel_allowed
from .models import NotificationDelivery
from .operational import livestock_alert_active
from .operator_scope import event_allowed
from .telegram import bot_username


def telegram_delivery_configured():
    return (
        settings.TELEGRAM_DELIVERY_ENABLED
        and bool(settings.TELEGRAM_PILOT_ORGANIZATIONS)
        and bool(bot_username())
        and bool(re.fullmatch(r"[0-9]+:[A-Za-z0-9_-]+", settings.TELEGRAM_BOT_TOKEN))
    )


def telegram_recipient(user):
    connection = getattr(user, "telegramconnection", None)
    preference = getattr(user, "notification_preference", None)
    if (
        user.organization_id and user.organization.slug in settings.TELEGRAM_PILOT_ORGANIZATIONS
        and connection and connection.bot_username == bot_username() and preference
        and preference.telegram_reproductive_alerts and preference.animal_alerts
    ):
        if user.contacts is None and not user.phone_is_telegram:
            return connection.chat_id
        from .tasks import _whatsapp_phone

        phone = _whatsapp_phone(user.notification_contact("telegram"))
        if phone and connection.verified_phone == phone:
            return connection.chat_id
    return None


def _send_message(chat_id, path):
    payload = json.dumps({
        "chat_id": chat_id,
        "text": f"Você tem um alerta de reprodução ou vacinação no AgroManage.\n{settings.FRONTEND_URL.rstrip('/')}{path}",
        "link_preview_options": {"is_disabled": True},
    })
    with closing(HTTPSConnection("api.telegram.org", timeout=8)) as connection:
        connection.request(
            "POST", f"/bot{settings.TELEGRAM_BOT_TOKEN}/sendMessage", payload,
            {"Content-Type": "application/json"},
        )
        response = connection.getresponse()
        try:
            data = json.loads(response.read(65536))
        except ValueError:
            data = {}
        data = data if isinstance(data, dict) else {}
        if response.status == 200 and data.get("ok") is True:
            return "sent", "", None
        if response.status == 429:
            parameters = data.get("parameters")
            retry_after = parameters.get("retry_after") if isinstance(parameters, dict) else None
            delay = max(1, retry_after) if type(retry_after) is int and retry_after < 2**31 else 60
            return "pending", "Limite de envio do Telegram.", delay
        if response.status in (400, 403, 404):
            return "failed", "O Telegram recusou o destinatário ou a configuração.", None
        if response.status == 401:
            return "failed", "Falha de autenticação com o Telegram.", None
        return "unknown", "O Telegram não confirmou a entrega.", None


def dispatch_telegram_delivery(delivery_id):
    if not telegram_delivery_configured():
        return
    with transaction.atomic():
        delivery = NotificationDelivery.objects.select_for_update().filter(
            pk=delivery_id, channel=NotificationDelivery.Channel.TELEGRAM, status="pending",
        ).first()
        now = timezone.now()
        if not delivery or not delivery.telegram_send_after or delivery.telegram_send_after > now:
            return
        if delivery.processing_until:
            if delivery.processing_until > now:
                return
            delivery.status = "unknown"
            delivery.last_error = "Processamento interrompido. Resultado do envio incerto."
            delivery.processing_until = None
            delivery.save(update_fields=["status", "last_error", "processing_until", "updated_at"])
            return
        delivery.processing_until = now + timedelta(minutes=10)
        delivery.attempt_token = uuid.uuid4()
        delivery.attempts += 1
        delivery.save(update_fields=["processing_until", "attempt_token", "attempts", "updated_at"])

    notification = delivery.notification
    user = notification.user
    chat_id = telegram_recipient(user)
    try:
        if (
            not telegram_delivery_configured() or not chat_id or not user.is_active
            or not user.receive_system_alerts or not user.organization_id
            or not user.organization.is_active or user.organization.recovery_isolated
            or user.role not in ("admin", "manager", "operator")
            or notification.category != "animal_cycle" or notification.campaign_id
            or not notification.event_key.startswith("livestock.operational:")
            or not channel_allowed(notification, delivery.channel)
            or not event_allowed(user, notification.category, notification.event_key)
            or not livestock_alert_active(notification, telegram_only=True)
        ):
            result, detail, retry_after = "skipped", "Alerta ou destinatário não elegível.", None
        else:
            path = notification.link or ""
            if not re.fullmatch(r"/home/seguimento/[a-z0-9-]+", path):
                path = "/home"
            result, detail, retry_after = _send_message(chat_id, path)
    except (HTTPException, OSError, ValueError):
        result, detail, retry_after = "unknown", "O Telegram não confirmou a entrega.", None

    now = timezone.now()
    if result == "pending" and delivery.attempts >= 5:
        result, retry_after = "failed", None
    NotificationDelivery.objects.filter(
        pk=delivery.pk, status="pending", attempt_token=delivery.attempt_token,
    ).update(
        status=result, last_error=detail, processing_until=None,
        telegram_send_after=now + timedelta(seconds=retry_after) if retry_after else None,
        delivered_at=now if result == "sent" else None,
        updated_at=now,
    )
