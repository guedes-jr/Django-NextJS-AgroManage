from django.db import migrations


def backfill_maternity_batches(apps, schema_editor):
    Birth = apps.get_model("livestock", "Birth")
    Litter = apps.get_model("livestock", "Litter")
    AnimalBatch = apps.get_model("livestock", "AnimalBatch")
    BatchPhaseHistory = apps.get_model("livestock", "BatchPhaseHistory")

    births = Birth.objects.filter(batch__isnull=True).select_related(
        "female", "female__species", "female__breed"
    )
    for birth in births.iterator():
        litter = Litter.objects.filter(birth=birth).first()
        if litter and litter.weaning_date:
            continue

        base_code = f"MAT-{birth.female.identifier}-{birth.birth_order}"
        code = base_code[:50]
        suffix = 1
        while AnimalBatch.objects.filter(farm_id=birth.female.farm_id, batch_code=code).exists():
            suffix += 1
            code = f"{base_code[:46]}-{suffix}"

        batch = AnimalBatch.objects.create(
            farm_id=birth.female.farm_id,
            species_id=birth.female.species_id,
            breed_id=birth.female.breed_id,
            batch_code=code,
            name=f"Leitegada {birth.female.identifier} - parto {birth.birth_order}",
            quantity=max(0, birth.live_born - birth.mortality),
            entry_date=birth.birth_date,
            phase="gestacao_maternidade",
            category="Leitão",
            origin="born",
            status="active",
            mother_id=birth.female_id,
            avg_weight_kg=birth.avg_weight_kg,
            notes="Lote criado automaticamente para parto já existente.",
        )
        BatchPhaseHistory.objects.create(
            batch=batch,
            phase="gestacao_maternidade",
            quantity=batch.quantity,
            avg_weight_kg=batch.avg_weight_kg,
            entry_date=birth.birth_date,
        )
        birth.batch_id = batch.id
        birth.save(update_fields=["batch"])
        Litter.objects.get_or_create(birth=birth)


class Migration(migrations.Migration):
    dependencies = [("livestock", "0026_litter_next_mating_notice")]

    operations = [migrations.RunPython(backfill_maternity_batches, migrations.RunPython.noop)]
