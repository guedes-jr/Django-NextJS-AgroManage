from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("ai_assistant", "0004_aimessage_fallback_count_aimessage_provider_and_more")
    ]

    operations = [
        migrations.AddField(
            model_name="aiproviderconfiguration",
            name="encrypted_api_key",
            field=models.TextField(blank=True, editable=False),
        ),
    ]
