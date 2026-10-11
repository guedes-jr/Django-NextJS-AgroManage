# ruff: noqa: RUF012 -- Django migration class attributes are declarative.
from django.db import migrations


def migrate_access(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    Species = apps.get_model("livestock", "Species")
    User.objects.filter(role="owner").update(
        role="admin", organization_responsible=True
    )
    User.objects.filter(role="viewer").update(role="operator", operator_read_only=True)
    # Preserve existing field operators' operational areas, never authorize future species.
    User.objects.filter(role="operator", operator_read_only=False).update(
        can_operate_crops=True
    )
    through = User.allowed_livestock.through
    species = list(Species.objects.values_list("pk", flat=True))
    for user_id in (
        User.objects.filter(role="operator", operator_read_only=False)
        .values_list("pk", flat=True)
        .iterator()
    ):
        through.objects.bulk_create(
            [through(user_id=user_id, species_id=pk) for pk in species],
            ignore_conflicts=True,
        )
    for model_name, field in [
        ("MarketingAudience", "filters"),
        ("MarketingCampaign", "audience_filters"),
    ]:
        Model = apps.get_model("notifications", model_name)
        for row in Model.objects.all().iterator():
            filters = getattr(row, field)
            if not isinstance(filters, dict) or "roles" not in filters:
                continue
            filters["roles"] = list(
                dict.fromkeys(
                    {"owner": "admin", "viewer": "operator"}.get(role, role)
                    for role in filters["roles"]
                )
            )
            setattr(row, field, filters)
            row.save(update_fields=[field])


def reverse_access(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    User.objects.filter(role="admin", organization_responsible=True).update(
        role="owner"
    )
    User.objects.filter(role="operator", operator_read_only=True).update(role="viewer")


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0007_user_allowed_livestock_user_can_operate_crops_and_more"),
        ("notifications", "0006_marketingrecipient_whatsapp_phone"),
    ]
    operations = [migrations.RunPython(migrate_access, reverse_access)]
