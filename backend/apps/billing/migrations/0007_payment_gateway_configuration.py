from django.db import migrations, models
import uuid


def seed_gerencianet(apps, schema_editor):
    Gateway = apps.get_model("billing", "PaymentGatewayConfiguration")
    Gateway.objects.get_or_create(
        provider="gerencianet",
        defaults={"display_name": "Gerencianet / Efí", "environment": "sandbox"},
    )


def remove_gerencianet(apps, schema_editor):
    apps.get_model("billing", "PaymentGatewayConfiguration").objects.filter(provider="gerencianet").delete()


class Migration(migrations.Migration):
    dependencies = [("billing", "0006_subscription_quotes")]
    operations = [
        migrations.CreateModel(
            name="PaymentGatewayConfiguration",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("provider", models.SlugField(max_length=50, unique=True)),
                ("display_name", models.CharField(max_length=100)),
                ("environment", models.CharField(choices=[("sandbox", "Homologação"), ("production", "Produção")], default="sandbox", max_length=20)),
                ("is_enabled", models.BooleanField(default=False)),
                ("is_default", models.BooleanField(default=False)),
                ("encrypted_credentials", models.TextField(blank=True, editable=False)),
                ("settings", models.JSONField(blank=True, default=dict)),
                ("last_health_status", models.CharField(choices=[("unknown", "Não verificado"), ("healthy", "Disponível"), ("error", "Com erro")], default="unknown", max_length=20)),
                ("last_health_message", models.CharField(blank=True, max_length=500)),
                ("last_health_check_at", models.DateTimeField(blank=True, null=True)),
            ],
            options={"ordering": ("display_name",)},
        ),
        migrations.AddConstraint(model_name="paymentgatewayconfiguration", constraint=models.UniqueConstraint(condition=models.Q(is_default=True), fields=("is_default",), name="unique_default_payment_gateway")),
        migrations.RunPython(seed_gerencianet, remove_gerencianet),
    ]
