import django.db.models.deletion
from django.db import migrations, models


def link_legacy_transactions(apps, schema_editor):
    Transaction = apps.get_model("finance", "Transaction")
    AnimalBatch = apps.get_model("livestock", "AnimalBatch")
    Species = apps.get_model("livestock", "Species")
    LoteEstoque = apps.get_model("inventory", "LoteEstoque")

    for batch in AnimalBatch.objects.select_related("species").all().iterator():
        for prefix in ("PURCHASE-BATCH-", "SALE-BATCH-"):
            Transaction.objects.filter(reference=f"{prefix}{batch.pk}").update(
                animal_batch_id=batch.pk,
                species_id=batch.species_id,
            )

    code_map = {
        "suino": ("suino", "suinos"),
        "bovino": ("bovino", "bovinos"),
        "ave": ("ave", "aves"),
    }
    species_by_inventory_code = {}
    for inventory_code, livestock_codes in code_map.items():
        species = Species.objects.filter(code__in=livestock_codes).first()
        if species:
            species_by_inventory_code[inventory_code] = species.pk

    for lot in LoteEstoque.objects.exclude(item__especie_animal="").select_related("item").iterator():
        species_id = species_by_inventory_code.get(lot.item.especie_animal)
        if species_id:
            Transaction.objects.filter(reference=f"LOTE-{lot.pk}").update(species_id=species_id)


class Migration(migrations.Migration):
    dependencies = [
        ("finance", "0003_add_planting_model_and_transaction_fk"),
        ("inventory", "0026_consumoracao_individual_animals"),
        ("livestock", "0026_litter_next_mating_notice"),
    ]

    operations = [
        migrations.AddField(
            model_name="transaction",
            name="animal_batch",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="finance_transactions",
                to="livestock.animalbatch",
            ),
        ),
        migrations.AddField(
            model_name="transaction",
            name="species",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="finance_transactions",
                to="livestock.species",
            ),
        ),
        migrations.RunPython(link_legacy_transactions, migrations.RunPython.noop),
    ]
