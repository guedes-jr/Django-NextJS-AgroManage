from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("notifications", "0009_whatsappqueuemessage_last_enqueued_at")]

    operations = [
        migrations.AddField(
            model_name="marketingcampaign",
            name="category",
            field=models.CharField(
                choices=[("system", "Comunicado / cobrança"), ("marketing", "Propaganda")],
                default="marketing",
                max_length=30,
            ),
        ),
    ]
