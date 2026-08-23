from django.conf import settings
from django.db import models

from common.models import BaseModel


class AIProviderConfiguration(BaseModel):
    class HealthStatus(models.TextChoices):
        UNKNOWN = "unknown", "Não verificado"
        HEALTHY = "healthy", "Disponível"
        DEGRADED = "degraded", "Instável"
        UNAVAILABLE = "unavailable", "Indisponível"

    provider = models.SlugField(max_length=50, unique=True)
    display_name = models.CharField(max_length=100)
    base_url = models.URLField(max_length=500)
    api_key_env_var = models.CharField(
        max_length=100,
        blank=True,
        help_text="Nome da variável de ambiente que contém a credencial; nunca armazene a chave aqui.",
    )
    is_enabled = models.BooleanField(default=False)
    is_default = models.BooleanField(default=False)
    timeout_seconds = models.PositiveSmallIntegerField(default=45)
    last_health_check_at = models.DateTimeField(null=True, blank=True)
    last_health_status = models.CharField(
        max_length=20, choices=HealthStatus.choices, default=HealthStatus.UNKNOWN
    )
    last_health_message = models.CharField(max_length=500, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta(BaseModel.Meta):
        ordering = ("display_name",)
        constraints = [
            models.UniqueConstraint(
                fields=("is_default",),
                condition=models.Q(is_default=True),
                name="unique_default_ai_provider",
            ),
            models.CheckConstraint(
                condition=models.Q(timeout_seconds__gte=1),
                name="ai_provider_timeout_positive",
            ),
        ]

    def __str__(self):
        return self.display_name


class AIModel(BaseModel):
    class EndpointType(models.TextChoices):
        CHAT_COMPLETIONS = "chat_completions", "Chat Completions"
        RESPONSES = "responses", "Responses"

    provider = models.ForeignKey(
        AIProviderConfiguration, on_delete=models.CASCADE, related_name="models"
    )
    external_id = models.CharField(max_length=150)
    display_name = models.CharField(max_length=150)
    endpoint_type = models.CharField(
        max_length=30,
        choices=EndpointType.choices,
        default=EndpointType.CHAT_COMPLETIONS,
    )
    is_free = models.BooleanField(default=False, db_index=True)
    is_available = models.BooleanField(default=True, db_index=True)
    is_enabled = models.BooleanField(default=False)
    is_primary = models.BooleanField(default=False)
    priority = models.PositiveSmallIntegerField(default=100)
    supports_streaming = models.BooleanField(default=False)
    supports_tools = models.BooleanField(default=False)
    input_price = models.DecimalField(max_digits=14, decimal_places=8, null=True, blank=True)
    output_price = models.DecimalField(max_digits=14, decimal_places=8, null=True, blank=True)
    context_window = models.PositiveIntegerField(null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    first_seen_at = models.DateTimeField(null=True, blank=True)
    last_seen_at = models.DateTimeField(null=True, blank=True)
    last_verified_at = models.DateTimeField(null=True, blank=True)

    class Meta(BaseModel.Meta):
        ordering = ("priority", "display_name")
        constraints = [
            models.UniqueConstraint(
                fields=("provider", "external_id"), name="unique_ai_model_per_provider"
            ),
            models.UniqueConstraint(
                fields=("provider",),
                condition=models.Q(is_primary=True),
                name="unique_primary_ai_model_per_provider",
            ),
            models.CheckConstraint(
                condition=models.Q(input_price__isnull=True) | models.Q(input_price__gte=0),
                name="ai_model_input_price_nonnegative",
            ),
            models.CheckConstraint(
                condition=models.Q(output_price__isnull=True) | models.Q(output_price__gte=0),
                name="ai_model_output_price_nonnegative",
            ),
        ]
        indexes = [
            models.Index(fields=("provider", "is_free", "is_available", "is_enabled")),
        ]

    def __str__(self):
        return f"{self.provider.provider}: {self.display_name}"


class AIModelSyncRun(BaseModel):
    class Status(models.TextChoices):
        RUNNING = "running", "Executando"
        SUCCESS = "success", "Concluída"
        FAILURE = "failure", "Falhou"

    class Trigger(models.TextChoices):
        SCHEDULED = "scheduled", "Agendada"
        MANUAL = "manual", "Manual"

    provider = models.ForeignKey(
        AIProviderConfiguration, on_delete=models.PROTECT, related_name="model_sync_runs"
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.RUNNING)
    trigger = models.CharField(max_length=20, choices=Trigger.choices, default=Trigger.SCHEDULED)
    started_at = models.DateTimeField()
    finished_at = models.DateTimeField(null=True, blank=True)
    models_found = models.PositiveIntegerField(default=0)
    free_models_found = models.PositiveIntegerField(default=0)
    models_created = models.PositiveIntegerField(default=0)
    models_updated = models.PositiveIntegerField(default=0)
    models_unavailable = models.PositiveIntegerField(default=0)
    added_model_ids = models.JSONField(default=list, blank=True)
    unavailable_model_ids = models.JSONField(default=list, blank=True)
    error_class = models.CharField(max_length=150, blank=True)
    error_message = models.TextField(blank=True)
    response_summary = models.JSONField(default=dict, blank=True)

    class Meta(BaseModel.Meta):
        ordering = ("-started_at",)
        indexes = [models.Index(fields=("provider", "status", "started_at"))]

    def __str__(self):
        return f"{self.provider.provider} — {self.get_status_display()} — {self.started_at:%d/%m/%Y %H:%M}"


class AIConversation(BaseModel):
    class Subject(models.TextChoices):
        GENERAL = "general", "Geral"
        CROPS = "crops", "Plantações"
        LIVESTOCK = "livestock", "Animais"
        FEEDING = "feeding", "Alimentação"
        MANAGEMENT = "management", "Gestão rural"

    organization = models.ForeignKey(
        "organizations.Organization", on_delete=models.CASCADE, related_name="ai_conversations"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="ai_conversations"
    )
    title = models.CharField(max_length=160, default="Nova conversa")
    subject = models.CharField(max_length=20, choices=Subject.choices, default=Subject.GENERAL)
    openai_previous_response_id = models.CharField(max_length=255, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta(BaseModel.Meta):
        ordering = ("-updated_at",)
        indexes = [models.Index(fields=("organization", "user", "is_active"))]

    def __str__(self):
        return self.title


class AIMessage(BaseModel):
    class Role(models.TextChoices):
        USER = "user", "Usuário"
        ASSISTANT = "assistant", "Assistente"

    class Status(models.TextChoices):
        PENDING = "pending", "Pendente"
        COMPLETED = "completed", "Concluída"
        BLOCKED = "blocked", "Bloqueada"
        FAILED = "failed", "Falhou"

    conversation = models.ForeignKey(AIConversation, on_delete=models.CASCADE, related_name="messages")
    role = models.CharField(max_length=12, choices=Role.choices)
    content = models.TextField()
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PENDING)
    model = models.CharField(max_length=150, blank=True)
    provider = models.CharField(max_length=50, blank=True)
    fallback_count = models.PositiveSmallIntegerField(default=0)
    provider_attempts = models.JSONField(default=list, blank=True)
    input_tokens = models.PositiveIntegerField(default=0)
    output_tokens = models.PositiveIntegerField(default=0)
    latency_ms = models.PositiveIntegerField(null=True, blank=True)
    safety_classification = models.JSONField(default=dict, blank=True)
    openai_response_id = models.CharField(max_length=255, blank=True)
    error_code = models.CharField(max_length=80, blank=True)

    class Meta(BaseModel.Meta):
        ordering = ("created_at",)
        indexes = [models.Index(fields=("conversation", "created_at"))]


class AIUsage(BaseModel):
    organization = models.ForeignKey(
        "organizations.Organization", on_delete=models.CASCADE, related_name="ai_usage"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="ai_usage"
    )
    period_start = models.DateField(help_text="Primeiro dia do mês de competência")
    questions_used = models.PositiveIntegerField(default=0)
    input_tokens = models.PositiveBigIntegerField(default=0)
    output_tokens = models.PositiveBigIntegerField(default=0)
    estimated_cost_usd = models.DecimalField(max_digits=12, decimal_places=6, default=0)

    class Meta(BaseModel.Meta):
        ordering = ("-period_start",)
        constraints = [
            models.UniqueConstraint(
                fields=("organization", "user", "period_start"), name="unique_ai_usage_period"
            )
        ]


class AIFeedback(BaseModel):
    message = models.ForeignKey(AIMessage, on_delete=models.CASCADE, related_name="feedback")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    helpful = models.BooleanField()
    comment = models.CharField(max_length=500, blank=True)

    class Meta(BaseModel.Meta):
        constraints = [
            models.UniqueConstraint(fields=("message", "user"), name="unique_ai_message_feedback")
        ]
