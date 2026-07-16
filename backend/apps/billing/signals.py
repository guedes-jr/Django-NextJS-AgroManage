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
        Subscription.objects.get_or_create(
            organization=instance,
            defaults={
                "plan": plan,
                "status": Subscription.Status.ACTIVE,
                "billing_cycle": Subscription.BillingCycle.MONTHLY,
                "started_at": timezone.now(),
            },
        )
