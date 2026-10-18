"""File lifecycle hooks and quota checks for direct FieldFile.save calls."""
from django.apps import apps
from django.db import transaction
from django.db.models.fields.files import FieldFile, ImageFieldFile, ImageField
from django.db.models.signals import pre_delete, post_delete

from common.quotas import FILE_FIELDS, COUNT_MODELS
from .quotas import _owner, _delete_unreferenced
from .models import OrganizationStoredFile


def before_delete(sender, instance, using, **kwargs):
    organization_id = _owner(instance)
    if organization_id:
        Organization = apps.get_model("organizations", "Organization")
        list(Organization.objects.using(using).select_for_update().filter(pk=organization_id).values_list("pk", flat=True))


def after_delete(sender, instance, using, **kwargs):
    OrganizationStoredFile.objects.using(using).filter(model_label=instance._meta.label_lower, object_id=instance.pk).delete()
    for name in FILE_FIELDS.get(instance._meta.label_lower, ()):
        file = getattr(instance, name)
        if file:
            transaction.on_commit(lambda storage=file.storage, path=file.name: _delete_unreferenced(storage, path), using=using, robust=True)


class QuotaFileSaveMixin:
    def save(self, name, content, save=True):
        if getattr(self.instance, "_quota_saving", False) or not _owner(self.instance):
            return super().save(name, content, save=save)
        if not save:
            # Defer the write to the model save so capacity and reference commit together.
            content.name = name
            setattr(self.instance, self.field.attname, content)
            return
        content.name = name
        setattr(self.instance, self.field.attname, content)
        self.instance.save()
        # Preserve the original FieldFile object's observable result.
        current = getattr(self.instance, self.field.attname)
        self.name = current.name
        self._committed = current._committed

    def delete(self, save=True):
        if not _owner(self.instance):
            return super().delete(save=save)
        setattr(self.instance, self.field.attname, None)
        if save:
            self.instance.save()
        self.close()
        self.name = None
        self._committed = False


class QuotaFieldFile(QuotaFileSaveMixin, FieldFile):
    pass


class QuotaImageFieldFile(QuotaFileSaveMixin, ImageFieldFile):
    pass


def connect():
    for label in set(FILE_FIELDS) | COUNT_MODELS:
        model = apps.get_model(label)
        pre_delete.connect(before_delete, sender=model, dispatch_uid=f"quota_pre_delete_{label}")
        post_delete.connect(after_delete, sender=model, dispatch_uid=f"quota_post_delete_{label}")
        for name in FILE_FIELDS.get(label, ()):
            field = model._meta.get_field(name)
            field.attr_class = QuotaImageFieldFile if isinstance(field, ImageField) else QuotaFieldFile
