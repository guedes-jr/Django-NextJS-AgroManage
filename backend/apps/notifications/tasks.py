"""
Tarefas Celery para notificações.
"""
from celery import shared_task
from django.utils import timezone
from datetime import timedelta


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
def check_overdue_invoices_notifications():
    """
    Verifica faturas vencidas e cria notificações.
    """
    from apps.finance.models import Invoice
    from .services import NotificationService

    from datetime import date
    overdue_invoices = Invoice.objects.filter(
        status__in=["pending", "sent"],
        due_date__lt=date.today()
    )

    for invoice in overdue_invoices:
        invoice.status = "overdue"
        invoice.save()

        organization = invoice.organization
        if not organization:
            continue

        title = f"Fatura vencida: {invoice.invoice_number}"
        message = f"A fatura de R$ {invoice.total_amount} está vencida desde {invoice.due_date}"

        NotificationService.create_for_organization(
            organization=organization,
            title=title,
            message=message,
            notif_type="finance",
            priority="high",
            link=f"/home/finance/invoices/{invoice.id}"
        )

    return f"Verificadas {overdue_invoices.count()} faturas vencidas"


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
            total=Sum("quantidade")
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
                link=f"/home/inventory/{item.id}"
            )

    return f"Verificados {items.count()} itens de estoque"


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