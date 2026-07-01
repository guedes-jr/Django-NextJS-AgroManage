from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("inventory", "0020_alter_itemestoque_categoria_crop_categories"),
    ]

    operations = [
        migrations.AddField(
            model_name="movimentacaoestoque",
            name="destino",
            field=models.CharField(blank=True, default="", max_length=100),
        ),
    ]
