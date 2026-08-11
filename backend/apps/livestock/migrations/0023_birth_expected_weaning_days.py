from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("livestock", "0022_heatrecord_littermedication"),
    ]

    operations = [
        migrations.AddField(
            model_name="birth",
            name="expected_weaning_days",
            field=models.PositiveSmallIntegerField(
                default=21,
                help_text="Quantidade de dias após o parto prevista para o desmame",
            ),
        ),
    ]
