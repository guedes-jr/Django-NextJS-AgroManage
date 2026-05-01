"""
Reports domain models — configuration, scheduling and generated reports.
"""
import uuid
from django.conf import settings
from django.db import models
from common.models import BaseModel


class ReportType(models.TextChoices):
    # Stock Reports
    STOCK_GENERAL = "stock_general", "Geral de Estoque"
    STOCK_MOVEMENT = "stock_movement", "Movimentação de Estoque"
    STOCK_MINIMUM = "stock_minimum", "Estoque Mínimo"
    STOCK_VALIDITY = "stock_validity", "Validade de Estoque"
    
    # Financial Reports
    FINANCE_CASHFLOW = "finance_cashflow", "Fluxo de Caixa"
    FINANCE_DRE = "finance_dre", "Demonstração de Resultados"
    FINANCE_CATEGORY = "finance_category", "Por Categoria"
    FINANCE_COMPARATIVE = "finance_comparative", "Comparativo Financeiro"
    
    # Livestock Reports
    LIVESTOCK_INVENTORY = "livestock_inventory", "Inventário de Rebanho"
    LIVESTOCK_MOVEMENT = "livestock_movement", "Movimentação de Animais"
    LIVESTOCK_MORTALITY = "livestock_mortality", "Mortalidade"
    LIVESTOCK_WEIGHT = "livestock_weight", "Peso Médio"
    
    # Crop Reports
    CROPS_AREA = "crops_area", "Área Plantada"
    CROPS_HARVEST = "crops_harvest", "Safra/Produção"
    
    # Farm Reports
    FARM_SUMMARY = "farm_summary", "Resumo por Fazenda"
    FARM_KPI = "farm_kpi", "Indicadores KPI"
    
    # Dashboard
    DASHBOARD = "dashboard", "Dashboard Executivo"


class ReportFormat(models.TextChoices):
    PDF = "pdf", "PDF"
    EXCEL = "excel", "Excel"
    CSV = "csv", "CSV"


class ReportStatus(models.TextChoices):
    PENDING = "pending", "Pendente"
    PROCESSING = "processing", "Processando"
    COMPLETED = "completed", "Concluído"
    FAILED = "failed", "Falhou"


class FrequencyType(models.TextChoices):
    DAILY = "daily", "Diário"
    WEEKLY = "weekly", "Semanal"
    MONTHLY = "monthly", "Mensal"
    QUARTERLY = "quarterly", "Trimestral"
    YEARLY = "yearly", "Anual"


class ReportConfig(BaseModel):
    """
    Configuração de um relatório.
    Define os parâmetros padrão e configurações de geração.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="report_configs"
    )
    
    name = models.CharField(max_length=150)
    description = models.TextField(blank=True)
    report_type = models.CharField(max_length=30, choices=ReportType.choices)
    
    # Configurações de parâmetros padrão
    default_filters = models.JSONField(default=dict, blank=True)
    default_date_range = models.JSONField(default=dict, blank=True)
    
    # Configurações de output
    default_format = models.CharField(
        max_length=10,
        choices=ReportFormat.choices,
        default=ReportFormat.PDF
    )
    include_charts = models.BooleanField(default=True)
    
    # Configurações de acesso
    is_public = models.BooleanField(default=False)
    allowed_roles = models.JSONField(default=list, blank=True)
    
    # Metadata
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_reports"
    )
    
    class Meta(BaseModel.Meta):
        verbose_name = "Report Configuration"
        verbose_name_plural = "Report Configurations"
        unique_together = [["organization", "report_type", "name"]]
    
    def __str__(self):
        return f"{self.name} ({self.get_report_type_display()})"


class ReportSchedule(BaseModel):
    """
    Agendamento de geração automática de relatórios.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="report_schedules"
    )
    
    report_config = models.ForeignKey(
        ReportConfig,
        on_delete=models.CASCADE,
        related_name="schedules"
    )
    
    name = models.CharField(max_length=150)
    is_active = models.BooleanField(default=True)
    
    # Agendamento
    frequency = models.CharField(max_length=20, choices=FrequencyType.choices)
    schedule_time = models.TimeField()
    schedule_day = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Dia do mês para agendamento mensal (1-28)"
    )
    
    # Filtros dinâmicos (pode ser sobrescrito)
    filters = models.JSONField(default=dict, blank=True)
    
    # Destino
    send_email = models.BooleanField(default=False)
    email_recipients = models.JSONField(default=list, blank=True)
    
    last_run = models.DateTimeField(null=True, blank=True)
    next_run = models.DateTimeField(null=True, blank=True)
    
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_schedules"
    )
    
    class Meta(BaseModel.Meta):
        verbose_name = "Report Schedule"
        verbose_name_plural = "Report Schedules"
        ordering = ["-created_at"]
    
    def __str__(self):
        return f"{self.name} - {self.get_frequency_display()}"


class GeneratedReport(BaseModel):
    """
    Relatório gerado (instância de execução).
    Armazena o resultado da geração de um relatório.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="generated_reports"
    )
    
    report_config = models.ForeignKey(
        ReportConfig,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="generated_reports"
    )
    
    schedule = models.ForeignKey(
        ReportSchedule,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="generated_reports"
    )
    
    # Dados do relatório
    name = models.CharField(max_length=200)
    report_type = models.CharField(max_length=30, choices=ReportType.choices)
    
    # Status
    status = models.CharField(
        max_length=20,
        choices=ReportStatus.choices,
        default=ReportStatus.PENDING
    )
    
    # Parametros utilizados
    filters = models.JSONField(default=dict, blank=True)
    date_range = models.JSONField(default=dict, blank=True)
    
    # Resultado
    file = models.FileField(upload_to="reports/generated/", null=True, blank=True)
    file_size = models.BigIntegerField(null=True, blank=True)
    format_used = models.CharField(max_length=10, choices=ReportFormat.choices)
    
    # Dados para visualização (JSON)
    preview_data = models.JSONField(default=dict, blank=True)
    
    # Erro
    error_message = models.TextField(blank=True)
    
    # Execution time
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    
    generated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="generated_reports"
    )
    
    class Meta(BaseModel.Meta):
        verbose_name = "Generated Report"
        verbose_name_plural = "Generated Reports"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["organization", "status"]),
            models.Index(fields=["created_at"]),
        ]
    
    def __str__(self):
        return f"{self.name} - {self.get_status_display()}"
    
    @property
    def duration_seconds(self):
        if self.started_at and self.completed_at:
            return (self.completed_at - self.started_at).total_seconds()
        return None


class ReportWidget(BaseModel):
    """
    Widgets para o dashboard.
    Define quais KPIs e visualizações cada organização quer em seu dashboard.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="report_widgets"
    )
    
    title = models.CharField(max_length=100)
    widget_type = models.CharField(max_length=50)
    config = models.JSONField(default=dict, blank=True)
    
    position_x = models.PositiveIntegerField(default=0)
    position_y = models.PositiveIntegerField(default=0)
    width = models.PositiveIntegerField(default=4)
    height = models.PositiveIntegerField(default=3)
    
    is_active = models.BooleanField(default=True)
    
    class Meta(BaseModel.Meta):
        ordering = ["position_y", "position_x"]
    
    def __str__(self):
        return f"{self.title} ({self.widget_type})"