from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("platform_admin", "0009_demorequest")]
    operations = [
        migrations.AddField(model_name="demorequest", name="selected_plan", field=models.CharField(blank=True, max_length=80)),
        migrations.AddField(model_name="demorequest", name="landing_path", field=models.CharField(blank=True, max_length=255)),
        migrations.AddField(model_name="demorequest", name="utm_source", field=models.CharField(blank=True, max_length=120)),
        migrations.AddField(model_name="demorequest", name="utm_medium", field=models.CharField(blank=True, max_length=120)),
        migrations.AddField(model_name="demorequest", name="utm_campaign", field=models.CharField(blank=True, max_length=120)),
    ]
