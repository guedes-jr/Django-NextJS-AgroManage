from django.db import migrations, models


CATEGORY_CHOICES = [
    ("racao", "Ração"),
    ("nucleo", "Suplementos"),
    ("suplemento", "Suplemento Animal"),
    ("semente", "Sementes/mudas"),
    ("fertilizante", "Adubos"),
    ("fertirrigacao", "Fertirrigação"),
    ("defensivo", "Foliares / Defensivos"),
    ("corretivo", "Corretivo de Solo"),
    ("medicamento", "Medicamento"),
    ("vacina", "Vacina"),
    ("medicamento_vacina", "Medicamentos e Vacinas"),
    ("material", "Material"),
    ("semen", "Sêmen"),
    ("outro", "Outro"),
]


def merge_foliar_into_defensivo(apps, schema_editor):
    ItemEstoque = apps.get_model("inventory", "ItemEstoque")
    for item in ItemEstoque.objects.all().only("id", "categoria", "categorias"):
        changed = False
        if item.categoria == "foliar":
            item.categoria = "defensivo"
            changed = True

        categorias = item.categorias or []
        if "foliar" in categorias:
            merged = ["defensivo" if categoria == "foliar" else categoria for categoria in categorias]
            item.categorias = list(dict.fromkeys(merged))
            changed = True

        if changed:
            item.save(update_fields=["categoria", "categorias"])


class Migration(migrations.Migration):
    dependencies = [
        ("inventory", "0024_alter_itemestoque_categoria"),
    ]

    operations = [
        migrations.RunPython(merge_foliar_into_defensivo, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="itemestoque",
            name="categoria",
            field=models.CharField(choices=CATEGORY_CHOICES, max_length=30),
        ),
    ]
