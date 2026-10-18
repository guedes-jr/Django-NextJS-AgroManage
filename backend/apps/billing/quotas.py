"""Organization quotas: live seat counts and a reconciled file-reference ledger."""
from uuid import uuid4

from django.apps import apps
from django.db import transaction
from django.db.models import Max, Sum, Q
from django.utils import timezone
from rest_framework.exceptions import APIException, ValidationError

from common.quotas import FILE_FIELDS, COUNT_MODELS
from .models import OrganizationStorageState, OrganizationStoredFile, Plan, Subscription

LIMIT_FIELDS = {"users": "max_users", "farms": "max_farms", "storage": "max_storage_mb"}
MB = 1024 * 1024


class QuotaExceeded(APIException):
    status_code = 409
    default_code = "organization_quota_exceeded"

    def __init__(self, resource, used, limit, additional):
        label = {"users": "usuários", "farms": "fazendas ativas", "storage": "armazenamento"}[resource]
        super().__init__({"detail": f"A cota de {label} da organização foi atingida. Libere capacidade ou solicite a revisão do limite.", "quota": resource, "used": used, "limit": limit, "additional": additional})


def policy(organization):
    subscription = Subscription.objects.select_related("plan").filter(organization=organization).first()
    plan = subscription.plan if subscription else Plan.objects.filter(code=organization.plan).first()
    overrides = subscription.custom_limits if subscription else {}
    if not isinstance(overrides, dict):
        raise ValidationError("As exceções de cotas da organização precisam ser corrigidas.")
    result = {}
    for resource, field in LIMIT_FIELDS.items():
        value = overrides[field] if field in overrides else getattr(plan, field, None)
        if value is not None and (type(value) is not int or value < 0):
            raise ValidationError("A configuração de cotas da organização é inválida.")
        result[resource] = {"limit": value, "source": "override" if field in overrides else "plan", "plan_limit": getattr(plan, field, None)}
    threshold = overrides.get("warning_threshold_percent", 80)
    if type(threshold) is not int or not 1 <= threshold <= 100:
        raise ValidationError("O percentual de aviso deve ficar entre 1 e 100.")
    return result, threshold, plan


def _customer_users(organization_id):
    return apps.get_model("accounts", "User").objects.filter(organization_id=organization_id, platform_staff_profile__isnull=True).exclude(affiliate_profile__portal_access_only=True)


def _pending_invitations(organization_id):
    return apps.get_model("accounts", "OrganizationAdministratorInvitation").objects.filter(
        organization_id=organization_id, accepted_at__isnull=True, revoked_at__isnull=True,
        expires_at__gt=timezone.now(), user__organization_id=organization_id,
        user__is_active=False, user__role="admin", user__organization_responsible=True,
        user__platform_staff_profile__isnull=True,
    ).exclude(user__affiliate_profile__portal_access_only=True)


def count_usage(organization_id, resource):
    if resource == "users":
        return _customer_users(organization_id).filter(is_active=True).count() + _pending_invitations(organization_id).count()
    return apps.get_model("farms", "Farm").objects.filter(organization_id=organization_id, is_active=True).count()


def storage_bytes(organization_id):
    # A blob referenced more than once by the same tenant occupies space once.
    User = apps.get_model("accounts", "User")
    excluded = User.objects.filter(Q(platform_staff_profile__isnull=False) | Q(affiliate_profile__portal_access_only=True)).order_by().values_list("pk", flat=True)
    rows = OrganizationStoredFile.objects.filter(organization_id=organization_id).exclude(model_label="accounts.user", object_id__in=excluded).values("storage_name").annotate(bytes=Max("size_bytes"))
    return rows.aggregate(total=Sum("bytes"))["total"] or 0


def assert_capacity(organization, resource, additional, *, used=None):
    if additional <= 0:
        return
    limits, _, _ = policy(organization)
    limit = limits[resource]["limit"]
    if resource == "storage" and limit is not None:
        limit *= MB
    if limit is None:
        return
    if used is None:
        used = storage_bytes(organization.pk) if resource == "storage" else count_usage(organization.pk, resource)
    if limit is not None and used + additional > limit:
        raise QuotaExceeded(resource, used, limit, additional)


