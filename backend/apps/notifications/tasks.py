"""
Tarefas Celery para notificações.
"""
import base64
import json
import logging
import re
import uuid
from datetime import timedelta

from celery import shared_task
from common.wppconnect import is_configured, wpp_request
from django.db import transaction as db_transaction
from django.utils import timezone

logger = logging.getLogger(__name__)


def _whatsapp_phone(phone):
    """Return a Brazilian phone number suitable for WPPConnect, or an empty value."""
    raw_phone = (phone or "").strip()
    digits = re.sub(r"\D", "", raw_phone)
    if raw_phone.startswith("+") and not digits.startswith("55"):
        return ""
    if len(digits) in (10, 11):
        digits = f"55{digits}"
    return digits if len(digits) in (12, 13) and digits.startswith("55") else ""


def _send_whatsapp_web(notification, delivery=None):
    from .marketing import plain_message
    from .models import NotificationDelivery, NotificationPreference
    from .noise import notification_text

    marketing = getattr(notification, "campaign_id", None) is not None
    allowed = NotificationPreference.objects.filter(user=notification.user, **({'marketing_alerts': True} if marketing else {'whatsapp_reproductive_alerts': True})).exists()
    if not notification.user.receive_system_alerts or not notification.user.phone_is_whatsapp or not allowed:
        return False, "Integração WhatsApp: o usuário não autorizou alertas neste contato."
    if marketing:
        recipient = notification.marketing_recipient
        if _whatsapp_phone(notification.user.phone) != recipient.whatsapp_phone or notification.campaign.status == 'cancelled' or not recipient.whatsapp or not recipient.organization or not recipient.organization.is_active or notification.user.organization_id != recipient.organization_id or notification.user.role not in notification.campaign.audience_filters.get('roles', []):
            return False, "Integração WhatsApp: destinatário ou campanha não elegível."
    phone = _whatsapp_phone(notification.user.phone)
    if not is_configured() or not phone:
        return False, "Integração WhatsApp não configurada ou usuário sem telefone brasileiro válido."
    message = plain_message(notification.campaign) if marketing else notification_text(notification)
    from .whatsapp_queue import queue_notification
    queued = queue_notification(delivery) if delivery else None
    if queued and queued.phone != phone:
        queued.phone=phone
        queued.save(update_fields=['phone','updated_at'])
    parts = [('send-message', {'message': queued.body if queued else f"*{notification.title}*\n{message}"})]
    if marketing:
        for asset in notification.campaign.images.order_by('created_at', 'pk'):
            with asset.image.open('rb') as source:
                encoded = base64.b64encode(source.read()).decode('ascii')
            parts.append(('send-file-base64', {'filename': asset.image.name.rsplit('/', 1)[-1], 'caption': '', 'base64': f'data:{asset.mime_type};base64,{encoded}'}))
    for index, (endpoint, payload) in enumerate(parts):
        if delivery and index < delivery.parts_sent:
            continue
        _, detail = wpp_request(endpoint, method="POST", payload={'phone': phone, 'isGroup': False, **payload})
        if detail:
            return False, detail
        if delivery:
            delivery.parts_sent = index + 1
            NotificationDelivery.objects.filter(pk=delivery.pk, attempt_token=delivery.attempt_token).update(parts_sent=delivery.parts_sent)
    return True, ""


