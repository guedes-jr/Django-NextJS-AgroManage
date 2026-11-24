from django.db import migrations
from django.db.models import F, Q


def reconcile_animal_purchases(apps, schema_editor):
    Transaction = apps.get_model("finance", "Transaction")
    alias = schema_editor.connection.alias
    Transaction.objects.using(alias).filter(
        reference__startswith="PURCHASE-BATCH-",
        status="pending",
        payment_date__isnull=True,
    ).exclude(
        Q(species__code="bovinos") | Q(animal_batch__species__code="bovinos")
    ).update(
        status="paid",
        payment_date=F("due_date"),
    )


class Migration(migrations.Migration):
    dependencies = [
        ("finance", "0009_backfill_segmento"),
    ]

    operations = [
        migrations.RunPython(reconcile_animal_purchases, migrations.RunPython.noop),
    ]
