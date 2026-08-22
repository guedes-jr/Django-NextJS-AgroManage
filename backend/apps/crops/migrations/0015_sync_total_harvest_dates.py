from django.db import migrations
from django.db.models import Max


def sync_total_harvest_dates(apps, schema_editor):
    Harvest = apps.get_model("crops", "Harvest")
    PlantingCycle = apps.get_model("crops", "PlantingCycle")

    totals = (
        Harvest.objects.filter(harvest_type="total")
        .values("planting_cycle_id")
        .annotate(last_harvest_date=Max("harvest_date"))
    )
    for total in totals.iterator():
        PlantingCycle.objects.filter(pk=total["planting_cycle_id"]).update(
            actual_harvest_date=total["last_harvest_date"],
            status="finished",
        )


class Migration(migrations.Migration):
    dependencies = [("crops", "0014_increase_total_price_max_digits")]

    operations = [
        migrations.RunPython(sync_total_harvest_dates, migrations.RunPython.noop),
    ]
