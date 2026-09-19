import uuid
from django.db import models
from django.conf import settings
from django.db.models import Q


class NotificationType(models.TextChoices):
    SYSTEM = "system", "Sistema"
    STOCK = "stock", "Estoque"
    ANIMAL = "animal", "Animais"
    FINANCE = "finance", "Financeiro"
    REPORT = "report", "Relatórios"


class NotificationPriority(models.TextChoices):
    LOW = "low", "Baixa"
    MEDIUM = "medium", "Média"
    HIGH = "high", "Alta"
    URGENT = "urgent", "Urgente"


class Notification(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications"
    )
    type = models.CharField(max_length=20, choices=NotificationType.choices, default=NotificationType.SYSTEM)
    priority = models.CharField(max_length=10, choices=NotificationPriority.choices, default=NotificationPriority.MEDIUM)
    title = models.CharField(max_length=200)
    message = models.TextField()
    link = models.CharField(max_length=500, blank=True, null=True)
    is_read = models.BooleanField(default=False)
    read_at = models.DateTimeField(blank=True, null=True)
    event_key = models.CharField(max_length=255, blank=True, db_index=True)
    occurrence_count = models.PositiveIntegerField(default=1)
    last_occurred_at = models.DateTimeField(blank=True, null=True)
    is_archived = models.BooleanField(default=False, db_index=True)
    archived_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "is_read"]),
            models.Index(fields=["created_at"]),
            models.Index(fields=["user", "is_archived", "created_at"], name="notif_user_archive_idx"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "event_key"],
                condition=Q(event_key__gt="", is_archived=False),
                name="unique_active_notification_event_per_user",
            ),
        ]

    def __str__(self):
        return f"{self.title} - {self.user.email}"


class NotificationPreference(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notification_preference"
    )
    stock_alerts = models.BooleanField(default=True)
    animal_alerts = models.BooleanField(default=True)
    financial_alerts = models.BooleanField(default=True)
    report_alerts = models.BooleanField(default=True)
    email_notifications = models.BooleanField(default=True)
    push_notifications = models.BooleanField(default=True)
    frequency = models.CharField(
        max_length=20,
        choices=[
            ("instant", "Instantâneo"),
            ("daily", "Diário"),
            ("weekly", "Semanal"),
        ],
        default="instant"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Preferências de {self.user.email}"


class NotificationTemplate(models.Model):
    """Templates para notificações automáticas"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(max_length=50, unique=True)
    type = models.CharField(max_length=20, choices=NotificationType.choices)
    priority = models.CharField(max_length=10, choices=NotificationPriority.choices, default=NotificationPriority.MEDIUM)
    title_template = models.CharField(max_length=200)
    message_template = models.TextField()
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.code} - {self.type}"


class NotificationDelivery(models.Model):
    class Channel(models.TextChoices):
        EMAIL = "email", "E-mail"
        WEB_PUSH = "web_push", "Web Push"

    class Status(models.TextChoices):
        PENDING = "pending", "Pendente"
        SENT = "sent", "Enviada"
        FAILED = "failed", "Falhou"
        SKIPPED = "skipped", "Ignorada"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    notification = models.ForeignKey(Notification, on_delete=models.CASCADE, related_name="deliveries")
    channel = models.CharField(max_length=20, choices=Channel.choices)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    attempts = models.PositiveSmallIntegerField(default=0)
    last_error = models.TextField(blank=True)
    delivered_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["notification", "channel"], name="unique_notification_delivery_channel")]


class PushSubscription(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="push_subscriptions")
    endpoint = models.URLField(max_length=1000, unique=True)
    p256dh = models.CharField(max_length=255)
    auth = models.CharField(max_length=255)
    user_agent = models.CharField(max_length=500, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
