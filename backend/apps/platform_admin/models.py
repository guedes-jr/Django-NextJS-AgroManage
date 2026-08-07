from common.models import BaseModel
from django.conf import settings
from django.db import models


class PlatformStaffProfile(BaseModel):
    """Authorization profile for AgroManage's internal platform team."""

    class Role(models.TextChoices):
        OWNER = "platform_owner", "Proprietário da plataforma"
        ADMIN = "platform_admin", "Administrador da plataforma"
        FINANCE = "platform_finance", "Financeiro da plataforma"
        SUPPORT = "platform_support", "Suporte da plataforma"
        DEVELOPER = "platform_developer", "Desenvolvedor da plataforma"
        AUDITOR = "platform_auditor", "Auditor da plataforma"

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="platform_staff_profile",
    )
    role = models.CharField(max_length=30, choices=Role.choices)
    is_active = models.BooleanField(default=True)
    mfa_required = models.BooleanField(default=True)

    class Meta(BaseModel.Meta):
        verbose_name = "Perfil da equipe da plataforma"
        verbose_name_plural = "Perfis da equipe da plataforma"

    def __str__(self):
        return f"{self.user.email} ({self.get_role_display()})"


class PlatformAuditLog(BaseModel):
    """Immutable audit record for actions performed through the backoffice."""

    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="platform_audit_logs",
    )
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="platform_audit_logs",
    )
    action = models.CharField(max_length=100, db_index=True)
    object_type = models.CharField(max_length=100, blank=True)
    object_id = models.CharField(max_length=100, blank=True)
    description = models.TextField(blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=512, blank=True)
    request_id = models.CharField(max_length=100, blank=True, db_index=True)
    extra_data = models.JSONField(default=dict, blank=True)

    class Meta(BaseModel.Meta):
        verbose_name = "Auditoria da plataforma"
        verbose_name_plural = "Auditorias da plataforma"

    def __str__(self):
        return f"[{self.action}] {self.object_type}#{self.object_id}"


class DemoRequest(BaseModel):
    class Status(models.TextChoices):
        NEW = "new", "Novo"
        CONTACTED = "contacted", "Contato realizado"
        SCHEDULED = "scheduled", "Demonstração agendada"
        PROPOSAL = "proposal", "Proposta enviada"
        NEGOTIATION = "negotiation", "Em negociação"
        WON = "won", "Convertido"
        LOST = "lost", "Perdido"
        PENDING = "pending", "Pendente (legado)"
        APPROVED = "approved", "Aprovada (legado)"
        REJECTED = "rejected", "Rejeitada (legado)"

    name = models.CharField(max_length=150)
    email = models.EmailField(db_index=True)
    phone = models.CharField(max_length=30)
    organization_name = models.CharField(max_length=180)
    operation_profile = models.CharField(max_length=80)
    message = models.TextField()
    selected_plan = models.CharField(max_length=80, blank=True)
    landing_path = models.CharField(max_length=255, blank=True)
    utm_source = models.CharField(max_length=120, blank=True)
    utm_medium = models.CharField(max_length=120, blank=True)
    utm_campaign = models.CharField(max_length=120, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.NEW, db_index=True)
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name="assigned_demo_requests",
    )
    next_action_at = models.DateTimeField(null=True, blank=True, db_index=True)
    preferred_demo_at = models.DateTimeField(null=True, blank=True)
    estimated_value = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    internal_notes = models.TextField(blank=True)
    loss_reason = models.CharField(max_length=255, blank=True)
    converted_at = models.DateTimeField(null=True, blank=True)
    ab_variant = models.CharField(max_length=40, blank=True)
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="decided_demo_requests",
    )
    decided_at = models.DateTimeField(null=True, blank=True)
    decision_notes = models.TextField(blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=512, blank=True)

    class Meta(BaseModel.Meta):
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.organization_name} — {self.get_status_display()}"


class DemoAppointment(BaseModel):
    class Status(models.TextChoices):
        SCHEDULED = "scheduled", "Agendada"
        COMPLETED = "completed", "Realizada"
        CANCELLED = "cancelled", "Cancelada"
        NO_SHOW = "no_show", "Não compareceu"

    demo_request = models.ForeignKey(DemoRequest, on_delete=models.CASCADE, related_name="appointments")
    starts_at = models.DateTimeField(db_index=True)
    duration_minutes = models.PositiveSmallIntegerField(default=45)
    timezone = models.CharField(max_length=60, default="America/Recife")
    meeting_url = models.URLField(blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.SCHEDULED)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="created_demo_appointments")

    class Meta(BaseModel.Meta):
        ordering = ("starts_at",)


class DemoRequestActivity(BaseModel):
    demo_request = models.ForeignKey(DemoRequest, on_delete=models.CASCADE, related_name="activities")
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    action = models.CharField(max_length=60, db_index=True)
    description = models.CharField(max_length=500)
    metadata = models.JSONField(default=dict, blank=True)


class MarketingEvent(BaseModel):
    event_name = models.CharField(max_length=80, db_index=True)
    session_id = models.CharField(max_length=80, blank=True, db_index=True)
    path = models.CharField(max_length=255, blank=True, db_index=True)
    variant = models.CharField(max_length=40, blank=True)
    utm_source = models.CharField(max_length=120, blank=True)
    utm_medium = models.CharField(max_length=120, blank=True)
    utm_campaign = models.CharField(max_length=120, blank=True)
    value = models.DecimalField(max_digits=12, decimal_places=3, null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)


