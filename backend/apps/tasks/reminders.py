"""Durable, revocable agenda reminders using the existing WhatsApp outbox."""
from datetime import datetime, time, timedelta
from uuid import UUID
from django.db import transaction
from django.utils import timezone
from .models import Task


def event_deadline(task):
    return timezone.make_aware(datetime.combine(task.due_date, task.start_time or time(23,59,59))) if task.due_date else None


def reminder_allowed(user, key):
    try:
        prefix, pk, version = key.split(":")
        pk, version = UUID(pk), UUID(version)
    except (ValueError, TypeError):
        return False
    if prefix != "agenda.reminder":
        return False
    task = Task.objects.filter(pk=pk, reminder_version=version, organization_id=user.organization_id, created_by=user, whatsapp_remind_at__lte=timezone.now()).exclude(status__in=["done","cancelled"]).first()
    return bool(task and user.is_active and user.organization.is_active and not user.organization.recovery_isolated and task.whatsapp_remind_at and task.due_date and event_deadline(task) + timedelta(minutes=15) >= timezone.now())


def collect_reminders():
    from apps.notifications.services import NotificationService
    from apps.notifications.categories import category_policy
    from apps.notifications.models import NotificationDelivery
    from apps.notifications.tasks import _whatsapp_phone
    policy = category_policy("agenda")
    if not policy.enabled or not policy.whatsapp_enabled:
        return 0
    count = 0
    now = timezone.now()
    local = timezone.localtime(now)
    ids = Task.objects.filter(whatsapp_remind_at__lte=now, reminder_delivery__isnull=True, organization__is_active=True, organization__recovery_isolated=False, created_by__is_active=True, created_by__receive_system_alerts=True, created_by__phone_is_whatsapp=True).filter(due_date__gte=(local-timedelta(minutes=15)).date()).exclude(status__in=["done","cancelled"]).order_by("whatsapp_remind_at").values_list("pk",flat=True)
    for pk in ids.iterator(chunk_size=200):
        if count >= 200:
            break
        with transaction.atomic():
            task = Task.objects.select_for_update(of=("self",)).select_related("created_by__organization", "farm", "organization").filter(pk=pk).first()
            if task is None:
                continue
            user = task.created_by
            key = f"agenda.reminder:{task.pk}:{task.reminder_version}"
            if task.reminder_delivery_id or not user or not reminder_allowed(user,key) or not user.receive_system_alerts or not user.phone_is_whatsapp or not _whatsapp_phone(user.phone):
                continue
            when = task.due_date.strftime("%d/%m/%Y") + (f" às {task.start_time.strftime('%H:%M')}" if task.start_time else " (dia inteiro)")
            message = f"{task.title}\n{when}\n{task.farm.name if task.farm else task.organization.name}"
            if task.location: message += f"\nLocal: {task.location}"
            if task.description: message += f"\n{task.description}"
            notification = NotificationService.create(user, title=f"Lembrete da agenda · {task.title}"[:200], message=message, category="agenda", link="/home/agenda", event_key=key, schedule=False)
            if notification:
                NotificationService.schedule_external_delivery(notification, only_channels=["whatsapp_web"])
                delivery = notification.deliveries.filter(channel=NotificationDelivery.Channel.WHATSAPP_WEB).first()
                if delivery:
                    task.reminder_delivery=delivery
                    task.save(update_fields=["reminder_delivery", "updated_at"])
                    count += 1
    return count
