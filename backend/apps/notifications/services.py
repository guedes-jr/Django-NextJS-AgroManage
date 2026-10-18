"""
Serviços para criação de notificações.
"""
from django.utils import timezone
from django.db import transaction
import logging
from datetime import timedelta
from .models import Notification, NotificationType, NotificationPriority
from .models import NotificationPreference
from .categories import classify_notification, category_policy, channel_allowed

logger = logging.getLogger(__name__)


class NotificationService:
    """Serviço centralizado para criar notificações"""

    @staticmethod
    def create(user, title, message, notif_type=NotificationType.SYSTEM, priority=NotificationPriority.MEDIUM, link=None, event_key="", category=None, *, campaign=None, in_app=None, schedule=True):
        if user.organization_id and user.organization.recovery_isolated:
            return None
        from .noise import create_guarded

        category = classify_notification(notif_type, event_key, category)
        policy = category_policy(category)
        from .operator_scope import event_allowed
        if not event_allowed(user, category, event_key):
            return None
        if not NotificationService.should_notify(user, notif_type, category, policy=policy):
            return None
        notification, created = create_guarded(user, title, message, notif_type, priority, link, event_key, category, policy, campaign=campaign, in_app=in_app)
        if created and schedule:
            NotificationService.schedule_external_delivery(notification, policy=policy)
        elif schedule and notification and not notification.deliveries.filter(channel='whatsapp_web').exists():
            NotificationService.schedule_external_delivery(notification,policy=policy,only_channels=['whatsapp_web'])
        return notification

    @staticmethod
    def schedule_external_delivery(notification, policy=None, only_channels=None):
        from .models import NotificationDelivery
        from .tasks import dispatch_notification

        if not notification.user.receive_system_alerts:
            return
        pref = NotificationService.get_user_preferences(notification.user)
        channels = []
        if pref.email_notifications and pref.frequency == "instant":
            channels.append(NotificationDelivery.Channel.EMAIL)
        if pref.push_notifications:
            channels.append(NotificationDelivery.Channel.WEB_PUSH)
        if (
            pref.whatsapp_reproductive_alerts
            and notification.user.phone_is_whatsapp
            and (notification.type == NotificationType.STOCK or NotificationService.is_reproductive_whatsapp_alert(notification))
        ):
            channels.append(NotificationDelivery.Channel.WHATSAPP_WEB)
        policy = policy or category_policy(notification.category)
        channels = [channel for channel in channels if channel_allowed(notification, channel, policy)]
        if only_channels is not None:
            channels = [channel for channel in channels if channel in only_channels]
        for channel in channels:
            delivery, _ = NotificationDelivery.objects.get_or_create(notification=notification, channel=channel)
            if channel == NotificationDelivery.Channel.WHATSAPP_WEB:
                from .whatsapp_queue import queue_notification
                queue_notification(delivery)
        immediate_channels = [c for c in channels if c != NotificationDelivery.Channel.WHATSAPP_WEB]
        if immediate_channels:
            def enqueue():
                try:
                    dispatch_notification.apply_async(args=[str(notification.id)], kwargs={"channels": immediate_channels}, countdown=policy.group_similar_minutes * 60 if notification.priority != "urgent" and notification.campaign_id is None else 0)
                except Exception:
                    logger.exception("Não foi possível enfileirar a entrega da notificação %s", notification.id)
            transaction.on_commit(enqueue)

    @staticmethod
    def is_reproductive_whatsapp_alert(notification):
        """Only approved operational events may reach WhatsApp."""
        return notification.event_key.startswith((
            "livestock.reproductive_vaccine.",
            "livestock.next_mating:",
            "livestock.operational:",
        ))

    @staticmethod
    def create_for_organization(organization, title, message, notif_type=NotificationType.SYSTEM, priority=NotificationPriority.MEDIUM, link=None, roles=None, event_key="", category=None):
        """Cria notificações para todos os usuários de uma organização"""
        if roles is None:
            roles = ["admin", "manager"]

        from apps.accounts.models import User
        users = User.objects.filter(organization=organization, role__in=roles).select_related("organization")

        notifications = []
        for user in users:
            notification = NotificationService.create(
                user=user,
                title=title,
                message=message,
                notif_type=notif_type,
                priority=priority,
                link=link,
                event_key=event_key,
                category=category,
            )
            if notification is not None:
                notifications.append(notification)
        return notifications

    @staticmethod
    def create_bulk(users, title, message, notif_type=NotificationType.SYSTEM, priority=NotificationPriority.MEDIUM, link=None, event_key="", category=None):
        return [notification for user in users if (notification := NotificationService.create(user, title, message, notif_type, priority, link, event_key, category)) is not None]

    @staticmethod
    def notify_welcome(user):
        """Notificação de boas-vindas ao criar conta"""
        return NotificationService.create(
            user=user,
            notif_type=NotificationType.SYSTEM,
            priority=NotificationPriority.LOW,
            title="Bem-vindo ao sistema Fazenda Mais!",
            message="Seu cadastro foi realizado com sucesso. Explore as funcionalidades do sistema.",
            link="/home"
        )

    @staticmethod
    def notify_organization_invite(user, organization, invited_by):
        """Notificação de convite para organização"""
        return NotificationService.create(
            user=user,
            notif_type=NotificationType.SYSTEM,
            priority=NotificationPriority.MEDIUM,
            title=f"Convite para {organization.name}",
            message=f"{invited_by.full_name} convite você para fazer parte da organização {organization.name}.",
            link="/home/settings"
        )

    @staticmethod
    def notify_password_change(user):
        """Notificação de alteração de senha"""
        return NotificationService.create(
            user=user,
            notif_type=NotificationType.SYSTEM,
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
            LoteEstoque.objects.filter(item=item, ativo=True).values_list("quantidade_atual", flat=True)
        )

        if item.estoque_minimo and total_qty <= float(item.estoque_minimo):
            organization = item.organization
            if not organization:
                return None

            from apps.accounts.models import User
            users = User.objects.filter(organization=organization, role__in=["admin"])

            title = f"Estoque baixo: {item.nome}"
            message = f"O item {item.nome} está com {total_qty} {item.unidade_medida} (mínimo: {item.estoque_minimo})"

            return NotificationService.create_for_organization(
                organization=organization,
                title=title,
                message=message,
                notif_type=NotificationType.STOCK,
                priority=NotificationPriority.HIGH,
                link="/home/estoque/produtos",
                event_key=f"inventory.low_stock:{item.id}",
            )
        return None

    @staticmethod
    def get_user_preferences(user):
        """Retorna as preferências do usuário (cria se não existir)"""
        pref, _ = NotificationPreference.objects.get_or_create(user=user)
        return pref

    @staticmethod
    def should_notify(user, notification_type, category=None, *, policy=None):
        """Verifica se o usuário deve receber este tipo de notificação"""
        category = classify_notification(notification_type, category=category)
        if not user.receive_system_alerts or not (policy or category_policy(category)).enabled:
            return False
        pref = NotificationService.get_user_preferences(user)

        type_mapping = {
            NotificationType.MARKETING: pref.marketing_alerts,
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
                    event_key=f"livestock.reproductive_vaccine.birth:{birth.id}",
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
                    event_key=f"livestock.reproductive_vaccine.mating:{mating.id}",
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
                    event_key=f"livestock.next_mating:{litter.id}",
                )
                litter.next_mating_notification_sent = True
                litter.save(update_fields=['next_mating_notification_sent'])
                created += 1
        return created