class SupportAccessGrant(BaseModel):
    operator = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="support_access_grants"
    )
    organization = models.ForeignKey(
        "organizations.Organization", on_delete=models.CASCADE, related_name="support_access_grants"
    )
    ticket_reference = models.CharField(max_length=100, blank=True, db_index=True)
    justification = models.TextField()
    expires_at = models.DateTimeField(db_index=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    last_used_at = models.DateTimeField(null=True, blank=True)

    class Meta(BaseModel.Meta):
        ordering = ("-created_at",)

    @property
    def is_valid(self):
        from django.utils import timezone

        return self.revoked_at is None and self.expires_at > timezone.now()


class BackgroundTaskRun(BaseModel):
    class Status(models.TextChoices):
        QUEUED = "queued", "Na fila"
        RUNNING = "running", "Executando"
        SUCCESS = "success", "Concluída"
        FAILURE = "failure", "Falhou"
        RETRY = "retry", "Nova tentativa"

    task_id = models.CharField(max_length=255, unique=True, db_index=True)
    task_name = models.CharField(max_length=255, db_index=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.QUEUED)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    duration_ms = models.PositiveBigIntegerField(null=True, blank=True)
    result_summary = models.TextField(blank=True)
    error_class = models.CharField(max_length=150, blank=True)
    error_message = models.TextField(blank=True)
    retry_of = models.ForeignKey("self", null=True, blank=True, on_delete=models.SET_NULL, related_name="retries")
    triggered_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)

    class Meta(BaseModel.Meta):
        ordering = ("-created_at",)


class FeatureFlag(BaseModel):
    key = models.SlugField(max_length=100, unique=True)
    name = models.CharField(max_length=150)
    description = models.TextField(blank=True)
    is_enabled = models.BooleanField(default=False)
    rollout_percentage = models.PositiveSmallIntegerField(default=100)
    allowed_plans = models.JSONField(default=list, blank=True)
    allowed_organizations = models.ManyToManyField(
        "organizations.Organization", blank=True, related_name="feature_flag_overrides"
    )

    class Meta(BaseModel.Meta):
        ordering = ("name",)


class SystemAnnouncement(BaseModel):
    class Level(models.TextChoices):
        INFO = "info", "Informativo"
        SUCCESS = "success", "Sucesso"
        WARNING = "warning", "Atenção"
        CRITICAL = "critical", "Crítico"

    title = models.CharField(max_length=180)
    message = models.TextField()
    level = models.CharField(max_length=20, choices=Level.choices, default=Level.INFO)
    is_active = models.BooleanField(default=True)
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField(null=True, blank=True)

    class Meta(BaseModel.Meta):
        ordering = ("-starts_at",)


class MaintenanceWindow(BaseModel):
    title = models.CharField(max_length=180)
    message = models.TextField()
    is_active = models.BooleanField(default=False)
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField(null=True, blank=True)

    class Meta(BaseModel.Meta):
        ordering = ("-starts_at",)

    @property
    def is_in_effect(self):
        from django.utils import timezone

        now = timezone.now()
        return self.is_active and self.starts_at <= now and (self.ends_at is None or self.ends_at > now)


class SqlQueryExecution(BaseModel):
    class Status(models.TextChoices):
        SUCCESS = "success", "Concluída"
        REJECTED = "rejected", "Rejeitada"
        ERROR = "error", "Erro"

    operator = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="sql_query_executions"
    )
    query_text = models.TextField()
    status = models.CharField(max_length=20, choices=Status.choices)
    duration_ms = models.PositiveBigIntegerField(default=0)
    row_count = models.PositiveIntegerField(default=0)
    was_truncated = models.BooleanField(default=False)
    error_message = models.TextField(blank=True)

    class Meta(BaseModel.Meta):
        ordering = ("-created_at",)


class DeveloperSandboxGrant(BaseModel):
    class Status(models.TextChoices):
        PENDING = "pending", "Aguardando aprovação"
        APPROVED = "approved", "Aprovado"
        REJECTED = "rejected", "Rejeitado"
        REVOKED = "revoked", "Revogado"

    requester = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="sandbox_requests"
    )
    approver = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="sandbox_approvals"
    )
    justification = models.TextField()
    requested_minutes = models.PositiveSmallIntegerField(default=30)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    approved_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True, db_index=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    decision_reason = models.TextField(blank=True)

    class Meta(BaseModel.Meta):
        ordering = ("-created_at",)

    @property
    def is_valid(self):
        from django.utils import timezone

        return (
            self.status == self.Status.APPROVED
            and self.revoked_at is None
            and self.expires_at is not None
            and self.expires_at > timezone.now()
        )


class SandboxExecution(BaseModel):
    class Status(models.TextChoices):
        RUNNING = "running", "Em execução"
        SUCCESS = "success", "Concluída"
        ERROR = "error", "Erro"
        TIMEOUT = "timeout", "Tempo excedido"
        SERVICE_ERROR = "service_error", "Falha do serviço"

    grant = models.ForeignKey(DeveloperSandboxGrant, on_delete=models.PROTECT, related_name="executions")
    operator = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="sandbox_executions"
    )
    code_sha256 = models.CharField(max_length=64, db_index=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.RUNNING)
    duration_ms = models.PositiveIntegerField(default=0)
    exit_code = models.IntegerField(null=True, blank=True)
    stdout_bytes = models.PositiveIntegerField(default=0)
    stderr_bytes = models.PositiveIntegerField(default=0)
    error_message = models.CharField(max_length=300, blank=True)

    class Meta(BaseModel.Meta):
        ordering = ("-created_at",)
