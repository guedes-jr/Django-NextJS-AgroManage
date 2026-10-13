import uuid
from django.db import models
from django.conf import settings
from django.utils import timezone
from django.db.models import Q


class NotificationType(models.TextChoices):
    SYSTEM = "system", "Sistema"
    STOCK = "stock", "Estoque"
    ANIMAL = "animal", "Animais"
    FINANCE = "finance", "Financeiro"
    REPORT = "report", "Relatórios"
    MARKETING = "marketing", "Propagandas"


class NotificationCategory(models.TextChoices):
    SYSTEM = "system", "Sistema"
    ANIMAL_CYCLE = "animal_cycle", "Ciclos dos animais"
    OVERDUE_PAYMENT = "overdue_payment", "Pagamentos atrasados"
    MARKETING = "marketing", "Propagandas"
    STOCK = "stock", "Estoque"
    ANIMAL = "animal", "Outros avisos de animais"
    FINANCE = "finance", "Outros avisos financeiros"
    REPORT = "report", "Relatórios"


class NotificationCategoryPolicy(models.Model):
    category = models.CharField(max_length=30, choices=NotificationCategory.choices, unique=True)
    enabled = models.BooleanField(default=True)
    in_app_enabled = models.BooleanField(default=True)
    email_enabled = models.BooleanField(default=True)
    push_enabled = models.BooleanField(default=True)
    whatsapp_enabled = models.BooleanField(default=False)
    repeat_cooldown_minutes = models.PositiveIntegerField(default=60)
    group_similar_minutes = models.PositiveIntegerField(default=0)
    max_per_day = models.PositiveIntegerField(default=50)
    updated_at = models.DateTimeField(auto_now=True)


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
    category = models.CharField(max_length=30, choices=NotificationCategory.choices, default=NotificationCategory.SYSTEM, db_index=True)
    priority = models.CharField(max_length=10, choices=NotificationPriority.choices, default=NotificationPriority.MEDIUM)
    title = models.CharField(max_length=200)
    message = models.TextField()
    link = models.CharField(max_length=500, blank=True, null=True)
    campaign = models.ForeignKey("MarketingCampaign", null=True, blank=True, on_delete=models.SET_NULL, related_name="notifications")
    group_items = models.JSONField(default=list, blank=True)
    show_in_app = models.BooleanField(default=True)
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
            models.UniqueConstraint(fields=["user", "campaign"], condition=Q(campaign__isnull=False), name="unique_user_marketing_campaign"),
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
    marketing_alerts = models.BooleanField(default=False)
    stock_alerts = models.BooleanField(default=True)
    animal_alerts = models.BooleanField(default=True)
    financial_alerts = models.BooleanField(default=True)
    report_alerts = models.BooleanField(default=True)
    email_notifications = models.BooleanField(default=True)
    push_notifications = models.BooleanField(default=True)
    whatsapp_reproductive_alerts = models.BooleanField(default=False)
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
        WHATSAPP_WEB = "whatsapp_web", "WhatsApp Web"

    class Status(models.TextChoices):
        PENDING = "pending", "Pendente"
        SENT = "sent", "Enviada"
        FAILED = "failed", "Falhou"
        SKIPPED = "skipped", "Ignorada"
        UNKNOWN = "unknown", "Resultado incerto"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    notification = models.ForeignKey(Notification, on_delete=models.CASCADE, related_name="deliveries")
    channel = models.CharField(max_length=20, choices=Channel.choices)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    attempts = models.PositiveSmallIntegerField(default=0)
    last_error = models.TextField(blank=True)
    processing_until = models.DateTimeField(blank=True, null=True)
    attempt_token = models.UUIDField(null=True, blank=True)
    parts_sent = models.PositiveSmallIntegerField(default=0)
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


class NotificationDailyGuard(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    category = models.CharField(max_length=30, choices=NotificationCategory.choices)
    day = models.DateField(db_index=True)
    created_count = models.PositiveIntegerField(default=0)
    duplicate_count = models.PositiveIntegerField(default=0)
    grouped_count = models.PositiveIntegerField(default=0)
    limited_count = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["user", "category", "day"], name="unique_notification_daily_guard")]


class NotificationOccurrence(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    key = models.CharField(max_length=255)
    notification = models.ForeignKey(Notification, null=True, on_delete=models.SET_NULL)
    last_seen_at = models.DateTimeField()

    class Meta:
        constraints = [models.UniqueConstraint(fields=["user", "key"], name="unique_notification_occurrence")]


class MarketingAudience(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=150)
    filters = models.JSONField(default=dict)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class MarketingImage(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    image = models.ImageField(upload_to="marketing/%Y/%m/")
    mime_type = models.CharField(max_length=30)
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)


class MarketingCampaign(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Rascunho"
        QUEUED = "queued", "Na fila"
        PROCESSING = "processing", "Processando"
        COMPLETED = "completed", "Concluída"
        CANCELLED = "cancelled", "Cancelada"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=200)
    body = models.TextField()
    link_url = models.URLField(max_length=500, blank=True)
    link_label = models.CharField(max_length=80, blank=True)
    images = models.ManyToManyField(MarketingImage, blank=True)
    audience = models.ForeignKey(MarketingAudience, on_delete=models.PROTECT, related_name="campaigns")
    send_in_app = models.BooleanField(default=True)
    send_whatsapp = models.BooleanField(default=False)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT, db_index=True)
    audience_filters = models.JSONField(default=dict, blank=True)
    recipient_count = models.PositiveIntegerField(default=0)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL)
    queued_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class MarketingRecipient(models.Model):
    campaign = models.ForeignKey(MarketingCampaign, on_delete=models.CASCADE, related_name="recipients")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL)
    organization = models.ForeignKey("organizations.Organization", null=True, on_delete=models.SET_NULL)
    notification = models.OneToOneField(Notification, null=True, blank=True, on_delete=models.SET_NULL, related_name="marketing_recipient")
    in_app = models.BooleanField(default=False)
    whatsapp = models.BooleanField(default=False)
    whatsapp_phone = models.CharField(max_length=30, blank=True)
    prepared_at = models.DateTimeField(null=True, blank=True)
    skip_reason = models.CharField(max_length=300, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["campaign", "user"], name="unique_campaign_recipient")]


class WhatsAppQueueMessage(models.Model):
    """Durable outbox for notification deliveries and administrator messages."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    delivery = models.OneToOneField(NotificationDelivery, null=True, blank=True, on_delete=models.CASCADE, related_name='whatsapp_message')
    organization = models.ForeignKey('organizations.Organization', null=True, blank=True, on_delete=models.SET_NULL)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    recipient = models.CharField(max_length=255, blank=True)
    phone = models.CharField(max_length=30)
    title = models.CharField(max_length=200, blank=True)
    body = models.TextField()
    is_edited = models.BooleanField(default=False)
    last_enqueued_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=NotificationDelivery.Status.choices, default='pending', db_index=True)
    attempts = models.PositiveIntegerField(default=0)
    last_error = models.TextField(blank=True)
    processing_until = models.DateTimeField(null=True, blank=True)
    scheduled_for = models.DateTimeField(default=timezone.now, db_index=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    history = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at', '-pk']
