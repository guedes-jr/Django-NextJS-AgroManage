import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("notifications", "0001_initial"), migrations.swappable_dependency(settings.AUTH_USER_MODEL)]

    operations = [
        migrations.AddField(model_name="notification", name="event_key", field=models.CharField(blank=True, db_index=True, max_length=255)),
        migrations.AddField(model_name="notification", name="occurrence_count", field=models.PositiveIntegerField(default=1)),
        migrations.AddField(model_name="notification", name="last_occurred_at", field=models.DateTimeField(blank=True, null=True)),
        migrations.AddField(model_name="notification", name="is_archived", field=models.BooleanField(db_index=True, default=False)),
        migrations.AddField(model_name="notification", name="archived_at", field=models.DateTimeField(blank=True, null=True)),
        migrations.AddIndex(model_name="notification", index=models.Index(fields=["user", "is_archived", "created_at"], name="notif_user_archive_idx")),
        migrations.AddConstraint(model_name="notification", constraint=models.UniqueConstraint(condition=models.Q(("event_key__gt", ""), ("is_archived", False)), fields=("user", "event_key"), name="unique_active_notification_event_per_user")),
        migrations.CreateModel(name="NotificationDelivery", fields=[
            ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
            ("channel", models.CharField(choices=[("email", "E-mail"), ("web_push", "Web Push")], max_length=20)),
            ("status", models.CharField(choices=[("pending", "Pendente"), ("sent", "Enviada"), ("failed", "Falhou"), ("skipped", "Ignorada")], default="pending", max_length=20)),
            ("attempts", models.PositiveSmallIntegerField(default=0)), ("last_error", models.TextField(blank=True)),
            ("delivered_at", models.DateTimeField(blank=True, null=True)), ("created_at", models.DateTimeField(auto_now_add=True)), ("updated_at", models.DateTimeField(auto_now=True)),
            ("notification", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="deliveries", to="notifications.notification")),
        ]),
        migrations.AddConstraint(model_name="notificationdelivery", constraint=models.UniqueConstraint(fields=("notification", "channel"), name="unique_notification_delivery_channel")),
        migrations.CreateModel(name="PushSubscription", fields=[
            ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
            ("endpoint", models.URLField(max_length=1000, unique=True)), ("p256dh", models.CharField(max_length=255)), ("auth", models.CharField(max_length=255)),
            ("user_agent", models.CharField(blank=True, max_length=500)), ("is_active", models.BooleanField(default=True)),
            ("created_at", models.DateTimeField(auto_now_add=True)), ("updated_at", models.DateTimeField(auto_now=True)),
            ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="push_subscriptions", to=settings.AUTH_USER_MODEL)),
        ]),
    ]
