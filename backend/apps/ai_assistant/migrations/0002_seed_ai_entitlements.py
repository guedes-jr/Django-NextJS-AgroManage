from django.db import migrations


PLAN_LIMITS = {
    "free": 5,
    "starter": 30,
    "pro": 100,
    "enterprise": 300,
}


def seed_ai_entitlements(apps, schema_editor):
    Feature = apps.get_model("billing", "Feature")
    Plan = apps.get_model("billing", "Plan")
    PlanEntitlement = apps.get_model("billing", "PlanEntitlement")
    feature, _ = Feature.objects.get_or_create(
        code="ai-assistant",
        defaults={
            "name": "Assistente Rural IA",
            "description": "Orientação educativa sobre plantações, animais e gestão rural.",
            "is_active": True,
        },
    )
    for code, limit in PLAN_LIMITS.items():
        plan = Plan.objects.filter(code=code).first()
        if plan:
            PlanEntitlement.objects.update_or_create(
                plan=plan,
                feature=feature,
                defaults={"is_enabled": True, "limit_value": limit},
            )


def remove_ai_entitlements(apps, schema_editor):
    Feature = apps.get_model("billing", "Feature")
    Feature.objects.filter(code="ai-assistant").delete()


class Migration(migrations.Migration):
    dependencies = [
        ("ai_assistant", "0001_initial"),
        ("billing", "0004_subscription_discounts"),
    ]
    operations = [migrations.RunPython(seed_ai_entitlements, remove_ai_entitlements)]
