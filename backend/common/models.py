"""
Shared base model for all AgroManage models.
"""
import uuid
from django.db import models
from .quotas import QuotaManager, save_with_quotas


class BaseModel(models.Model):
    """
    Abstract base model providing UUID primary key and timestamps.
    All domain models should inherit from this.
    """

    objects = QuotaManager()

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        return save_with_quotas(self, super().save, args, kwargs)

    def __repr__(self) -> str:
        return f"<{self.__class__.__name__} id={self.id}>"
