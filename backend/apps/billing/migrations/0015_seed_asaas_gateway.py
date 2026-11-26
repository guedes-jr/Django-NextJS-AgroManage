from django.db import migrations


def seed_asaas(apps, schema_editor):
    Gateway = apps.get_model("billing", "PaymentGatewayConfiguration")
    Gateway.objects.get_or_create(provider="asaas", defaults={"display_name": "Asaas", "environment": "sandbox"})


def remove_asaas(apps, schema_editor):
    apps.get_model("billing", "PaymentGatewayConfiguration").objects.filter(provider="asaas", is_default=False).delete()


class Migration(migrations.Migration):
    dependencies = [("billing", "0014_segment_item_active_and_split_herds")]
    operations = [migrations.RunPython(seed_asaas, remove_asaas)]
