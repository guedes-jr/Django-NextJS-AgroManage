"""
Sinais para triggers automáticos de notificações.
"""
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver
from django.utils import timezone
from datetime import timedelta
from .models import Notification, NotificationType, NotificationPriority


def create_notification(user, title, message, notif_type=NotificationType.SYSTEM, priority=NotificationPriority.MEDIUM, link=None):
    """Função utilitária para criar notificações"""
    return Notification.objects.create(
        user=user,
        type=notif_type,
        priority=priority,
        title=title,
        message=message,
        link=link or ""
    )


@receiver(post_save, sender="inventory.LoteEstoque")
def check_stock_levels(sender, instance, created, **kwargs):
    """
    Verifica níveis de estoque após alterações em lotes.
    """
    if not instance.item:
        return

    item = instance.item
    organization = item.organization

    if not organization:
        return

    # Calculate total quantity for this item
    from apps.inventory.models import LoteEstoque
    total_qty = sum(
        LoteEstoque.objects.filter(item=item, ativo=True).values_list("quantidade_atual", flat=True)
    )

    # Check minimum stock level
    if item.estoque_minimo and total_qty <= float(item.estoque_minimo):
        # Get all admins/owners of the organization
        from apps.accounts.models import User
        users = User.objects.filter(
            organization=organization,
            role__in=["owner", "admin"]
        )

        title = f"Estoque baixo: {item.nome}"
        message = f"O item {item.nome} está com {total_qty} {item.unidade_medida} (mínimo: {item.estoque_minimo})"

        for user in users:
            # Check if notification already exists in last 24h
            if not Notification.objects.filter(
                user=user,
                title__contains=item.nome,
                created_at__gte=timezone.now() - timedelta(hours=24)
            ).exists():
                create_notification(
                    user=user,
                    title=title,
                    message=message,
                    notif_type=NotificationType.STOCK,
                    priority=NotificationPriority.HIGH,
                    link=f"/home/inventory/{item.id}"
                )

    # Check for low validity items (medications close to expiry)
    if item.categoria in ["medicamento", "vacina"] and instance.data_validade:
        days_until_expiry = (instance.data_validade - timezone.now().date()).days

        if 0 < days_until_expiry <= 30:
            from apps.accounts.models import User
            users = User.objects.filter(organization=organization, role__in=["owner", "admin"])

            title = f"Validade próximo: {item.nome}"
            message = f"O medication {item.nome} vence em {days_until_expiry} dias ({instance.data_validade})"

            for user in users:
                if not Notification.objects.filter(
                    user=user,
                    title__contains=item.nome,
                    created_at__gte=timezone.now() - timedelta(days=7)
                ).exists():
                    create_notification(
                        user=user,
                        title=title,
                        message=message,
                        notif_type=NotificationType.STOCK,
                        priority=NotificationPriority.MEDIUM,
                        link=f"/home/inventory/{item.id}"
                    )


@receiver(post_save, sender="livestock.AnimalBatch")
def check_animal_vaccinations(sender, instance, created, **kwargs):
    """
    Verifica vaccinações pendentes para lotes de animais.
    """
    if not instance.farm:
        return

    organization = instance.farm.organization

    if not organization:
        return

    # Check for vaccinations due (simplified - would need a vaccination schedule model)
    # For now, we'll just notify on batch creation about setting up vaccinations
    if created:
        from apps.accounts.models import User
        users = User.objects.filter(organization=organization, role__in=["owner", "admin"])

        title = f"Novo lote de animais: {instance.batch_code}"
        message = f"Lote de {instance.quantity} {instance.species.name} adicionado à fazenda {instance.farm.name}. Configure o cronograma de vaccinações."

        for user in users:
            create_notification(
                user=user,
                title=title,
                message=message,
                notif_type=NotificationType.ANIMAL,
                priority=NotificationPriority.LOW,
                link=f"/home/livestock/batches/{instance.id}"
            )


@receiver(post_save, sender="finance.Transaction")
def check_transaction_status(sender, instance, created, **kwargs):
    """
    Notifica sobre transações criadas e vencidas.
    """
    if not instance.organization:
        return

    organization = instance.organization

    from apps.accounts.models import User
    users = User.objects.filter(organization=organization, role__in=["owner", "admin"])

    if created:
        title = f"Nova transação: {instance.description}"
        message = f"Transação de R$ {instance.amount} - {instance.get_status_display()}"
        
        for user in users:
            create_notification(
                user=user,
                title=title,
                message=message,
                notif_type=NotificationType.FINANCE,
                priority=NotificationPriority.MEDIUM,
                link=f"/home/finance/transactions/{instance.id}"
            )

    # Check for overdue transactions
    if instance.status == "overdue":
        for user in users:
            if not Notification.objects.filter(
                user=user,
                title__contains=instance.description,
                created_at__gte=timezone.now() - timedelta(days=1)
            ).exists():
                title = f"Transação vencida: {instance.description}"
                message = f"A transação de R$ {instance.amount} está vencida desde {instance.due_date}"
                
                create_notification(
                    user=user,
                    title=title,
                    message=message,
                    notif_type=NotificationType.FINANCE,
                    priority=NotificationPriority.HIGH,
                    link=f"/home/finance/transactions/{instance.id}"
                )


def check_overdue_transactions_task():
    """
    Task para verificar transações vencidas (chamado por Celery).
    """
    from apps.finance.models import Transaction
    from datetime import date
    from django.utils import timezone

    overdue_transactions = Transaction.objects.filter(
        status__in=["pending"],
        due_date__lt=date.today()
    )

    for transaction in overdue_transactions:
        transaction.status = "overdue"
        transaction.save()

        # Trigger notification
        check_transaction_status(sender=Transaction, instance=transaction, created=False)


def check_upcoming_vaccinations_task():
    """
    Task para verificar vaccinações próximas (chamado por Celery).
    """
    # This would need a VaccinationSchedule model to work properly
    # Placeholder for future implementation
    pass