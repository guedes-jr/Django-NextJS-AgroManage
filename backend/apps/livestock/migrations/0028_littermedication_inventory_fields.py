from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [("livestock", "0027_backfill_birth_maternity_batches")]

    operations = [
        migrations.AddField(
            model_name="littermedication",
            name="inventory_item",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="litter_applications", to="inventory.itemestoque"),
        ),
        migrations.AddField(
            model_name="littermedication",
            name="animal_count",
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="littermedication",
            name="inventory_quantity",
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True),
        ),
    ]
