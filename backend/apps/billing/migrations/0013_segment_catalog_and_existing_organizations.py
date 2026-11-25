"""One contractable segment per product area, and existing organizations on every segment.

* Catalog codes match the app areas: plantacoes, bovinos, suinos, area-veterinario. Swine stops
  being split (the full-cycle offer becomes ``suinos``; fattening is retired, kept for history).
  Price tiers by quantity remain editable in /platform › Segmentos e preços.
* Every subscription that exists when this runs receives all segments at the tier price plus an
  indefinite 100% exemption described as "Organização de teste" (removable in the dossier).
"""
from django.db import migrations
from django.utils import timezone

SEGMENTS = (
    ("plantacoes", 10),
    ("bovinos", 20),
    ("suinos", 30),
    ("area-veterinario", 40),
)


def catalog(apps, schema_editor):
    PlanSegment = apps.get_model("billing", "PlanSegment")
    PlanTier = apps.get_model("billing", "PlanTier")
    SubscriptionItem = apps.get_model("billing", "SubscriptionItem")

    if not PlanSegment.objects.filter(code="suinos").exists():
        full_cycle = PlanSegment.objects.filter(code="suinocultura-ciclo-completo").first()
        if full_cycle:
            full_cycle.code = "suinos"
            full_cycle.name = "Suínos"
            full_cycle.subtitle = "Suinocultura"
            full_cycle.save(update_fields=["code", "name", "subtitle"])
        else:
            PlanSegment.objects.create(
                code="suinos", name="Suínos", subtitle="Suinocultura", icon="piggy-bank", metric_label="matrizes",
                description="Matrizes, leitões, lotes, reprodução, sanidade e custos da suinocultura.",
            )
    PlanSegment.objects.filter(code="suinocultura-engorda").update(is_active=False, is_public=False)
    for old in ("suinocultura-ciclo-completo", "suinocultura-engorda"):
        for item in SubscriptionItem.objects.filter(segment_code=old):
            if SubscriptionItem.objects.filter(subscription=item.subscription, segment_code="suinos").exists():
                item.delete()
            else:
                item.segment_code = "suinos"
                item.save(update_fields=["segment_code"])

    cattle, created = PlanSegment.objects.get_or_create(
        code="bovinos",
        defaults={
            "name": "Bovinos", "subtitle": "Corte e leite", "icon": "beef", "metric_label": "animais",
            "description": "Rebanho, reprodução, pastagens, tratos, leite, sanidade e custos dos bovinos.",
            "image_path": "/landing-livestock.png",
        },
    )
    if created or not cattle.tiers.exists():
        PlanTier.objects.create(segment=cattle, label="Sob consulta", requires_quote=True, sort_order=10)
    for code, order in SEGMENTS:
        PlanSegment.objects.filter(code=code).update(sort_order=order, is_active=True)


def existing_organizations(apps, schema_editor):
    PlanSegment = apps.get_model("billing", "PlanSegment")
    Subscription = apps.get_model("billing", "Subscription")
    SubscriptionItem = apps.get_model("billing", "SubscriptionItem")
    SubscriptionDiscount = apps.get_model("billing", "SubscriptionDiscount")

    tiers = {}
    for code, _ in SEGMENTS:
        segment = PlanSegment.objects.filter(code=code).first()
        tier = segment and segment.tiers.filter(is_active=True).order_by("sort_order", "minimum_quantity").first()
        if tier:
            tiers[code] = (segment, tier)
    now = timezone.now()
    for subscription in Subscription.objects.all():
        existing = set(SubscriptionItem.objects.filter(subscription=subscription).values_list("segment_code", flat=True))
        for code, (segment, tier) in tiers.items():
            if code in existing:
                continue
            SubscriptionItem.objects.create(
                subscription=subscription, tier=tier, segment_code=code, segment_name=segment.name,
                segment_subtitle=segment.subtitle, tier_label=tier.label, monthly_price=tier.monthly_price,
                discount_percent=0, final_monthly_price=tier.monthly_price,
            )
        if not SubscriptionDiscount.objects.filter(subscription=subscription, description="Organização de teste").exists():
            SubscriptionDiscount.objects.create(
                subscription=subscription, source="manual", kind="exemption", value=0,
                description="Organização de teste", starts_at=now, ends_at=None,
            )


class Migration(migrations.Migration):
    dependencies = [
        ("billing", "0012_coupon_remove_subscription_discount_ends_at_and_more"),
    ]

    operations = [
        migrations.RunPython(catalog, migrations.RunPython.noop),
        migrations.RunPython(existing_organizations, migrations.RunPython.noop),
    ]
