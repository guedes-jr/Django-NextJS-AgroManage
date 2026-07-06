from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("inventory", "0023_itemestoque_categorias"),
    ]

    operations = [
        migrations.AlterField(
            model_name="itemestoque",
            name="categoria",
            field=models.CharField(
                choices=[
                    ("racao", "Ração"),
                    ("nucleo", "Suplementos"),
                    ("suplemento", "Suplemento Animal"),
                    ("semente", "Sementes/mudas"),
                    ("fertilizante", "Adubos"),
                    ("foliar", "Foliares"),
                    ("defensivo", "Defensivo Agrícola"),
                    ("corretivo", "Corretivo de Solo"),
                    ("medicamento", "Medicamento"),
                    ("vacina", "Vacina"),
                    ("medicamento_vacina", "Medicamentos e Vacinas"),
                    ("material", "Material"),
                    ("semen", "Sêmen"),
                    ("outro", "Outro"),
                ],
                max_length=30,
            ),
        ),
    ]
