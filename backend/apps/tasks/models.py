"""
Tasks / Notifications domain models.
"""
from common.models import BaseModel
from django.db import models
import uuid


class Task(BaseModel):
    """An internal task or to-do assigned to users or farms."""

    class Priority(models.TextChoices):
        LOW = "low", "Low"
        MEDIUM = "medium", "Medium"
        HIGH = "high", "High"
        CRITICAL = "critical", "Critical"

    class Status(models.TextChoices):
        OPEN = "open", "Open"
        IN_PROGRESS = "in_progress", "In Progress"
        DONE = "done", "Done"
        CANCELLED = "cancelled", "Cancelled"

    organization = models.ForeignKey(
        "organizations.Organization", on_delete=models.CASCADE, related_name="tasks"
    )
    farm = models.ForeignKey(
        "farms.Farm", on_delete=models.SET_NULL, null=True, blank=True, related_name="tasks"
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    priority = models.CharField(max_length=10, choices=Priority.choices, default=Priority.MEDIUM)
    status = models.CharField(max_length=15, choices=Status.choices, default=Status.OPEN)
    due_date = models.DateField(null=True, blank=True)
    event_kind = models.CharField(max_length=15, choices=[("task", "Tarefa"), ("event", "Evento"), ("appointment", "Compromisso")], default="task")
    start_time = models.TimeField(null=True, blank=True)
    end_time = models.TimeField(null=True, blank=True)
    location = models.CharField(max_length=255, blank=True)
    whatsapp_remind_at = models.DateTimeField(null=True, blank=True, db_index=True)
    reminder_version = models.UUIDField(default=uuid.uuid4, editable=False)
    reminder_delivery = models.ForeignKey("notifications.NotificationDelivery", null=True, blank=True, on_delete=models.SET_NULL, related_name="agenda_tasks")
    assigned_to = models.ForeignKey(
        "accounts.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="assigned_tasks"
    )
    created_by = models.ForeignKey(
        "accounts.User", on_delete=models.SET_NULL, null=True, related_name="created_tasks"
    )

    class Meta(BaseModel.Meta):
        verbose_name = "Task"
        verbose_name_plural = "Tasks"

    def __str__(self) -> str:
        return f"[{self.priority}] {self.title}"


class Holiday(BaseModel):
    """A dated calendar holiday adopted by one organization (no automatic recurrence)."""
    organization = models.ForeignKey("organizations.Organization", on_delete=models.CASCADE, related_name="holidays")
    name = models.CharField(max_length=150)
    date = models.DateField()
    source = models.CharField(max_length=15, choices=[("manual", "Manual"), ("national", "BrasilAPI")], default="manual")
    created_by = models.ForeignKey("accounts.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="created_holidays")

    class Meta(BaseModel.Meta):
        ordering = ("date", "name", "id")
        constraints = [models.UniqueConstraint(fields=["organization", "date", "name"], name="unique_org_holiday_date_name")]
        indexes = [models.Index(fields=["organization", "date"], name="holiday_org_date_idx")]

    def __str__(self):
        return f"{self.date} · {self.name}"
