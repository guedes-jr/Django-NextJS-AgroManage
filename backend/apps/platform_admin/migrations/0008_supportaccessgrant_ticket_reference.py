from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("platform_admin", "0007_sandboxexecution"),
    ]

    operations = [
        migrations.AddField(
            model_name="supportaccessgrant",
            name="ticket_reference",
            field=models.CharField(blank=True, db_index=True, max_length=100),
        ),
    ]
