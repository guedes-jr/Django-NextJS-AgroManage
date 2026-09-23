from django.db import migrations


def cancel_feed_production_purchases(apps, schema_editor):
    """Manufacturing feed must not remain booked as a new purchase."""
    Transaction = apps.get_model("finance", "Transaction")
    LoteEstoque = apps.get_model("inventory", "LoteEstoque")

    production_lot_ids = LoteEstoque.objects.filter(
        numero_lote__startswith="PROD-"
    ).values_list("id", flat=True)
    references = [f"LOTE-{lot_id}" for lot_id in production_lot_ids]
    if references:
        Transaction.objects.filter(reference__in=references).exclude(
            status="cancelled"
        ).update(status="cancelled")


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("finance", "0004_transaction_livestock_links"),
        ("inventory", "0027_materialize_unlinked_feed_productions"),
    ]

    operations = [
        migrations.RunPython(cancel_feed_production_purchases, noop),
    ]
