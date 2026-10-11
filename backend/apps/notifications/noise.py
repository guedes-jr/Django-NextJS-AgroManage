"""Serialize per-user/category creation and bound repeated notification volume."""

import hashlib
import re
from datetime import timedelta

from django.db import transaction
from django.db.models import F
from django.utils import timezone

from .models import Notification, NotificationDailyGuard, NotificationOccurrence


def occurrence_key(title, message, link, event_key):
    if event_key:
        return event_key
    content = (
        re.sub(r"\s+", " ", f"{title}\n{message}\n{link or ''}").strip().casefold()
    )
    return "content:" + hashlib.sha256(content.encode()).hexdigest()


def remember_item(notification, message, now):
    items = notification.group_items or []
    if not items or items[-1].get("message") != message:
        items = [*items, {"message": message, "at": now.isoformat()}][-5:]
    return items


def create_guarded(
    user,
    title,
    message,
    notification_type,
    priority,
    link,
    event_key,
    category,
    policy,
    campaign=None,
    in_app=None,
):
    now = timezone.now()
    key = occurrence_key(title, message, link, event_key)
    if not event_key:
        key = f"{category}:{key}"
    with transaction.atomic():
        guard, _ = NotificationDailyGuard.objects.get_or_create(
            user=user, category=category, day=timezone.localdate()
        )
        guard = NotificationDailyGuard.objects.select_for_update().get(pk=guard.pk)
        occurrence = (
            NotificationOccurrence.objects.filter(user=user, key=key)
            .select_related("notification")
            .first()
        )
        previous = occurrence.notification if occurrence else None
        if previous is None and event_key:
            previous = (
                Notification.objects.filter(user=user, event_key=event_key)
                .order_by("-created_at")
                .first()
            )
        repeated = previous is not None and (
            bool(event_key)
            or (
                occurrence
                and (now - occurrence.last_seen_at).total_seconds()
                < policy.repeat_cooldown_minutes * 60
            )
        )
        if repeated:
            cooldown_passed = (
                occurrence is None
                or (now - occurrence.last_seen_at).total_seconds()
                >= policy.repeat_cooldown_minutes * 60
            )
            updates = {
                "occurrence_count": F("occurrence_count") + 1,
                "last_occurred_at": now,
            }
            if campaign is None:
                updates.update(
                    title=title,
                    link=link or "",
                    priority=priority,
                    show_in_app=policy.in_app_enabled and in_app is not False,
                    message=message,
                    group_items=remember_item(previous, message, now),
                )
            if cooldown_passed and not previous.is_archived:
                updates.update(is_read=False, read_at=None)
            Notification.objects.filter(pk=previous.pk).update(**updates)
            NotificationOccurrence.objects.update_or_create(
                user=user,
                key=key,
                defaults={"notification": previous, "last_seen_at": now},
            )
            NotificationDailyGuard.objects.filter(pk=guard.pk).update(
                duplicate_count=F("duplicate_count") + 1
            )
            previous.refresh_from_db()
            return previous, False
        if campaign is None and policy.group_similar_minutes and priority != "urgent":
            group = (
                Notification.objects.filter(
                    user=user,
                    category=category,
                    title__iexact=title,
                    link=link or "",
                    is_archived=False,
                    campaign__isnull=True,
                    created_at__gte=now
                    - timedelta(minutes=policy.group_similar_minutes),
                )
                .exclude(priority="urgent")
                .order_by("-created_at")
                .first()
            )
            if group is not None:
                levels = {"low": 0, "medium": 1, "high": 2, "urgent": 3}
                Notification.objects.filter(pk=group.pk).update(
                    message=message,
                    group_items=remember_item(group, message, now),
                    occurrence_count=F("occurrence_count") + 1,
                    last_occurred_at=now,
                    is_read=False,
                    read_at=None,
                    priority=max(
                        (group.priority, priority), key=lambda value: levels[value]
                    ),
                )
                NotificationOccurrence.objects.update_or_create(
                    user=user,
                    key=key,
                    defaults={"notification": group, "last_seen_at": now},
                )
                NotificationDailyGuard.objects.filter(pk=guard.pk).update(
                    grouped_count=F("grouped_count") + 1
                )
                group.refresh_from_db()
                return group, False
        if policy.max_per_day and guard.created_count >= policy.max_per_day:
            NotificationDailyGuard.objects.filter(pk=guard.pk).update(
                limited_count=F("limited_count") + 1
            )
            return None, False
        notification = Notification.objects.create(
            user=user,
            type=notification_type,
            category=category,
            priority=priority,
            title=title,
            message=message,
            link=link or "",
            event_key=event_key,
            last_occurred_at=now,
            show_in_app=policy.in_app_enabled and in_app is not False,
            campaign=campaign,
            group_items=[{"message": message, "at": now.isoformat()}],
        )
        NotificationOccurrence.objects.update_or_create(
            user=user,
            key=key,
            defaults={"notification": notification, "last_seen_at": now},
        )
        NotificationDailyGuard.objects.filter(pk=guard.pk).update(
            created_count=F("created_count") + 1
        )
        return notification, True


def notification_text(notification):
    messages = [
        item["message"]
        for item in getattr(notification, "group_items", [])
        if isinstance(item, dict) and isinstance(item.get("message"), str)
    ]
    if len(messages) > 1:
        return (
            f"{notification.occurrence_count} ocorrências agrupadas. Últimos avisos:\n\n"
            + "\n\n".join(messages)
        )
    return notification.message
