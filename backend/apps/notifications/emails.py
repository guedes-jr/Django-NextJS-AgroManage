"""
Serviços de email para notificações.
"""
import logging
from datetime import timedelta

from django.conf import settings
from django.core.mail import send_mail
from django.template.loader import render_to_string
from django.utils import timezone

from .categories import channel_allowed, email_category_queryset
from .models import Notification, NotificationPreference

logger = logging.getLogger(__name__)


class EmailNotificationService:
    """Serviço para enviar notificações por email"""

    @staticmethod
    def send_notification_email(user, notification: Notification):
        """
        Envia uma notificação individual por email.
        """
        if not user.receive_system_alerts:
            return False
        pref, _ = NotificationPreference.objects.get_or_create(user=user)
        
        if not pref.email_notifications or not channel_allowed(notification, "email") or (notification.type == "marketing" and not pref.marketing_alerts):
            return False
        
        # Check if this notification type is enabled
        type_mapping = {
            "stock": pref.stock_alerts,
            "animal": pref.animal_alerts,
            "finance": pref.financial_alerts,
            "report": pref.report_alerts,
        }
        
        if notification.type in type_mapping and not type_mapping[notification.type]:
            return

        subject = f"[Fazenda Mais] {notification.title}"
        from .noise import notification_text
        message = notification_text(notification)
        html_content = render_to_string("notifications/instant.html", {"user": user, "notification": notification, "message": message})

        try:
            send_mail(
                subject=subject,
                message=message,
                from_email=settings.DEFAULT_FROM_EMAIL or "noreply@agromanage.com",
                recipient_list=[user.email],
                html_message=html_content,
                fail_silently=False,
            )
            return True
        except Exception as e:
            logger.exception("Falha ao enviar notificação por e-mail para %s", user.email)
            return False

    @staticmethod
    def send_daily_digest(user):
        """
        Envia resumo diário de notificações.
        """
        if not user.receive_system_alerts:
            return False
        pref, _ = NotificationPreference.objects.get_or_create(user=user)
        
        if not pref.email_notifications or pref.frequency != "daily":
            return

        notifications = Notification.objects.filter(
            user=user,
            campaign__isnull=True,
            is_read=False,
            created_at__gte=timezone.now() - timedelta(days=1)
        )

        notifications = email_category_queryset(notifications, user)
        if not notifications.exists():
            return

        context = {
            "user": user,
            "notifications": notifications,
            "count": notifications.count(),
        }

        html_content = render_to_string("notifications/daily_digest.html", context)
        text_content = f"Você tem {notifications.count()} notificações não lidas."

        try:
            send_mail(
                subject=f"[Fazenda Mais] Resumo diário - {notifications.count()} notificações",
                message=text_content,
                from_email=settings.DEFAULT_FROM_EMAIL or "noreply@agromanage.com",
                recipient_list=[user.email],
                html_message=html_content,
                fail_silently=False,
            )
        except Exception as e:
            logger.exception("Falha ao enviar resumo diário para %s", user.email)

    @staticmethod
    def send_weekly_digest(user):
        """
        Envia resumo semanal de notificações.
        """
        if not user.receive_system_alerts:
            return False
        pref, _ = NotificationPreference.objects.get_or_create(user=user)
        
        if not pref.email_notifications or pref.frequency != "weekly":
            return

        notifications = Notification.objects.filter(
            user=user,
            campaign__isnull=True,
            is_read=False,
            created_at__gte=timezone.now() - timedelta(days=7)
        )

        notifications = email_category_queryset(notifications, user)
        if not notifications.exists():
            return

        context = {
            "user": user,
            "notifications": notifications,
            "count": notifications.count(),
        }

        html_content = render_to_string("notifications/weekly_digest.html", context)
        text_content = f"Você tem {notifications.count()} notificações não lidas esta semana."

        try:
            send_mail(
                subject=f"[Fazenda Mais] Resumo semanal - {notifications.count()} notificações",
                message=text_content,
                from_email=settings.DEFAULT_FROM_EMAIL or "noreply@agromanage.com",
                recipient_list=[user.email],
                html_message=html_content,
                fail_silently=False,
            )
        except Exception as e:
            logger.exception("Falha ao enviar resumo semanal para %s", user.email)
