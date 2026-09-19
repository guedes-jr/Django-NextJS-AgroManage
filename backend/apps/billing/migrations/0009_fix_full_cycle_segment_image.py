from django.db import migrations


PIG_IMAGE = "/images/reproduction/maternidade.png"
OLD_IMAGE = "/landing-livestock.png"


def use_pig_image(apps, schema_editor):
    PlanSegment = apps.get_model("billing", "PlanSegment")
    PlanSegment.objects.filter(code="suinocultura-ciclo-completo").update(image_path=PIG_IMAGE)


def restore_old_image(apps, schema_editor):
    PlanSegment = apps.get_model("billing", "PlanSegment")
    PlanSegment.objects.filter(code="suinocultura-ciclo-completo").update(image_path=OLD_IMAGE)


class Migration(migrations.Migration):
    dependencies = [("billing", "0008_subscription_items")]

    operations = [migrations.RunPython(use_pig_image, restore_old_image)]
