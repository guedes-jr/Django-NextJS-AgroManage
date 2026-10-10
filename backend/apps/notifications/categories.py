"""Classification and platform-wide delivery limits for notification categories."""
from .models import NotificationCategory, NotificationCategoryPolicy, NotificationType

CYCLE_PREFIXES = ("livestock.reproductive_vaccine.", "livestock.next_mating:")


def classify_notification(notification_type, event_key="", category=None):
    if category is not None:
        category = NotificationCategory(category).value
        expected_type = {"animal_cycle": "animal", "overdue_payment": "finance"}.get(category, category)
        if notification_type != expected_type:
            raise ValueError("Notification category does not match its type")
        return category
    if notification_type == NotificationType.ANIMAL and event_key.startswith(CYCLE_PREFIXES):
        return NotificationCategory.ANIMAL_CYCLE
    if notification_type == NotificationType.FINANCE and event_key.startswith("finance.transaction.overdue:"):
        return NotificationCategory.OVERDUE_PAYMENT
    return NotificationCategory(notification_type).value


def category_policy(category):
    policy = NotificationCategoryPolicy.objects.filter(category=category).first()
    return policy or NotificationCategoryPolicy(
        category=category, enabled=category != NotificationCategory.MARKETING,
        whatsapp_enabled=category == NotificationCategory.ANIMAL_CYCLE,
    )


def channel_allowed(notification, channel, policy=None):
    policy = policy or category_policy(notification.category)
    return policy.enabled and {
        "email": policy.email_enabled,
        "web_push": policy.push_enabled,
        "whatsapp_web": policy.whatsapp_enabled,
    }.get(channel, False)


def email_category_queryset(queryset, user):
    policies = {policy.category: policy for policy in NotificationCategoryPolicy.objects.all()}
    allowed = []
    for category in NotificationCategory.values:
        policy = policies.get(category)
        if policy is None:
            enabled, email_enabled = category != NotificationCategory.MARKETING, True
        else:
            enabled, email_enabled = policy.enabled, policy.email_enabled
        if enabled and email_enabled and (category != NotificationCategory.MARKETING or user.notification_preference.marketing_alerts):
            allowed.append(category)
    return queryset.filter(category__in=allowed)
