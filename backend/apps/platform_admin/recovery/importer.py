"""Signal-free imports, explicit identity mapping and reversible tenant-only merges."""
import uuid
import zipfile
from django.apps import apps
from django.contrib.auth.hashers import make_password
from django.core.files.base import ContentFile
from django.db import models
from django.db.models import FileField

from ..exports.capture import Capture, dumps
from ..exports.registry import REGISTRY
from .package import fail

ORG = "organizations.organization"
USERS = "accounts.user"
PREFERENCES = "notifications.notificationpreference"
ORG_FIELDS = {"name", "document", "address", "phone", "email", "logo"}


def query(model):
    # Recovery owns its transaction/tenant checks and must never emit save signals,
    # consume inventory twice, run quotas mid-import or enqueue external effects.
    return models.QuerySet(model=model, using="default")


def values(model, row):
    result = {}
    for name, value in row.items():
        field = model._meta.get_field(name)
        result[field.attname] = value if field.get_internal_type() == "JSONField" else field.to_python(value)
    return result


def preflight(package):
    """Reject ID collisions before any write; shared catalogs are read-only."""
    scope = Capture(uuid.UUID(package.organization_id), ".")
    result = {}
    for label, rows in package.rows.items():
        model = apps.get_model(label)
        existing, owned = set(), set()
        keys = list(rows)
        for start in range(0, len(keys), 500):
            batch = keys[start:start + 500]
            existing.update(str(pk) for pk in query(model).filter(pk__in=batch).values_list("pk", flat=True))
            if REGISTRY[label]["scope"] is not None:
                owned.update(str(pk) for pk in scope.scoped(label).filter(pk__in=batch).values_list("pk", flat=True))
        counts = {"create": 0, "update": 0, "preserve": 0, "reference": 0}
        for pk, row in rows.items():
            if package.shared(label, row):
                counts["reference"] += 1
                if not label.startswith("billing."):
                    current = query(model).filter(pk=pk).values(*row).first()
                    if not current or any(dumps(current[name]) != dumps(value) for name, value in row.items() if name not in {"created_at", "updated_at"}):
                        fail("catalog_conflict")
                continue
            if pk in existing and pk not in owned:
                fail("isolation")
            if pk in existing and label in {USERS, PREFERENCES}:
                counts["preserve"] += 1
            else:
                counts["update" if pk in existing else "create"] += 1
        result[label] = counts
    return result


def replay(package, job, *, target=None, files=None):
    """target=None: merge original IDs; otherwise clone UUIDs into suspended tenant."""
    isolated = target is not None
    mappings = {}
    existing_users = set()
    for label, rows in package.rows.items():
        model = apps.get_model(label)
        for pk, row in rows.items():
            if package.shared(label, row):
                mappings[(label, pk)] = pk
            elif label == ORG:
                mappings[(label, pk)] = str(target.pk) if isolated else pk
            elif isolated:
                mappings[(label, pk)] = None if model._meta.pk.get_internal_type() == "BigAutoField" else str(uuid.uuid5(job.pk, f"{label}:{pk}"))
            else:
                mappings[(label, pk)] = pk
        if label == USERS and not isolated:
            existing_users = {str(pk) for pk in query(model).filter(pk__in=rows).values_list("pk", flat=True)}
    journal = {"rows": [], "relations": [], "files": files if files is not None else []}
    with zipfile.ZipFile(package.path) as archive:
        for label, rows in package.rows.items():
            model = apps.get_model(label)
            creates, updates, original_rows = [], [], []
            update_fields = set()
            for pk, original in rows.items():
                if package.shared(label, original):
                    continue
                mapped_pk = mappings[(label, pk)]
                current = query(model).filter(pk=mapped_pk).values().first() if mapped_pk is not None else None
                if not isolated and current and label in {USERS, PREFERENCES}:
                    continue
                row = dict(original)
                row[model._meta.pk.name] = mapped_pk
                for name, value in list(row.items()):
                    field = model._meta.get_field(name)
                    if field.is_relation and value is not None:
                        row[name] = mappings[(field.related_model._meta.label_lower, str(value))]
                    if isinstance(field, FileField) and value:
                        if isolated:
                            # Quarantined file bytes stay in the pinned private archive.
                            row[name] = ""
                        else:
                            with archive.open(value) as source:
                                saved = field.storage.save(f"recovered/{job.pk}/{value}", ContentFile(source.read()))
                            journal["files"].append({"model": label, "field": name, "name": saved})
                            row[name] = saved
                if label == ORG:
                    row = {key: value for key, value in row.items() if key in ORG_FIELDS}
                    if isolated:
                        row["name"] = f"Conferência: {original['name']}"[:255]
                if label == USERS:
                    row.update(is_active=False, organization_responsible=False, receive_system_alerts=False, email_notifications=False, phone_is_whatsapp=False, is_staff=False, is_superuser=False, password=make_password(None))
                    if isolated:
                        row["email"] = f"recovery-{mapped_pk}@export.invalid"
                if label == PREFERENCES:
                    row.update(email_notifications=False, push_notifications=False, whatsapp_reproductive_alerts=False)
                if label == "reports.reportschedule":
                    row.update(is_active=False, send_email=False, next_run=None)
                if label == "reports.generatedreport" and row.get("status") in {"pending", "processing", "queued", "running"}:
                    row["status"] = "failed"
                if label == "accounts.operatorrecordownership":
                    row["object_id"] = mappings[(row["model_label"].lower(), str(original["object_id"]))]
                for field in model._meta.fields:
                    if field.name not in row and not current and field.get_internal_type() == "UUIDField" and not field.null:
                        row[field.name] = str(uuid.uuid5(job.pk, f"key:{label}:{pk}:{field.name}"))
                data = values(model, row)
                if current:
                    data.pop(model._meta.pk.attname, None)
                    journal["rows"].append({"model": label, "pk": str(mapped_pk), "before": {key: current[key] for key in data}})
                    obj = model(**{**current, **data})
                    updates.append(obj); update_fields.update(model._meta.get_field(key).name for key in data)
                else:
                    obj = model(**data)
                    creates.append(obj)
                original_rows.append((pk, obj, data, current is None))
            if creates:
                query(model).bulk_create(creates, batch_size=500)
                for pk, obj, data, created in original_rows:
                    if created:
                        mappings[(label, pk)] = str(obj.pk)
                        journal["rows"].append({"model": label, "pk": str(obj.pk), "before": None})
                        # bulk_create applies auto_now fields; restore source timestamps.
                        for key, value in data.items():
                            if key != model._meta.pk.attname:
                                setattr(obj, key, value)
                        updates.append(obj)
                        update_fields.update(model._meta.get_field(key).name for key in data if key != model._meta.pk.attname)
            if updates and update_fields:
                query(model).bulk_update(updates, sorted(update_fields), batch_size=200)
            for start in range(0, len(original_rows), 500):
                batch = original_rows[start:start + 500]
                actual = {str(item[model._meta.pk.attname]): item for item in query(model).filter(pk__in=[obj.pk for _, obj, _, _ in batch]).values()}
                for _, obj, expected, _ in batch:
                    found = actual.get(str(obj.pk))
                    if found is None or any(dumps(found[key]) != dumps(value) for key, value in expected.items() if key != model._meta.pk.attname):
                        fail("integrity")
        for (label, name), links in package.relations.items():
            field = apps.get_model(label)._meta.get_field(name)
            through, source, dest = field.remote_field.through, field.m2m_field_name(), field.m2m_reverse_field_name()
            by_source = {}
            for pk, row in package.rows[label].items():
                if package.shared(label, row) or (not isolated and label == USERS and pk in existing_users):
                    continue
                by_source[str(mappings[(label, pk)])] = []
            for link in links:
                pk = str(mappings[(label, str(link["source"]))])
                if pk in by_source:
                    by_source[pk].append(mappings[(field.related_model._meta.label_lower, str(link["target"]))])
            for pk, targets in by_source.items():
                qs = query(through).filter(**{source + "_id": pk})
                before = [str(value) for value in qs.values_list(dest + "_id", flat=True)]
                journal["relations"].append({"model": label, "field": name, "pk": pk, "before": before})
                qs._raw_delete("default")
                query(through).bulk_create([through(**{source + "_id": pk, dest + "_id": value}) for value in targets], batch_size=500)
                if {str(value) for value in qs.values_list(dest + "_id", flat=True)} != {str(value) for value in targets}:
                    fail("integrity")
    return journal, mappings


