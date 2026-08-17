from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("livestock", "0025_mating_reproductive_vaccine_schedule")]

    operations = [
        migrations.AddField(
            model_name="litter",
            name="next_mating_notice_days",
            field=models.PositiveSmallIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="litter",
            name="next_mating_notice_date",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="litter",
            name="next_mating_notification_sent",
            field=models.BooleanField(default=False),
        ),
    ]
