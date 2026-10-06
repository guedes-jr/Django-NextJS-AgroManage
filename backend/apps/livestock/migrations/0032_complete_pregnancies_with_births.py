from django.db import migrations


def complete_pregnancies_with_births(apps, schema_editor):
    Pregnancy = apps.get_model("livestock", "Pregnancy")
    Pregnancy.objects.filter(status="ongoing", birth__isnull=False).update(status="completed")


class Migration(migrations.Migration):
    dependencies = [
        ("livestock", "0031_animalbatch_birth_date"),
    ]

    operations = [
        migrations.RunPython(complete_pregnancies_with_births, migrations.RunPython.noop),
    ]
