from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("organizations", "0004_backfill_organization_status")]

    operations = [
        migrations.AddConstraint(
            model_name="organization",
            constraint=models.CheckConstraint(
                condition=(models.Q(status="active", is_active=True) | models.Q(status__in=["suspended", "archived"], is_active=False)),
                name="organization_status_matches_active",
            ),
        ),
    ]
