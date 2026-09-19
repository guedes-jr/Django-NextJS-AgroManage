import django.db.models.deletion
from django.db import migrations, models
import uuid


class Migration(migrations.Migration):
    dependencies = [("billing", "0005_plan_segments")]

    operations = [
        migrations.CreateModel(
            name="SubscriptionQuote",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("public_token", models.UUIDField(default=uuid.uuid4, editable=False, unique=True)),
                ("status", models.CharField(choices=[("draft", "Rascunho"), ("converted", "Convertido"), ("expired", "Expirado")], default="draft", max_length=20)),
                ("billing_cycle", models.CharField(choices=[("monthly", "Mensal"), ("yearly", "Anual")], max_length=20)),
                ("currency", models.CharField(default="BRL", max_length=3)),
                ("monthly_subtotal", models.DecimalField(decimal_places=2, max_digits=14)),
                ("monthly_discount", models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ("monthly_total", models.DecimalField(decimal_places=2, max_digits=14)),
                ("billing_total", models.DecimalField(decimal_places=2, max_digits=14)),
                ("requires_contact", models.BooleanField(default=False)),
                ("expires_at", models.DateTimeField(db_index=True)),
            ],
            options={"ordering": ("-created_at",)},
        ),
        migrations.CreateModel(
            name="SubscriptionQuoteItem",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("segment_code", models.SlugField(max_length=80)),
                ("segment_name", models.CharField(max_length=120)),
                ("segment_subtitle", models.CharField(max_length=160)),
                ("tier_label", models.CharField(max_length=120)),
                ("monthly_price", models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ("discount_percent", models.DecimalField(decimal_places=2, default=0, max_digits=5)),
                ("final_monthly_price", models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ("requires_quote", models.BooleanField(default=False)),
                ("quote", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="items", to="billing.subscriptionquote")),
                ("tier", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="quote_items", to="billing.plantier")),
            ],
            options={"ordering": ("created_at",)},
        ),
    ]
