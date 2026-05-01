"""
Serviços para criação de notificações.
"""
from django.utils import timezone
from datetime import timedelta
from .models import Notification, NotificationType, NotificationPriority
from .models import NotificationPreference


class NotificationService:
    """Serviço centralizado para criar notificações"""

    @staticmethod
    def create(user, title, message, notif_type=NotificationType.SYSTEM, priority=NotificationPriority.MEDIUM, link=None):
        """Cria uma notificação para o usuário"""
        return Notification.objects.create(
            user=user,
            type=notif_type,
            priority=priority,
            title=title,
            message=message,
            link=link or ""
        )

    @staticmethod
    def create_for_organization(organization, title, message, notif_type=NotificationType.SYSTEM, priority=NotificationPriority.MEDIUM, link=None, roles=None):
        """Cria notificações para todos os usuários de uma organização"""
        if roles is None:
            roles = ["owner", "admin"]

        from apps.accounts.models import User
        users = User.objects.filter(organization=organization, role__in=roles)

        notifications = []
        for user in users:
            notifications.append(
                Notification.objects.create(
                    user=user,
                    type=notif_type,
                    priority=priority,
                    title=title,
                    message=message,
                    link=link or ""
                )
            )
        return notifications

    @staticmethod
    def create_bulk(users, title, message, notif_type=NotificationType.SYSTEM, priority=NotificationPriority.MEDIUM, link=None):
        """Cria notificações em bulk para múltiplos usuários"""
        from django.contrib.auth import get_user_model
        User = get_user_model()

        notifications = []
        for user in users:
            notifications.append(
                Notification(
                    user=user,
                    type=notif_type,
                    priority=priority,
                    title=title,
                    message=message,
                    link=link or ""
                )
            )
        return Notification.objects.bulk_create(notifications)

    @staticmethod
    def notify_welcome(user):
        """Notificação de boas-vindas ao criar conta"""
        return Notification.objects.create(
            user=user,
            type=NotificationType.SYSTEM,
            priority=NotificationPriority.LOW,
            title="Bem-vindo ao AgroManage!",
            message="Seu cadastro foi realizado com sucesso. Explore as funcionalidades do sistema.",
            link="/home"
        )

    @staticmethod
    def notify_organization_invite(user, organization, invited_by):
        """Notificação de convite para organização"""
        return Notification.objects.create(
            user=user,
            type=NotificationType.SYSTEM,
            priority=NotificationPriority.MEDIUM,
            title=f"Convite para {organization.name}",
            message=f"{invited_by.full_name} convite você para fazer parte da organização {organization.name}.",
            link="/home/settings"
        )

    @staticmethod
    def notify_password_change(user):
        """Notificação de alteração de senha"""
        return Notification.objects.create(
            user=user,
            type=NotificationType.SYSTEM,
            priority=NotificationPriority.HIGH,
            title="Senha alterada",
            message="Sua senha foi alterada com sucesso.",
            link="/home/settings"
        )

    @staticmethod
    def check_and_notify_stock(item):
        """Verifica e notifica sobre estoque baixo"""
        from apps.inventory.models import LoteEstoque

        total_qty = sum(
            LoteEstoque.objects.filter(item=item).values_list("quantidade", flat=True)
        )

        if item.estoque_minimo and total_qty <= float(item.estoque_minimo):
            organization = item.organization
            if not organization:
                return None

            from apps.accounts.models import User
            users = User.objects.filter(organization=organization, role__in=["owner", "admin"])

            title = f"Estoque baixo: {item.nome}"
            message = f"O item {item.nome} está com {total_qty} {item.unidade_medida} (mínimo: {item.estoque_minimo})"

            return NotificationService.create_for_organization(
                organization=organization,
                title=title,
                message=message,
                notif_type=NotificationType.STOCK,
                priority=NotificationPriority.HIGH,
                link=f"/home/inventory/{item.id}"
            )
        return None

    @staticmethod
    def get_user_preferences(user):
        """Retorna as preferências do usuário (cria se não existir)"""
        pref, _ = NotificationPreference.objects.get_or_create(user=user)
        return pref

    @staticmethod
    def should_notify(user, notification_type):
        """Verifica se o usuário deve receber este tipo de notificação"""
        pref = NotificationService.get_user_preferences(user)

        type_mapping = {
            NotificationType.STOCK: pref.stock_alerts,
            NotificationType.ANIMAL: pref.animal_alerts,
            NotificationType.FINANCE: pref.financial_alerts,
            NotificationType.REPORT: pref.report_alerts,
        }

        return type_mapping.get(notification_type, True)