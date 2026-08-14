from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("inventory", "0025_merge_foliar_add_fertigation"),
        ("livestock", "0024_birth_reproductive_vaccine_schedule"),
    ]

    operations = [
        migrations.AlterField(
            model_name="consumoracao",
            name="lote_animal",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="consumos", to="livestock.animalbatch"),
        ),
        migrations.AddField(
            model_name="consumoracao",
            name="animais",
            field=models.ManyToManyField(blank=True, related_name="consumos_racao", to="livestock.animal"),
        ),
        migrations.AddField(
            model_name="consumoracao",
            name="categoria_destino",
            field=models.CharField(blank=True, max_length=30),
        ),
        migrations.AddField(
            model_name="consumoracao",
            name="fase_destino",
            field=models.CharField(blank=True, max_length=30),
        ),
    ]
