# ruff: noqa: RUF012 -- Django migrations use declarative class attributes.
from django.db import migrations
from django.utils import timezone


def seed(apps, schema_editor):
    alias = schema_editor.connection.alias
    Policy = apps.get_model("notifications", "NotificationCategoryPolicy")
    Policy.objects.using(alias).filter(
        category__in=["animal_cycle", "animal", "stock"]
    ).update(whatsapp_enabled=True)
    Delivery = apps.get_model("notifications", "NotificationDelivery")
    Queue = apps.get_model("notifications", "WhatsAppQueueMessage")
    for d in (
        Delivery.objects.using(alias)
        .filter(channel="whatsapp_web")
        .select_related("notification__user")
        .iterator(chunk_size=200)
    ):
        n = d.notification
        u = n.user
        row, created = Queue.objects.using(alias).get_or_create(
            delivery_id=d.pk,
            defaults={
                "organization_id": u.organization_id,
                "recipient": u.full_name,
                "phone": u.phone,
                "title": n.title,
                "body": f"*{n.title}*\n{n.message}",
                "status": d.status,
                "attempts": d.attempts,
                "last_error": d.last_error,
                "delivered_at": d.delivered_at,
                "scheduled_for": timezone.now(),
                "history": [
                    {
                        "action": "import",
                        "status": d.status,
                        "at": timezone.now().isoformat(),
                        "note": "Histórico anterior à fila; conteúdo reconstruído da notificação.",
                    }
                ],
            },
        )
        if created:
            Queue.objects.using(alias).filter(pk=row.pk).update(
                created_at=d.created_at, updated_at=d.updated_at
            )


class Migration(migrations.Migration):
    dependencies = [("notifications", "0007_whatsappqueuemessage")]
    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