@shared_task(bind=True)
def dispatch_notification(self, notification_id, channels=None):
    """Entrega uma notificação pendente nos canais externos configurados."""
    from django.conf import settings

    from .operator_scope import event_allowed
    from .categories import channel_allowed
    from .emails import EmailNotificationService
    from .models import Notification, NotificationDelivery, PushSubscription
    from .services import NotificationService

    notification = Notification.objects.select_related("user", "campaign", "marketing_recipient__organization").get(pk=notification_id)
    deliveries = notification.deliveries.filter(status__in=[NotificationDelivery.Status.PENDING, NotificationDelivery.Status.FAILED])
    if channels is not None:
        deliveries = deliveries.filter(channel__in=channels)
    for candidate in deliveries:
        with db_transaction.atomic():
            delivery = NotificationDelivery.objects.select_for_update().get(pk=candidate.pk)
            if delivery.status not in ('pending', 'failed') or delivery.processing_until and delivery.processing_until > timezone.now():
                continue
            if delivery.processing_until:
                delivery.status = 'unknown'
                delivery.last_error = 'Entrega interrompida: confirme o resultado antes de reenviar.'
                delivery.save(update_fields=['status', 'last_error', 'updated_at'])
                continue
            delivery.processing_until = timezone.now() + timedelta(minutes=10)
            delivery.attempt_token = uuid.uuid4()
            delivery.attempts += 1
            delivery.save(update_fields=['processing_until', 'attempt_token', 'attempts', 'updated_at'])
        if delivery.channel == NotificationDelivery.Channel.WHATSAPP_WEB:
            from .whatsapp_queue import queue_notification
            from .models import WhatsAppQueueMessage
            queued=queue_notification(delivery)
            WhatsAppQueueMessage.objects.filter(pk=queued.pk).update(processing_until=delivery.processing_until)
        delivery.last_error = ""
        try:
            if not event_allowed(notification.user, notification.category, notification.event_key) or not notification.user.is_active or not NotificationService.should_notify(notification.user, notification.type, notification.category) or not channel_allowed(notification, delivery.channel):
                delivery.status = NotificationDelivery.Status.SKIPPED
                delivery.last_error = "Entrega suspensa pelas preferências do usuário ou pela configuração da categoria."
                delivery.save(update_fields=("attempts", "status", "last_error", "updated_at"))
                if delivery.channel == NotificationDelivery.Channel.WHATSAPP_WEB:
                    from .whatsapp_queue import sync_delivery
                    sync_delivery(delivery)
                continue
            if delivery.channel == NotificationDelivery.Channel.EMAIL:
                sent = EmailNotificationService.send_notification_email(notification.user, notification)
                if not sent:
                    delivery.status = NotificationDelivery.Status.SKIPPED
                else:
                    delivery.status = NotificationDelivery.Status.SENT
                    delivery.delivered_at = timezone.now()
            elif delivery.channel == NotificationDelivery.Channel.WEB_PUSH:
                private_key = getattr(settings, "WEB_PUSH_VAPID_PRIVATE_KEY", "")
                subject = getattr(settings, "WEB_PUSH_VAPID_SUBJECT", "mailto:contato@agromanage.com")
                subscriptions = PushSubscription.objects.filter(user=notification.user, is_active=True)
                if not private_key or not subscriptions.exists():
                    delivery.status = NotificationDelivery.Status.SKIPPED
                else:
                    from pywebpush import WebPushException, webpush
                    sent_any = False
                    payload = json.dumps({"title": notification.title, "body": notification.message, "link": notification.link or "/home/notifications"})
                    for subscription in subscriptions:
                        try:
                            webpush(
                                subscription_info={"endpoint": subscription.endpoint, "keys": {"p256dh": subscription.p256dh, "auth": subscription.auth}},
                                data=payload,
                                vapid_private_key=private_key,
                                vapid_claims={"sub": subject},
                            )
                            sent_any = True
                        except WebPushException as exc:
                            if getattr(exc.response, "status_code", None) in (404, 410):
                                subscription.is_active = False
                                subscription.save(update_fields=("is_active", "updated_at"))
                            else:
                                raise
                    delivery.status = NotificationDelivery.Status.SENT if sent_any else NotificationDelivery.Status.SKIPPED
                    delivery.delivered_at = timezone.now() if sent_any else None
            elif delivery.channel == NotificationDelivery.Channel.WHATSAPP_WEB:
                sent, detail = _send_whatsapp_web(notification, delivery)
                if sent:
                    delivery.status = NotificationDelivery.Status.SENT
                    delivery.delivered_at = timezone.now()
                elif detail.startswith("Integração WhatsApp"):
                    delivery.status = NotificationDelivery.Status.SKIPPED
                    delivery.last_error = detail
                else:
                    raise RuntimeError(detail)
        except Exception:  # noqa: BLE001 - transport outcome may be ambiguous; never resend blindly
            delivery.status = NotificationDelivery.Status.UNKNOWN
            delivery.processing_until = None
            delivery.last_error = "Resultado não confirmado pelo serviço; reenvio automático suspenso."
            delivery.save(update_fields=("attempts", "status", "last_error", "delivered_at", "processing_until", "updated_at"))
            logger.warning("Entrega %s sem confirmação", delivery.pk)
            if delivery.channel == NotificationDelivery.Channel.WHATSAPP_WEB:
                from .whatsapp_queue import sync_delivery
                sync_delivery(delivery)
            continue
        delivery.processing_until = None
        delivery.save(update_fields=("attempts", "status", "last_error", "delivered_at", "processing_until", "updated_at"))
        if delivery.channel == NotificationDelivery.Channel.WHATSAPP_WEB:
            from .whatsapp_queue import sync_delivery
            sync_delivery(delivery)
    return deliveries.count()