def _owner(instance):
    label = instance._meta.label_lower
    if label == "organizations.organization":
        return instance.pk
    if label == "crops.soilanalysis":
        return instance.plantation.organization_id
    if label == "accounts.user" and hasattr(instance, "support_access_grant"):
        return type(instance)._base_manager.filter(pk=instance.pk).values_list("organization_id", flat=True).first()
    return getattr(instance, "organization_id", None)


def lock_instance_organizations(objects, alias):
    ids = {value for obj in objects if (value := _owner(obj))}
    Organization = apps.get_model("organizations", "Organization")
    list(Organization.objects.using(alias).select_for_update().filter(pk__in=ids).order_by("pk").values_list("pk", flat=True))


def _file_queryset(model, organization_id):
    if model._meta.label_lower == "organizations.organization":
        return model._base_manager.filter(pk=organization_id)
    if model._meta.label_lower == "crops.soilanalysis":
        return model._base_manager.filter(plantation__organization_id=organization_id)
    if model._meta.label_lower == "accounts.user":
        return _customer_users(organization_id)
    return model._base_manager.filter(organization_id=organization_id)


@transaction.atomic
def reconcile_storage(organization_id):
    Organization = apps.get_model("organizations", "Organization")
    Organization.objects.select_for_update().get(pk=organization_id)
    state, _ = OrganizationStorageState.objects.get_or_create(organization_id=organization_id)
    started_at = timezone.now()
    unknown = missing = 0
    for label, fields in FILE_FIELDS.items():
        model = apps.get_model(label)
        for field_name in fields:
            objects = _file_queryset(model, organization_id).exclude(**{field_name: ""}).exclude(**{f"{field_name}__isnull": True}).only("pk", field_name)
            for obj in objects.iterator(chunk_size=200):
                file = getattr(obj, field_name)
                try:
                    size = file.storage.size(file.name)
                except FileNotFoundError:
                    missing += 1
                    size = 0
                except Exception:
                    unknown += 1
                    existing = OrganizationStoredFile.objects.filter(model_label=label, object_id=obj.pk, field_name=field_name).first()
                    size = existing.size_bytes if existing else 0
                entry, _ = OrganizationStoredFile.objects.update_or_create(
                    model_label=label, object_id=obj.pk, field_name=field_name,
                    defaults={"organization_id": organization_id, "storage_name": file.name, "size_bytes": size, "is_reserved": False},
                )
    OrganizationStoredFile.objects.filter(organization_id=organization_id, updated_at__lt=started_at).delete()
    state.reconciled_at = timezone.now()
    state.unknown_files = unknown
    state.missing_files = missing
    state.save()
    return state


def _storage_state(organization_id):
    state = OrganizationStorageState.objects.filter(organization_id=organization_id).first()
    if not state or not state.reconciled_at:
        state = reconcile_storage(organization_id)
    return state


def _customer(instance):
    User = apps.get_model("accounts", "User")
    return not User.objects.filter(pk=instance.pk, platform_staff_profile__isnull=False).exists() and not User.objects.filter(pk=instance.pk, affiliate_profile__portal_access_only=True).exists()


def _user_charge(instance, *, active, organization_id, role, responsible):
    if not organization_id or not _customer(instance):
        return 0
    if active:
        return 1
    if role != "admin" or not responsible:
        return 0
    Invitation = apps.get_model("accounts", "OrganizationAdministratorInvitation")
    return int(Invitation.objects.filter(organization_id=organization_id, user_id=instance.pk, accepted_at__isnull=True, revoked_at__isnull=True, expires_at__gt=timezone.now()).exists())


def _invite_charge(instance):
    if instance.accepted_at or instance.revoked_at or instance.expires_at <= timezone.now():
        return 0
    User = apps.get_model("accounts", "User")
    return int(User.objects.filter(pk=instance.user_id, organization_id=instance.organization_id, is_active=False, role="admin", organization_responsible=True, platform_staff_profile__isnull=True).exclude(affiliate_profile__portal_access_only=True).exists())


