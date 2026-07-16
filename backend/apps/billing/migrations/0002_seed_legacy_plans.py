from django.db import migrations


LEGACY_PLANS = (
    ("free", "Free", 0),
    ("starter", "Starter", 10),
    ("pro", "Pro", 20),
    ("enterprise", "Enterprise", 30),
)


def migrate_legacy_plans(apps, schema_editor):
    Organization = apps.get_model("organizations", "Organization")
    Plan = apps.get_model("billing", "Plan")
    Subscription = apps.get_model("billing", "Subscription")

    plans = {}
    for code, name, sort_order in LEGACY_PLANS:
        plan, _created = Plan.objects.get_or_create(
            code=code,
            defaults={"name": name, "sort_order": sort_order},
        )
        plans[code] = plan

    for organization in Organization.objects.all().iterator():
        plan = plans.get(organization.plan, plans["free"])
        Subscription.objects.get_or_create(
            organization=organization,
            defaults={
                "plan": plan,
                "status": "active" if organization.is_active else "suspended",
                "billing_cycle": "monthly",
                "started_at": organization.created_at,
            },
        )


def reverse_migration(apps, schema_editor):
    Subscription = apps.get_model("billing", "Subscription")
    Plan = apps.get_model("billing", "Plan")
    Subscription.objects.all().delete()
    Plan.objects.filter(code__in=[item[0] for item in LEGACY_PLANS]).delete()


class Migration(migrations.Migration):
    dependencies = [("billing", "0001_initial")]
    operations = [migrations.RunPython(migrate_legacy_plans, reverse_migration)]