@shared_task
def send_daily_notifications_digest():
    """
    Envia resumo diário para todos os usuários com preferência daily.
    """
    from apps.accounts.models import User

    from .emails import EmailNotificationService

    users = User.objects.filter(
        receive_system_alerts=True,
        notification_preference__frequency="daily",
        notification_preference__email_notifications=True
    )

    for user in users:
        EmailNotificationService.send_daily_digest(user)

    return f"Enviado resumo diário para {users.count()} usuários"


@shared_task
def send_weekly_notifications_digest():
    """
    Envia resumo semanal para todos os usuários com preferência weekly.
    """
    from apps.accounts.models import User

    from .emails import EmailNotificationService

    users = User.objects.filter(
        receive_system_alerts=True,
        notification_preference__frequency="weekly",
        notification_preference__email_notifications=True
    )

    for user in users:
        EmailNotificationService.send_weekly_digest(user)

    return f"Enviado resumo semanal para {users.count()} usuários"


@shared_task
def check_overdue_transactions_notifications():
    """
    Verifica faturas vencidas e cria notificações.
    """

    from apps.finance.models import Transaction

    from .services import NotificationService
    overdue_transactions = Transaction.objects.filter(
        status="pending",
        due_date__lt=timezone.localdate()
    )

    for transaction in overdue_transactions:
        transaction.status = "overdue"
        transaction.save(update_fields=("status", "updated_at"))

        organization = transaction.organization
        if not organization:
            continue

        title = f"Lançamento vencido: {transaction.description}"
        message = f"O lançamento de R$ {transaction.amount} está vencido desde {transaction.due_date}"

        NotificationService.create_for_organization(
            organization=organization,
            title=title,
            message=message,
            notif_type="finance",
            priority="high",
            link="/home/financeiro",
            event_key=f"finance.transaction.overdue:{transaction.id}",
        )

    return f"Verificados {overdue_transactions.count()} lançamentos vencidos"


@shared_task
def check_stock_levels_notifications():
    """
    Verifica níveis de estoque e cria notificações.
    """
    from django.db.models import Sum

    from apps.inventory.models import ItemEstoque, LoteEstoque

    from .services import NotificationService

    items = ItemEstoque.objects.filter(estoque_minimo__gt=0)

    for item in items:
        total_qty = LoteEstoque.objects.filter(item=item).aggregate(
            total=Sum("quantidade_atual")
        )["total"] or 0

        if total_qty <= float(item.estoque_minimo):
            organization = item.organization
            if not organization:
                continue

            title = f"Estoque baixo: {item.nome}"
            message = f"O item {item.nome} está com {total_qty} {item.unidade_medida} (mínimo: {item.estoque_minimo})"

            NotificationService.create_for_organization(
                organization=organization,
                title=title,
                message=message,
                notif_type="stock",
                priority="high",
                link="/home/estoque/produtos",
                event_key=f"inventory.low_stock:{item.id}",
            )

    return f"Verificados {items.count()} itens de estoque"


