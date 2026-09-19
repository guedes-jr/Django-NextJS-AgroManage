import django.db.models.deletion
import uuid
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("billing", "0007_payment_gateway_configuration")]

    operations = [
        migrations.CreateModel(
            name="SubscriptionItem",
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
                ("subscription", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="items", to="billing.subscription")),
                ("tier", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="subscription_items", to="billing.plantier")),
            ],
            options={"ordering": ("created_at",)},
        ),
        migrations.AddConstraint(
            model_name="subscriptionitem",
            constraint=models.UniqueConstraint(fields=("subscription", "segment_code"), name="unique_subscription_segment"),
        ),
    ]
