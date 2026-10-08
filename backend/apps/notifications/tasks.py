"""
Tarefas Celery para notificações.
"""
from celery import shared_task
from django.utils import timezone
from datetime import timedelta
import json
import logging
import re
from urllib import error, request

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


def _send_whatsapp_web(notification):
    """Deliver a transactional reproductive alert through a local WPPConnect Server."""
    from django.conf import settings

    base_url = getattr(settings, "WPP_CONNECT_URL", "").rstrip("/")
    token = getattr(settings, "WPP_CONNECT_TOKEN", "")
    session = getattr(settings, "WPP_CONNECT_SESSION", "")
    phone = _whatsapp_phone(notification.user.phone)
    if not base_url or not token or not session or not phone:
        return False, "Integração WhatsApp não configurada ou usuário sem telefone brasileiro válido."

    payload = json.dumps({
        "phone": phone,
        "isGroup": False,
        "message": f"*{notification.title}*\n{notification.message}",
    }).encode("utf-8")
    outbound = request.Request(
        f"{base_url}/api/{session}/send-message",
        data=payload,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json; charset=utf-8"},
        method="POST",
    )
    try:
        with request.urlopen(outbound, timeout=getattr(settings, "WPP_CONNECT_TIMEOUT_SECONDS", 15)) as response:
            if 200 <= response.status < 300:
                return True, ""
            return False, f"WPPConnect respondeu HTTP {response.status}."
    except error.HTTPError as exc:
        return False, f"WPPConnect respondeu HTTP {exc.code}."
    except error.URLError as exc:
        return False, f"Não foi possível conectar ao WPPConnect: {exc.reason}"


@shared_task(bind=True, autoretry_for=(Exception,), retry_backoff=True, retry_kwargs={"max_retries": 3})
def dispatch_notification(self, notification_id):
    """Entrega uma notificação pendente nos canais externos configurados."""
    from django.conf import settings
    from .emails import EmailNotificationService
    from .models import Notification, NotificationDelivery, PushSubscription

    notification = Notification.objects.select_related("user").get(pk=notification_id)
    deliveries = notification.deliveries.filter(status__in=[NotificationDelivery.Status.PENDING, NotificationDelivery.Status.FAILED])
    for delivery in deliveries:
        delivery.attempts += 1
        delivery.last_error = ""
        try:
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
                sent, detail = _send_whatsapp_web(notification)
                if sent:
                    delivery.status = NotificationDelivery.Status.SENT
                    delivery.delivered_at = timezone.now()
                elif detail.startswith("Integração WhatsApp"):
                    delivery.status = NotificationDelivery.Status.SKIPPED
                    delivery.last_error = detail
                else:
                    raise RuntimeError(detail)
        except Exception as exc:
            delivery.status = NotificationDelivery.Status.FAILED
            delivery.last_error = str(exc)[:2000]
            delivery.save(update_fields=("attempts", "status", "last_error", "delivered_at", "updated_at"))
            raise
        delivery.save(update_fields=("attempts", "status", "last_error", "delivered_at", "updated_at"))
    return deliveries.count()


@shared_task
def send_daily_notifications_digest():
    """
    Envia resumo diário para todos os usuários com preferência daily.
    """
    from apps.accounts.models import User
    from .emails import EmailNotificationService

    users = User.objects.filter(
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

    from datetime import date
    overdue_transactions = Transaction.objects.filter(
        status="pending",
        due_date__lt=date.today()
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
    from apps.inventory.models import ItemEstoque, LoteEstoque
    from .services import NotificationService
    from django.db.models import Sum

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
