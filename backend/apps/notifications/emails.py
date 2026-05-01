"""
Serviços de email para notificações.
"""
from django.core.mail import send_mail
from django.conf import settings
from django.template.loader import render_to_string
from .models import Notification, NotificationPreference


class EmailNotificationService:
    """Serviço para enviar notificações por email"""

    @staticmethod
    def send_notification_email(user, notification: Notification):
        """
        Envia uma notificação individual por email.
        """
        pref, _ = NotificationPreference.objects.get_or_create(user=user)
        
        if not pref.email_notifications:
            return
        
        # Check if this notification type is enabled
        type_mapping = {
            "stock": pref.stock_alerts,
            "animal": pref.animal_alerts,
            "finance": pref.financial_alerts,
            "report": pref.report_alerts,
        }
        
        if notification.type in type_mapping and not type_mapping[notification.type]:
            return

        subject = f"[AgroManage] {notification.title}"
        message = notification.message

        try:
            send_mail(
                subject=subject,
                message=message,
                from_email=settings.DEFAULT_FROM_EMAIL or "noreply@agromanage.com",
                recipient_list=[user.email],
                fail_silently=False,
            )
        except Exception as e:
            print(f"Error sending email notification: {e}")

    @staticmethod
    def send_daily_digest(user):
        """
        Envia resumo diário de notificações.
        """
        pref, _ = NotificationPreference.objects.get_or_create(user=user)
        
        if not pref.email_notifications or pref.frequency != "daily":
            return

        notifications = Notification.objects.filter(
            user=user,
            is_read=False,
            created_at__gte=timezone.now() - timedelta(days=1)
        )

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
                subject=f"[AgroManage] Resumo diário - {notifications.count()} notificações",
                message=text_content,
                from_email=settings.DEFAULT_FROM_EMAIL or "noreply@agromanage.com",
                recipient_list=[user.email],
                html_message=html_content,
                fail_silently=False,
            )
        except Exception as e:
            print(f"Error sending daily digest: {e}")

    @staticmethod
    def send_weekly_digest(user):
        """
        Envia resumo semanal de notificações.
        """
        pref, _ = NotificationPreference.objects.get_or_create(user=user)
        
        if not pref.email_notifications or pref.frequency != "weekly":
            return

        notifications = Notification.objects.filter(
            user=user,
            is_read=False,
            created_at__gte=timezone.now() - timedelta(days=7)
        )

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
                subject=f"[AgroManage] Resumo semanal - {notifications.count()} notificações",
                message=text_content,
                from_email=settings.DEFAULT_FROM_EMAIL or "noreply@agromanage.com",
                recipient_list=[user.email],
                html_message=html_content,
                fail_silently=False,
            )
        except Exception as e:
            print(f"Error sending weekly digest: {e}")


# Import timezone after to avoid circular import
from django.utils import timezone
from datetime import timedelta