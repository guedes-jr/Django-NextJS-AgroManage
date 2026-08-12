from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("farms", "0004_farmstructure_built_area_m2_farmstructure_latitude_and_more")]

    operations = [
        migrations.AddField(
            model_name="farmstructure",
            name="last_maintenance_date",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="farmstructure",
            name="next_maintenance_date",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="farmstructure",
            name="maintenance_notes",
            field=models.TextField(blank=True),
        ),
    ]
