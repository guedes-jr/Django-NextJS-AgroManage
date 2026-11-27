from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone

from apps.organizations.models import Organization

from .models import Plan, Subscription


@receiver(post_save, sender=Organization)
def provision_default_subscription(sender, instance, created, **kwargs):
    if not created or hasattr(instance, "subscription"):
        return
    plan = Plan.objects.filter(code=instance.plan, is_active=True).first()
    if not plan:
        plan = Plan.objects.filter(code="free", is_active=True).first()
    if plan:
        # Self-service signups start pending: the first access chooses the segments, shows the price
        # and the terms, then starts the free trial (apps/billing/onboarding.py).
        self_service = bool(getattr(instance, "_self_service_signup", False))
        subscription, created_subscription = Subscription.objects.get_or_create(
            organization=instance,
            defaults={
                "plan": plan,
                "status": Subscription.Status.TRIALING if self_service else Subscription.Status.ACTIVE,
                "onboarding_required": self_service,
                "billing_cycle": Subscription.BillingCycle.MONTHLY,
                "started_at": timezone.now(),
            },
        )
        if created_subscription:
            # Every organization keeps at least one segment. Callers (e.g. the platform form) may
            # choose them before saving; otherwise the base segments are contracted at tier price.
            from .segments import DEFAULT_SEGMENTS
            from .subscriptions import provision_segments

            provision_segments(subscription, getattr(instance, "_initial_segments", None) or DEFAULT_SEGMENTS)
