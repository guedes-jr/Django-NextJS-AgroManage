"""Quota-aware ORM entry points. Imports of domain models stay lazy."""
from django.apps import apps
from django.db import models, transaction
from rest_framework.exceptions import ValidationError

FILE_FIELDS = {
    "ai_assistant.supportticketattachment": ("file",),
    "accounts.user": ("avatar",),
    "organizations.organization": ("logo",),
    "finance.transaction": ("attachment",),
    "inventory.fornecedor": ("imagem",),
    "crops.soilanalysis": ("file",),
    "reports.generatedreport": ("file",),
}
COUNT_MODELS = {"accounts.user", "farms.farm", "accounts.organizationadministratorinvitation"}
OWNER_FIELDS = {"organization", "organization_id", "plantation", "plantation_id"}
QUOTA_FIELDS = {"is_active", "organization", "organization_id", "role", "organization_responsible", "user", "user_id", "expires_at", "accepted_at", "revoked_at", "plantation", "plantation_id"}


def tracked(model):
    return model._meta.apps is apps and model._meta.label_lower in (set(FILE_FIELDS) | COUNT_MODELS)


def save_with_quotas(instance, save, args, kwargs):
    if not tracked(type(instance)):
        return save(*args, **kwargs)
    fields = kwargs.get("update_fields")
    watched = set(FILE_FIELDS.get(instance._meta.label_lower, ())) | (QUOTA_FIELDS if instance._meta.label_lower in COUNT_MODELS else OWNER_FIELDS)
    if fields is not None and not watched.intersection(fields):
        return save(*args, **kwargs)
    from apps.billing.quotas import save_tracked_instance
    return save_tracked_instance(instance, save, args, kwargs)


class QuotaQuerySet(models.QuerySet):
    def bulk_create(self, objs, batch_size=None, ignore_conflicts=False, update_conflicts=False, update_fields=None, unique_fields=None):
        if not tracked(self.model):
            return super().bulk_create(objs, batch_size=batch_size, ignore_conflicts=ignore_conflicts, update_conflicts=update_conflicts, update_fields=update_fields, unique_fields=unique_fields)
        if ignore_conflicts or update_conflicts:
            raise ValidationError("Importações com cotas devem tratar conflitos explicitamente.")
        self._for_write = True
        objs = list(objs)
        with transaction.atomic(using=self.db):
            from apps.billing.quotas import lock_instance_organizations
            lock_instance_organizations(objs, self.db)
            for obj in objs:
                obj.save(force_insert=True, using=self.db)
        return objs

    def bulk_update(self, objs, fields, batch_size=None):
        watched = (QUOTA_FIELDS if self.model._meta.label_lower in COUNT_MODELS else OWNER_FIELDS) | set(FILE_FIELDS.get(self.model._meta.label_lower, ()))
        if not tracked(self.model) or not watched.intersection(fields):
            return super().bulk_update(objs, fields, batch_size=batch_size)
        self._for_write = True
        objs = list(objs)
        with transaction.atomic(using=self.db):
            from apps.billing.quotas import lock_instance_organizations
            lock_instance_organizations(objs, self.db)
            for obj in objs:
                obj.save(using=self.db, update_fields=fields)
        return len(objs)

    def update(self, **kwargs):
        watched = (QUOTA_FIELDS if self.model._meta.label_lower in COUNT_MODELS else OWNER_FIELDS) | set(FILE_FIELDS.get(self.model._meta.label_lower, ()))
        if not tracked(self.model) or not watched.intersection(kwargs):
            return super().update(**kwargs)
        if any(hasattr(value, "resolve_expression") for key, value in kwargs.items() if key in watched):
            raise ValidationError("Atualize campos sujeitos a cotas com valores explícitos.")
        self._for_write = True
        with transaction.atomic(using=self.db):
            objects = list(self.order_by("pk"))
            from apps.billing.quotas import lock_instance_organizations
            lock_instance_organizations(objects, self.db)
            for obj in objects:
                # Re-read after obtaining tenant locks, avoiding stale activation decisions.
                obj.refresh_from_db(using=self.db)
                for key, value in kwargs.items():
                    setattr(obj, key, value)
                obj.save(using=self.db, update_fields=list(kwargs))
        return len(objects)


QuotaManager = models.Manager.from_queryset(QuotaQuerySet)
