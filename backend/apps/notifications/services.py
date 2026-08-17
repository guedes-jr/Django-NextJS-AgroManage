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

    @staticmethod
    def create_due_reproductive_vaccine_notifications(organization=None):
        """Cria, uma única vez, os avisos de vacinas reprodutivas vencidas."""
        from django.db import transaction
        from apps.livestock.models import Birth, Litter, Mating

        due = Birth.objects.filter(
            reproductive_vaccine_due_date__lte=timezone.now().date(),
            reproductive_vaccine_notification_sent=False,
            reproductive_vaccine_item__isnull=False,
        ).select_related('female__farm__organization', 'reproductive_vaccine_item')
        if organization is not None:
            due = due.filter(female__farm__organization=organization)

        created = 0
        for birth_id in due.values_list('id', flat=True):
            with transaction.atomic():
                birth = Birth.objects.select_for_update().select_related(
                    'female__farm__organization', 'reproductive_vaccine_item'
                ).get(id=birth_id)
                if birth.reproductive_vaccine_notification_sent:
                    continue
                NotificationService.create_for_organization(
                    organization=birth.female.farm.organization,
                    title=f"Vacina reprodutiva — {birth.female.identifier}",
                    message=(
                        f"Aplicar {birth.reproductive_vaccine_item.nome} na matriz "
                        f"{birth.female.identifier}. Agendada para "
                        f"{birth.reproductive_vaccine_due_date.strftime('%d/%m/%Y')}."
                    ),
                    notif_type=NotificationType.ANIMAL,
                    priority=NotificationPriority.HIGH,
                    link="/home/rebanho/suinos/reproducao?tab=maternidade",
                )
                birth.reproductive_vaccine_notification_sent = True
                birth.save(update_fields=['reproductive_vaccine_notification_sent'])
                created += 1

        mating_due = Mating.objects.filter(
            reproductive_vaccine_due_date__lte=timezone.now().date(),
            reproductive_vaccine_notification_sent=False,
            reproductive_vaccine_item__isnull=False,
        ).select_related('female__farm__organization', 'reproductive_vaccine_item')
        if organization is not None:
            mating_due = mating_due.filter(female__farm__organization=organization)

        for mating_id in mating_due.values_list('id', flat=True):
            with transaction.atomic():
                mating = Mating.objects.select_for_update().select_related(
                    'female__farm__organization', 'reproductive_vaccine_item'
                ).get(id=mating_id)
                if mating.reproductive_vaccine_notification_sent:
                    continue
                NotificationService.create_for_organization(
                    organization=mating.female.farm.organization,
                    title=f"Vacina reprodutiva — {mating.female.identifier}",
                    message=(
                        f"Aplicar {mating.reproductive_vaccine_item.nome} na fêmea "
                        f"{mating.female.identifier}. Agendada para "
                        f"{mating.reproductive_vaccine_due_date.strftime('%d/%m/%Y')}."
                    ),
                    notif_type=NotificationType.ANIMAL,
                    priority=NotificationPriority.HIGH,
                    link="/home/rebanho/suinos/reproducao?tab=gestacao",
                )
                mating.reproductive_vaccine_notification_sent = True
                mating.save(update_fields=['reproductive_vaccine_notification_sent'])
                created += 1

        mating_notices = Litter.objects.filter(
            next_mating_notice_date__lte=timezone.now().date(),
            next_mating_notification_sent=False,
        ).select_related('birth__female__farm__organization')
        if organization is not None:
            mating_notices = mating_notices.filter(
                birth__female__farm__organization=organization
            )

        for litter_id in mating_notices.values_list('id', flat=True):
            with transaction.atomic():
                litter = Litter.objects.select_for_update().select_related(
                    'birth__female__farm__organization'
                ).get(id=litter_id)
                if litter.next_mating_notification_sent:
                    continue
                female = litter.birth.female
                NotificationService.create_for_organization(
                    organization=female.farm.organization,
                    title=f"Próxima cobertura — {female.identifier}",
                    message=(
                        f"A matriz {female.identifier} está programada para uma nova cobertura "
                        f"em {litter.next_mating_notice_date.strftime('%d/%m/%Y')}."
                    ),
                    notif_type=NotificationType.ANIMAL,
                    priority=NotificationPriority.HIGH,
                    link="/home/rebanho/suinos/reproducao?tab=matrizes",
                )
                litter.next_mating_notification_sent = True
                litter.save(update_fields=['next_mating_notification_sent'])
                created += 1
        return created
