import django.db.models.deletion
import uuid
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("crops", "0012_pesticideapplicationequipment"),
        ("farms", "0004_farmstructure_built_area_m2_farmstructure_latitude_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="SectorStructureItem",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("group", models.CharField(choices=[("irrigation", "Irrigação"), ("support", "Estrutura de sustentação"), ("fence", "Cercas e divisões"), ("storage", "Depósitos e armazenagem"), ("water", "Reservatórios e água"), ("electrical", "Instalações elétricas"), ("machine", "Máquinas e implementos"), ("vehicle", "Veículos"), ("other", "Outros")], default="other", max_length=30)),
                ("item_type", models.CharField(max_length=150)),
                ("specification", models.CharField(blank=True, max_length=255)),
                ("quantity", models.DecimalField(decimal_places=2, default=1, max_digits=14)),
                ("unit", models.CharField(default="un", max_length=20)),
                ("unit_value", models.DecimalField(decimal_places=2, default=0, max_digits=16)),
                ("total_value", models.DecimalField(decimal_places=2, default=0, max_digits=18)),
                ("notes", models.TextField(blank=True)),
                ("farm_structure", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="sector_allocations", to="farms.farmstructure")),
                ("plantation", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="sector_structure_items", to="crops.plantingcycle")),
            ],
            options={
                "verbose_name": "Estrutura utilizada no setor",
                "verbose_name_plural": "Estruturas utilizadas nos setores",
                "ordering": ["-created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="sectorstructureitem",
            index=models.Index(fields=["plantation", "group"], name="crops_secto_plantat_1cb87b_idx"),
        ),
    ]
