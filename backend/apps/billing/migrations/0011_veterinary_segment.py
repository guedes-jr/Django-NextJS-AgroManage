from django.db import migrations

CODE = "area-veterinario"


def create_segment(apps, schema_editor):
    PlanSegment = apps.get_model("billing", "PlanSegment")
    PlanTier = apps.get_model("billing", "PlanTier")
    segment, _ = PlanSegment.objects.update_or_create(
        code=CODE,
        defaults={
            "name": "Área do veterinário",
            "subtitle": "Atendimentos e reprodução",
            "description": "Clientes, animais atendidos, diagnóstico de gestação, protocolos IATF, alertas para o curral, relatórios e cobrança.",
            "image_path": "/landing-livestock.png",
            "icon": "stethoscope",
            "accent": "green",
            "metric_label": "animais atendidos",
            "sort_order": 40,
        },
    )
    # Price is defined later by the platform team; until then the segment is offered on request.
    PlanTier.objects.get_or_create(segment=segment, label="Sob consulta", defaults={"requires_quote": True, "sort_order": 10})


def remove_segment(apps, schema_editor):
    apps.get_model("billing", "PlanSegment").objects.filter(code=CODE).delete()


class Migration(migrations.Migration):
    dependencies = [("billing", "0010_organizationstoragestate_organizationstoredfile")]

    operations = [migrations.RunPython(create_segment, remove_segment)]
