from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("accounts", "0003_user_preferences")]

    operations = [
        migrations.AddField(
            model_name="user",
            name="session_version",
            field=models.PositiveBigIntegerField(default=0),
        ),
    ]