def undo(journal):
    for item in journal["relations"]:
        field = apps.get_model(item["model"])._meta.get_field(item["field"])
        through, source, dest = field.remote_field.through, field.m2m_field_name(), field.m2m_reverse_field_name()
        query(through).filter(**{source + "_id": item["pk"]})._raw_delete("default")
        query(through).bulk_create([through(**{source + "_id": item["pk"], dest + "_id": value}) for value in item["before"]], batch_size=500)
    for item in reversed(journal["rows"]):
        model = apps.get_model(item["model"])
        qs = query(model).filter(pk=item["pk"])
        if item["before"] is None:
            qs._raw_delete("default")
        else:
            qs.update(**values(model, item["before"]))


def cleanup_files(files):
    for item in files:
        try:
            apps.get_model(item["model"])._meta.get_field(item["field"]).storage.delete(item["name"])
        except OSError:
            pass  # Kept in the private journal for operational reconciliation.


def cleanup_orphans(job_id):
    """Recover files left by a killed worker without deleting live references."""
    from common.quotas import FILE_FIELDS
    from apps.billing.quotas import _delete_unreferenced
    seen = set()
    for label, fields in FILE_FIELDS.items():
        for name in fields:
            storage = apps.get_model(label)._meta.get_field(name).storage
            if id(storage) in seen:
                continue
            seen.add(id(storage))
            pending = [f"recovered/{job_id}"]
            while pending:
                prefix = pending.pop()
                try:
                    directories, names = storage.listdir(prefix)
                except (OSError, NotImplementedError):
                    continue
                pending.extend(f"{prefix}/{child}" for child in directories)
                for filename in names:
                    _delete_unreferenced(storage, f"{prefix}/{filename}")


def restore_backup_files(package, job, files):
    """Rollback must work even if an old, now-unreferenced upload was collected."""
    import hashlib
    with zipfile.ZipFile(package.path) as archive:
        for entry in package.manifest["attachments"]:
            model = apps.get_model(entry["model"])
            field = model._meta.get_field(entry["field"])
            obj = query(model).get(pk=entry["object_id"])
            current = getattr(obj, field.name)
            digest = hashlib.sha256()
            try:
                with current.storage.open(current.name, "rb") as handle:
                    while chunk := handle.read(1024 * 1024):
                        digest.update(chunk)
                valid = digest.hexdigest() == entry["sha256"]
            except FileNotFoundError:
                valid = False
            if not valid:
                with archive.open(entry["path"]) as handle:
                    name = field.storage.save(f"recovered/{job.pk}/rollback/{entry['path']}", ContentFile(handle.read()))
                files.append({"model": entry["model"], "field": field.name, "name": name})
                query(model).filter(pk=obj.pk).update(**{field.attname: name})
