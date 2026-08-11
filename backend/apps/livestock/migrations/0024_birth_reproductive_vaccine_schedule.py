from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("inventory", "0025_merge_foliar_add_fertigation"),
        ("livestock", "0023_birth_expected_weaning_days"),
    ]

    operations = [
        migrations.AddField(
            model_name="birth",
            name="reproductive_vaccine_days",
            field=models.PositiveSmallIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="birth",
            name="reproductive_vaccine_due_date",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="birth",
            name="reproductive_vaccine_item",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="scheduled_reproductive_vaccinations",
                to="inventory.itemestoque",
            ),
        ),
        migrations.AddField(
            model_name="birth",
            name="reproductive_vaccine_notification_sent",
            field=models.BooleanField(default=False),
        ),
    ]