@shared_task
def check_reproductive_vaccine_notifications():
    """Gera avisos das vacinas reprodutivas que chegaram à data programada."""
    from .services import NotificationService

    created = NotificationService.create_due_reproductive_vaccine_notifications()
    return f"Criadas {created} notificações de vacina reprodutiva"


@shared_task
def cleanup_old_notifications(days: int = 30):
    """
    Remove notificações antigas (lidas) após X dias.
    """
    from .models import Notification

    cutoff_date = timezone.now() - timedelta(days=days)
    
    deleted_count = Notification.objects.filter(
        is_read=True,
        created_at__lt=cutoff_date
    ).delete()[0]

    return f"Removidas {deleted_count} notificações antigas"


@shared_task
def process_marketing_outbox():
    from .marketing import prepare_campaign
    from .models import MarketingCampaign, NotificationDelivery
    for campaign_id in MarketingCampaign.objects.filter(status__in=['queued', 'processing']).values_list('pk', flat=True)[:20]:
        prepare_campaign(campaign_id)
    # A fixed-size durable delivery queue also recovers broker interruptions.
    ids = NotificationDelivery.objects.filter(notification__campaign__isnull=False, status='pending').values_list('notification_id', flat=True).distinct()[:50]
    for notification_id in ids:
        dispatch_notification.delay(str(notification_id))


@shared_task
def check_operational_notifications():
    from .operational import collect_operational_notifications
    created=collect_operational_notifications()
    check_stock_levels_notifications()
    return {'created':created}


@shared_task
def send_whatsapp_queue_message(message_id):
    from .whatsapp_queue import dispatch_queue_message
    dispatch_queue_message(message_id)


@shared_task
def process_whatsapp_outbox():
    from django.db.models import Q
    from common.wppconnect import is_configured, is_connected, wpp_request
    from .models import WhatsAppQueueMessage, NotificationDelivery
    from .whatsapp_queue import queue_notification, dispatch_queue_message
    now=timezone.now()
    for delivery in NotificationDelivery.objects.filter(channel='whatsapp_web',status='pending',whatsapp_message__isnull=True).select_related('notification__user__organization','notification__campaign')[:100]:
        queue_notification(delivery)
    expired=WhatsAppQueueMessage.objects.filter(status='pending',processing_until__lte=now).values_list('pk',flat=True)[:100]
    for pk in list(expired):
        dispatch_queue_message(pk)
    state,detail=wpp_request('status-session') if is_configured() else (None,'Integração não configurada')
    if detail or not state or not is_connected(state):
        return {'queued':0,'waiting_connection':True}
    eligible=Q(last_enqueued_at__isnull=True)|Q(last_enqueued_at__lte=now-timedelta(minutes=2))
    ids=list(WhatsAppQueueMessage.objects.filter(eligible,status='pending',processing_until__isnull=True,scheduled_for__lte=now).order_by('scheduled_for').values_list('pk',flat=True)[:100])
    queued=0
    for pk in ids:
        with db_transaction.atomic():
            row=WhatsAppQueueMessage.objects.select_for_update().get(pk=pk)
            if row.status!='pending' or row.processing_until or (row.last_enqueued_at and row.last_enqueued_at>now-timedelta(minutes=2)):
                continue
            row.last_enqueued_at=now;row.save(update_fields=['last_enqueued_at','updated_at'])
        try:
            send_whatsapp_queue_message.delay(str(pk));queued+=1
        except Exception:  # noqa: BLE001 -- durable queue recovers broker unavailability
            WhatsAppQueueMessage.objects.filter(pk=pk,last_enqueued_at=now).update(last_enqueued_at=None)
            logger.warning('Não foi possível enfileirar o processamento WhatsApp.')
    return {'queued':queued}