def _quota_delta(instance, previous):
    label = instance._meta.label_lower
    if label == "accounts.user":
        if previous and previous.is_active and instance.is_active and previous.organization_id == _owner(instance):
            return "users", 0
        old = _user_charge(instance, active=previous.is_active, organization_id=previous.organization_id, role=previous.role, responsible=previous.organization_responsible) if previous else 0
        new = _user_charge(instance, active=instance.is_active, organization_id=_owner(instance), role=instance.role, responsible=instance.organization_responsible)
        return "users", new - old
    if label == "farms.farm":
        return "farms", int(instance.is_active) - int(previous.is_active if previous else False)
    if label == "accounts.organizationadministratorinvitation":
        return "users", _invite_charge(instance) - (_invite_charge(previous) if previous else 0)
    return None, 0


def _referenced(name):
    return any(apps.get_model(label)._base_manager.filter(**{field: name}).exists() for label, fields in FILE_FIELDS.items() for field in fields)


def _delete_unreferenced(storage, name):
    if not name or _referenced(name):
        return
    try:
        storage.delete(name)
    except Exception:
        # Logical quota counts live references; never undo a committed record for cleanup failure.
        pass


def save_tracked_instance(instance, save, args, kwargs):
    alias = kwargs.get("using") or instance._state.db or "default"
    fields = set(kwargs["update_fields"]) if kwargs.get("update_fields") is not None else None
    label = instance._meta.label_lower
    file_fields = [field for field in FILE_FIELDS.get(label, ()) if fields is None or field in fields]
    previous = type(instance)._base_manager.using(alias).filter(pk=instance.pk).first() if not instance._state.adding else None
    org_id = _owner(instance)
    if not org_id:
        return save(*args, **kwargs)
    # New tenant rows have to exist before their files/subscription can be accounted for.
    if label == "organizations.organization" and instance._state.adding:
        uploads = {field: getattr(instance, field) for field in file_fields if getattr(instance, field)}
        if not uploads:
            return save(*args, **kwargs)
        with transaction.atomic(using=alias):
            for field in uploads:
                setattr(instance, field, "")
            save(*args, **kwargs)
            for field, value in uploads.items():
                setattr(instance, field, value)
            return save_tracked_instance(instance, save, (), {"using": alias})
    if previous and _owner(previous) and _owner(previous) != org_id:
        raise ValidationError("Não é permitido mover registros sujeitos a cotas entre organizações.")
    changed = [field for field in file_fields if (not getattr(instance, field)._committed or (getattr(instance, field).name or "") != ((getattr(previous, field).name or "") if previous else ""))]
    old_names = {field: getattr(previous, field).name if previous else "" for field in changed}
    uploads = {field for field in changed if not getattr(instance, field)._committed}
    if not changed and label not in COUNT_MODELS:
        return save(*args, **kwargs)
    try:
        with transaction.atomic(using=alias):
            Organization = apps.get_model("organizations", "Organization")
            organization = Organization.objects.using(alias).select_for_update().get(pk=org_id)
            # Get the authoritative version after the tenant lock is held.
            previous = type(instance)._base_manager.using(alias).filter(pk=instance.pk).first() if previous else None
            changed = [field for field in file_fields if (not getattr(instance, field)._committed or (getattr(instance, field).name or "") != ((getattr(previous, field).name or "") if previous else ""))]
            old_names = {field: getattr(previous, field).name if previous else "" for field in changed}
            resource, delta = _quota_delta(instance, previous)
            if resource:
                assert_capacity(organization, resource, delta)
            ownership_files = {}
            if label == "accounts.user" and previous and not previous.organization_id:
                for field in FILE_FIELDS[label]:
                    effective = getattr(instance if fields is None or field in fields else previous, field)
                    if field not in changed and effective:
                        ownership_files[field] = effective
            if label == "accounts.user" and not _customer(instance):
                changed = []  # Internal-team avatars do not belong to tenant storage.
                ownership_files = {}
            measured_files = {field: getattr(instance, field) for field in changed}
            measured_files.update(ownership_files)
            if measured_files:
                state = _storage_state(org_id)
                old_total = storage_bytes(org_id)
                for field, file in measured_files.items():
                    if not file:
                        OrganizationStoredFile.objects.filter(model_label=label, object_id=instance.pk, field_name=field).delete()
                        continue
                    try:
                        size = file.size if not file._committed else file.storage.size(file.name)
                    except FileNotFoundError:
                        size = 0
                    except Exception as exc:
                        raise ValidationError("Não foi possível medir o arquivo para validar o armazenamento.") from exc
                    OrganizationStoredFile.objects.update_or_create(
                        model_label=label, object_id=instance.pk, field_name=field,
                        defaults={"organization_id": org_id, "storage_name": f"reservation/{uuid4()}" if not file._committed else file.name, "size_bytes": size, "is_reserved": not file._committed},
                    )
                additional = storage_bytes(org_id) - old_total
                if additional > 0:
                    if state.unknown_files and policy(organization)[0]["storage"]["limit"] is not None:
                        raise ValidationError("Não foi possível medir todos os arquivos. Reconcilie o armazenamento antes de enviar novos arquivos.")
                    assert_capacity(organization, "storage", additional, used=old_total)
            instance._quota_saving = True
            try:
                result = save(*args, **kwargs)
            finally:
                instance._quota_saving = False
            for field in changed:
                file = getattr(instance, field)
                if file:
                    OrganizationStoredFile.objects.filter(model_label=label, object_id=instance.pk, field_name=field).update(storage_name=file.name, is_reserved=False)
                old_name = old_names[field]
                if old_name and old_name != file.name:
                    transaction.on_commit(lambda storage=file.storage, name=old_name: _delete_unreferenced(storage, name), using=alias, robust=True)
            return result
    except Exception:
        for field in uploads:
            file = getattr(instance, field)
            if file and file._committed and file.name != old_names.get(field):
                _delete_unreferenced(file.storage, file.name)
        raise


