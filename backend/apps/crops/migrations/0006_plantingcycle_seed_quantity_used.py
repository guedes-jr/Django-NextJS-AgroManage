from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("crops", "0005_add_irrigation_model"),
    ]

    operations = [
        migrations.AddField(
            model_name="plantingcycle",
            name="seed_quantity_used",
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True),
        ),
    ]
