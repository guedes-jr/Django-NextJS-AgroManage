from decimal import Decimal

import django.db.models.deletion
from django.db import migrations, models
import uuid


SEGMENTS = (
    {
        "code": "suinocultura-ciclo-completo",
        "name": "Suinocultura",
        "subtitle": "Ciclo completo",
        "description": "Gerencie reprodução, maternidade, crescimento e terminação em uma única rotina.",
        "image_path": "/landing-livestock.png",
        "icon": "pig",
        "accent": "wine",
        "metric_label": "matrizes",
        "sort_order": 10,
        "tiers": (("1 a 10 matrizes", 1, 10, "39.90"), ("11 a 50 matrizes", 11, 50, "59.90"), ("51 a 100 matrizes", 51, 100, "89.90"), ("101 a 200 matrizes", 101, 200, "129.90"), ("Acima de 200 matrizes", 201, None, None)),
    },
    {
        "code": "suinocultura-engorda",
        "name": "Suinocultura",
        "subtitle": "Engorda",
        "description": "Acompanhe lotes, consumo e desempenho da fase de crescimento à terminação.",
        "image_path": "/images/reproduction/crescimento.png",
        "icon": "pig",
        "accent": "wine",
        "metric_label": "animais",
        "sort_order": 20,
        "tiers": (("Até 200 animais", 1, 200, "39.90"), ("201 a 1.000 animais", 201, 1000, "59.90"), ("Acima de 1.000 animais", 1001, None, None)),
    },
    {
        "code": "plantacoes",
        "name": "Plantações",
        "subtitle": "Planejamento e produtividade",
        "description": "Controle cultivos, insumos, operações e custos do plantio à colheita.",
        "image_path": "/landing-agriculture.png",
        "icon": "sprout",
        "accent": "green",
        "metric_label": "hectares",
        "sort_order": 30,
        "tiers": (("Até 1 hectare", 1, 1, "39.90"), ("1 a 3 hectares", 2, 3, "59.90"), ("4 a 9 hectares", 4, 9, "99.90"), ("10 a 30 hectares", 10, 30, "169.90"), ("Acima de 30 hectares", 31, None, None)),
    },
)


def seed_segments(apps, schema_editor):
    PlanSegment = apps.get_model("billing", "PlanSegment")
    PlanTier = apps.get_model("billing", "PlanTier")
    for data in SEGMENTS:
        tiers = data["tiers"]
        segment, _ = PlanSegment.objects.update_or_create(
            code=data["code"],
            defaults={key: value for key, value in data.items() if key != "tiers"},
        )
        for order, (label, minimum, maximum, price) in enumerate(tiers, start=1):
            PlanTier.objects.update_or_create(
                segment=segment,
                label=label,
                defaults={
                    "minimum_quantity": minimum,
                    "maximum_quantity": maximum,
                    "monthly_price": Decimal(price) if price else None,
                    "requires_quote": price is None,
                    "sort_order": order * 10,
                },
            )


def remove_seeded_segments(apps, schema_editor):
    PlanSegment = apps.get_model("billing", "PlanSegment")
    PlanSegment.objects.filter(code__in=[item["code"] for item in SEGMENTS]).delete()


class Migration(migrations.Migration):
    dependencies = [("billing", "0004_subscription_discounts")]

    operations = [
        migrations.CreateModel(
            name="PlanSegment",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("code", models.SlugField(max_length=80, unique=True)),
                ("name", models.CharField(max_length=120)),
                ("subtitle", models.CharField(max_length=160)),
                ("description", models.TextField()),
                ("image_path", models.CharField(blank=True, max_length=255)),
                ("icon", models.CharField(default="sprout", max_length=40)),
                ("accent", models.CharField(choices=[("green", "Verde"), ("wine", "Vinho")], default="green", max_length=12)),
                ("metric_label", models.CharField(blank=True, max_length=80)),
                ("annual_discount_percent", models.DecimalField(decimal_places=2, default=15, max_digits=5)),
                ("is_active", models.BooleanField(default=True)),
                ("is_public", models.BooleanField(default=True)),
                ("sort_order", models.PositiveSmallIntegerField(default=0)),
            ],
            options={"ordering": ("sort_order", "name", "subtitle")},
        ),
        migrations.CreateModel(
            name="PlanTier",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("label", models.CharField(max_length=120)),
                ("minimum_quantity", models.PositiveIntegerField(blank=True, null=True)),
                ("maximum_quantity", models.PositiveIntegerField(blank=True, null=True)),
                ("monthly_price", models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ("requires_quote", models.BooleanField(default=False)),
                ("is_active", models.BooleanField(default=True)),
                ("sort_order", models.PositiveSmallIntegerField(default=0)),
                ("segment", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="tiers", to="billing.plansegment")),
            ],
            options={"ordering": ("sort_order", "minimum_quantity", "label")},
        ),
        migrations.AddConstraint(
            model_name="plantier",
            constraint=models.UniqueConstraint(fields=("segment", "label"), name="unique_plan_segment_tier_label"),
        ),
        migrations.RunPython(seed_segments, remove_seeded_segments),
    ]
