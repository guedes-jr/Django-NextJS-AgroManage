"""Outbox snapshots, audit history and guarded queue processing."""

from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from .models import NotificationDelivery, WhatsAppQueueMessage


def queue_notification(delivery):
    from .categories import category_policy
    from .marketing import plain_message
    from .noise import notification_text

    n = delivery.notification
    text = plain_message(n.campaign) if n.campaign_id else notification_text(n)
    policy = category_policy(n.category)
    row, _ = WhatsAppQueueMessage.objects.get_or_create(
        delivery=delivery,
        defaults={
            "organization": n.user.organization,
            "recipient": n.user.full_name,
            "phone": n.user.phone,
            "title": n.title,
            "body": f"*{n.title}*\n{text}",
            "status": delivery.status,
            "attempts": delivery.attempts,
            "last_error": delivery.last_error,
            "delivered_at": delivery.delivered_at,
            "scheduled_for": timezone.now()
            + timedelta(
                minutes=policy.group_similar_minutes
                if n.priority != "urgent" and not n.campaign_id
                else 0
            ),
        },
    )
    if (
        not row.is_edited
        and row.status == "pending"
        and not (row.history and row.history[-1].get("action") == "resend")
    ):
        WhatsAppQueueMessage.objects.filter(
            pk=row.pk, is_edited=False, status="pending"
        ).update(body=f"*{n.title}*\n{text}")
        row.refresh_from_db()
    return row


def sync_delivery(delivery):
    with transaction.atomic():
        row = queue_notification(delivery)
        row = WhatsAppQueueMessage.objects.select_for_update().get(pk=row.pk)
        row.status = delivery.status
        row.attempts = delivery.attempts
        row.last_error = delivery.last_error
        row.delivered_at = delivery.delivered_at
        row.processing_until = delivery.processing_until
        duplicate = bool(
            row.history
            and row.history[-1].get("action") == "attempt"
            and row.history[-1].get("attempt") == delivery.attempts
            and row.history[-1].get("status") == delivery.status
        )
        row.history = (
            row.history
            if duplicate
            else [
                *row.history,
                {
                    "at": timezone.now().isoformat(),
                    "action": "attempt",
                    "status": delivery.status,
                    "attempt": delivery.attempts,
                    "body": row.body,
                    "error": delivery.last_error,
                },
            ]
        )
        row.save()


def dispatch_queue_message(message_id):
    from common.wppconnect import is_configured, is_connected, wpp_request

    from .tasks import dispatch_notification

    with transaction.atomic():
        row = WhatsAppQueueMessage.objects.select_for_update().get(pk=message_id)
        now = timezone.now()
        if row.delivery_id:
            linked = NotificationDelivery.objects.get(pk=row.delivery_id)
            if linked.status not in ["pending", "failed"]:
                sync_delivery(linked)
                return
        if row.status != "pending" or row.scheduled_for > now:
            return
        if row.processing_until:
            if row.processing_until > now:
                return
            row.status = "unknown"
            row.last_error = (
                "Entrega interrompida; confirme o resultado antes de reenviar."
            )
            row.processing_until = None
            if row.delivery_id:
                NotificationDelivery.objects.filter(pk=row.delivery_id).update(
                    status="unknown", processing_until=None
                )
            row.save()
            return
        if row.delivery_id and not operational_message_active(row):
            row.status = "skipped"
            row.last_error = (
                "Alerta confirmado, resolvido, fora da janela de até 3 dias ou do acesso atual do destinatário."
            )
            NotificationDelivery.objects.filter(pk=row.delivery_id).update(
                status="skipped", last_error=row.last_error, processing_until=None
            )
            row.history = [
                *row.history,
                {"action": "skipped", "at": now.isoformat(), "error": row.last_error},
            ]
            row.save()
            return
        state, connection_error = (
            wpp_request("status-session")
            if is_configured()
            else (None, "Integração não configurada")
        )
        if connection_error or not state or not is_connected(state):
            row.last_error = "Aguardando conexão do WhatsApp."
            row.last_enqueued_at = None
            row.save(update_fields=["last_error", "last_enqueued_at", "updated_at"])
            return
        row.processing_until = now + timedelta(minutes=10)
        row.save(update_fields=["processing_until", "updated_at"])
    if row.delivery_id:
        dispatch_notification(
            str(row.delivery.notification_id),
            channels=[NotificationDelivery.Channel.WHATSAPP_WEB],
        )
        return
    row.attempts += 1
    try:
        _, detail = wpp_request(
            "send-message",
            method="POST",
            payload={"phone": row.phone, "isGroup": False, "message": row.body},
        )
        if detail:
            row.status = "unknown"
            row.last_error = (
                "Resultado não confirmado pelo serviço; verifique antes de reenviar."
            )
        else:
            row.status = "sent"
            row.delivered_at = timezone.now()
            row.last_error = ""
    except Exception:  # noqa: BLE001 -- transport outcomes can be ambiguous; never retry blindly
        row.status = "unknown"
        row.last_error = (
            "Resultado não confirmado pelo serviço; verifique antes de reenviar."
        )
    with transaction.atomic():
        current = WhatsAppQueueMessage.objects.select_for_update().get(pk=row.pk)
        current.status = row.status
        current.attempts = row.attempts
        current.last_error = row.last_error
        current.delivered_at = row.delivered_at
        current.processing_until = None
        current.history = [
            *current.history,
            {
                "at": timezone.now().isoformat(),
                "action": "attempt",
                "status": row.status,
                "body": row.body,
                "attempt": row.attempts,
                "error": row.last_error,
            },
        ]
        current.save()


def operational_message_active(row):
    """Do not send automatic reminders after acknowledgement or resolution."""
    if not row.delivery_id:
        return True
    n = row.delivery.notification
    if row.organization_id and (
        n.user.organization_id != row.organization_id
        or not n.user.organization.is_active
    ):
        return False
    # An administrator may explicitly resend historical content; consent and scope
    # are still enforced by dispatch_notification immediately before transport.
    if row.history and row.history[-1].get("action") == "resend":
        return True
    if n.type == "stock" and n.event_key.startswith("inventory.low_stock:"):
        from uuid import UUID

        from django.db.models import Sum

        from apps.inventory.models import ItemEstoque

        try:
            item_id = UUID(n.event_key.split(":", 1)[1])
        except (ValueError, TypeError):
            return False
        item = ItemEstoque.objects.filter(
            pk=item_id,
            organization_id=n.user.organization_id,
            ativo=True,
            estoque_minimo__gt=0,
        ).first()
        if not item:
            return False
        quantity = (
            item.lotes.filter(ativo=True).aggregate(total=Sum("quantidade_atual"))[
                "total"
            ]
            or 0
        )
        return quantity <= item.estoque_minimo
    if not n.event_key.startswith("livestock.operational:"):
        return True
    from apps.livestock.models import AcknowledgedOperationalAlert
    from apps.livestock.operational_alerts import operational_alerts

    from .operational import event_key, within_whatsapp_window

    parts = n.event_key.split(":")
    if len(parts) != 5 or parts[1] != str(n.user.organization_id):
        return False
    if AcknowledgedOperationalAlert.objects.filter(
        user=n.user, organization_id=n.user.organization_id, alert_key=parts[3]
    ).exists():
        return False
    return any(
        within_whatsapp_window(alert)
        and event_key(n.user.organization, parts[2], alert) == n.event_key
        for alert in operational_alerts(n.user.organization, parts[2])
    )