@transaction.atomic
def organization_usage(organization_id):
    Organization = apps.get_model("organizations", "Organization")
    organization = Organization.objects.select_for_update().get(pk=organization_id)
    limits, threshold, plan = policy(organization)
    state = _storage_state(organization_id)
    active_users = _customer_users(organization_id).filter(is_active=True).count()
    reserved_users = _pending_invitations(organization_id).count()
    resources = {}
    for resource, config in limits.items():
        used = storage_bytes(organization_id) if resource == "storage" else active_users + reserved_users if resource == "users" else count_usage(organization_id, resource)
        limit = config["limit"] * MB if resource == "storage" and config["limit"] is not None else config["limit"]
        percent = round(used * 100 / limit, 2) if limit else (100 if limit == 0 and used else 0)
        status = "over_limit" if limit is not None and used > limit else "at_limit" if limit is not None and used == limit else "warning" if limit is not None and percent >= threshold else "normal"
        resources[resource] = {**config, "used": used, "capacity": limit, "remaining": max(limit - used, 0) if limit is not None else None, "percent": percent if limit is not None else None, "status": status}
    return {"plan_name": plan.name if plan else None, "warning_threshold_percent": threshold, "resources": resources, "active_users": active_users, "reserved_users": reserved_users, "storage": {"reconciled_at": state.reconciled_at, "unknown_files": state.unknown_files, "missing_files": state.missing_files}}


@transaction.atomic
def update_organization_limits(*, organization_id, values, request):
    from apps.platform_admin.services import record_platform_action
    Organization = apps.get_model("organizations", "Organization")
    organization = Organization.objects.select_for_update().get(pk=organization_id)
    subscription = Subscription.objects.select_for_update().filter(organization=organization).first()
    if not subscription:
        raise ValidationError("Cadastre uma assinatura antes de configurar exceções de cotas.")
    previous = dict(subscription.custom_limits)
    overrides = dict(previous)
    inherited = values.get("inherit", [])
    for key in inherited:
        overrides.pop(key, None)
    overrides.update({key: value for key, value in values.items() if key != "inherit"})
    subscription.custom_limits = overrides
    subscription.save(update_fields=["custom_limits", "updated_at"])
    keys = {*LIMIT_FIELDS.values(), "warning_threshold_percent"}
    record_platform_action(
        request=request, action="organization.limits_updated", organization=organization,
        object_type="Subscription", object_id=subscription.pk, description="Exceções de cotas da organização atualizadas.",
        extra_data={"previous_overrides": {key: value for key, value in previous.items() if key in keys}, "overrides": {key: value for key, value in overrides.items() if key in keys}, "inherit": inherited},
    )
    return organization_usage(organization_id)


@transaction.atomic
def organization_storage_usage(organization_id):
    Organization = apps.get_model("organizations", "Organization")
    Organization.objects.select_for_update().get(pk=organization_id)
    _storage_state(organization_id)
    return storage_bytes(organization_id)
