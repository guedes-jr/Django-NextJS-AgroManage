from django.db import migrations, models
import django.utils.timezone


class Migration(migrations.Migration):
    dependencies = [("organizations", "0002_organizationaddress_organizationcontact")]

    operations = [
        migrations.AddField(
            model_name="organization", name="status",
            field=models.CharField(choices=[("active", "Ativa"), ("suspended", "Suspensa"), ("archived", "Arquivada")], default="active", max_length=12, db_index=True),
        ),
        migrations.AddField(
            model_name="organization", name="status_reason",
            field=models.CharField(blank=True, max_length=1000),
        ),
        migrations.AddField(
            model_name="organization", name="status_changed_at",
            field=models.DateTimeField(default=django.utils.timezone.now),
        ),
    ]
