from django.conf import settings
from django.db import models

from common.models import BaseModel


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
    model = models.CharField(max_length=80, blank=True)
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
