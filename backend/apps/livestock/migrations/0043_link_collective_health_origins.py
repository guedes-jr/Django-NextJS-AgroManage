from django.db import migrations


def link_health(apps, schema_editor):
    Management = apps.get_model("livestock", "CattleManagement")
    Health = apps.get_model("livestock", "HealthRecord")
    for management in Management.objects.filter(kind="sanitary", status="confirmed").prefetch_related("entries").iterator(chunk_size=200):
        for entry in management.entries.all():
            candidates = Health.objects.filter(cattle_management__isnull=True, animal_id=entry.animal_id,
                farm_id=management.farm_id, application_date=management.date, description=management.description,
                veterinary=management.responsible, treatment_type=management.treatment_type, cost=management.cost_per_animal)
            matches = list(candidates.values_list("pk", flat=True)[:2])
            if len(matches) == 1:
                Health.objects.filter(pk=matches[0]).update(cattle_management_id=management.pk)


class Migration(migrations.Migration):
    dependencies = [("livestock", "0042_animal_cattle_purpose_animalbatch_cattle_purpose_and_more")]
    operations = [migrations.RunPython(link_health, migrations.RunPython.noop)]
