from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("accounts", "0010_backfill_organization_responsible")]

    operations = [
        migrations.AddConstraint(
            model_name="user",
            constraint=models.UniqueConstraint(
                fields=("organization",), condition=models.Q(organization_responsible=True),
                name="unique_organization_responsible",
            ),
        ),
    ]
