from django.db import migrations, models


def seed_categorias(apps, schema_editor):
    ItemEstoque = apps.get_model("inventory", "ItemEstoque")
    for item in ItemEstoque.objects.all().only("id", "categoria", "categorias"):
        if not item.categorias:
            item.categorias = [item.categoria] if item.categoria else []
            item.save(update_fields=["categorias"])


class Migration(migrations.Migration):

    dependencies = [
        ("inventory", "0022_update_inventory_category_labels"),
    ]

    operations = [
        migrations.AddField(
            model_name="itemestoque",
            name="categorias",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.RunPython(seed_categorias, migrations.RunPython.noop),
    ]
