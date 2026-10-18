"""Explicit inventory capture in a repeatable-read snapshot; never dump a database."""
import csv
import hashlib
import json
import shutil
import uuid
from collections import defaultdict
from pathlib import Path

from django.apps import apps
from django.conf import settings
from django.core.serializers.json import DjangoJSONEncoder
from django.db import connection, transaction
from django.db.migrations.recorder import MigrationRecorder
from django.db.models import Q, FileField
from django.utils import timezone

from apps.organizations.models import Organization
from apps.platform_admin.adoption import customers
from .registry import REGISTRY, EXCLUDED_FIELDS, EXCLUDED_MODELS, APPS, INVENTORY_VERSION, GLOBAL_ITEM_CATALOG


class ExportFailure(Exception):
    def __init__(self, code):
        self.code = code
        super().__init__(code)


def dumps(value):
    return json.dumps(value, cls=DjangoJSONEncoder, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def check_inventory():
    known = {m._meta.label_lower for app in APPS for m in apps.get_app_config(app).get_models()}
    if known != set(REGISTRY) | set(EXCLUDED_MODELS):
        raise ExportFailure("schema_changed")
    for label, spec in REGISTRY.items():
        model = apps.get_model(label)
        if {f.name for f in model._meta.fields} != set(spec["fields"]) | set(EXCLUDED_FIELDS.get(label, ())):
            raise ExportFailure("schema_changed")
        expected_m2m = set(spec["m2m"]) | ({"groups", "user_permissions"} if label == "accounts.user" else set())
        if {f.name for f in model._meta.many_to_many} != expected_m2m:
            raise ExportFailure("schema_changed")


class Capture:
    def __init__(self, organization_id, root):
        self.organization_id = organization_id
        self.root = Path(root)
        self.ids = defaultdict(set)
        self.refs = defaultdict(set)
        self.relations_done = defaultdict(set)
        self.actors = {}
        self.rows = 0
        self.bytes = 0
        self.file_entries = []
        self.customer_ids = customers().filter(organization_id=organization_id).values("pk")

    def reserve(self, count, rows=0):
        self.bytes += count
        self.rows += rows
        if self.bytes > settings.ORGANIZATION_EXPORT_MAX_BYTES or self.rows > settings.ORGANIZATION_EXPORT_MAX_ROWS:
            raise ExportFailure("limit_exceeded")

    def write_row(self, path, row, count=True):
        value = (dumps(row) + "\n").encode()
        self.reserve(len(value), int(count))
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        with path.open("ab") as handle:
            handle.write(value)

    def scoped(self, label):
        model = apps.get_model(label)
        scope = REGISTRY[label]["scope"]
        if scope is None:
            return model.objects.none()
        query = Q(**{scope: self.organization_id})
        # Preserve legacy cycles without organization, but prefer explicit ownership.
        if scope.endswith("field__farm__organization") and label != "crops.field":
            prefix = scope.removesuffix("field__farm__organization")
            canonical = prefix + "organization"
            query = Q(**{canonical: self.organization_id}) | (Q(**{canonical + "__isnull": True}) & query)
        queryset = model.objects.filter(query)
        if label == "accounts.user":
            queryset = queryset.filter(pk__in=self.customer_ids)
        for field in ("user",):
            if label in {"accounts.operatorrecordownership", "livestock.acknowledgedoperationalalert", "ai_assistant.aiconversation", "ai_assistant.aiusage", "ai_assistant.aifeedback", "ai_assistant.supportusage", "notifications.notificationpreference"}:
                queryset = queryset.filter(**{field + "__in": self.customer_ids})
        if label in {"ai_assistant.aimessage", "ai_assistant.aifeedback"}:
            prefix = "conversation" if label.endswith("aimessage") else "message__conversation"
            queryset = queryset.filter(**{prefix + "__user__in": self.customer_ids})
        ticket_path = {
            "ai_assistant.supportticket": "", "ai_assistant.supportticketmessage": "ticket__",
            "ai_assistant.supportticketevent": "ticket__", "ai_assistant.supportticketattachment": "message__ticket__",
        }.get(label)
        if ticket_path is not None:
            queryset = queryset.filter(**{ticket_path + "requester__in": self.customer_ids})
        if label in {"ai_assistant.supportticketmessage", "ai_assistant.supportticketevent"}:
            queryset = queryset.filter(is_internal=False)
        if label == "ai_assistant.supportticketattachment":
            queryset = queryset.filter(message__is_internal=False)
        return queryset

    def capture_rows(self, label, queryset):
        model = apps.get_model(label)
        spec = REGISTRY[label]
        for row in queryset.order_by("pk").values(*spec["fields"]).iterator(chunk_size=500):
            pk = str(row[model._meta.pk.name])
            if pk in self.ids[label]:
                continue
            self.ids[label].add(pk)
            for name in spec["fields"]:
                field = model._meta.get_field(name)
                value = row[name]
                if field.is_relation and value is not None:
                    self.refs[field.related_model._meta.label_lower].add(str(value))
                if isinstance(field, FileField) and value:
                    row[name] = self.copy_blob(label, pk, field, value)
            if label == "billing.subscription":
                row["custom_limits"] = {key: value for key, value in (row["custom_limits"] or {}).items() if key in {"max_users", "max_farms", "max_storage_mb", "warning_threshold_percent", "max_reports_per_month"}}
            self.write_row(self.root / "raw" / (label + ".jsonl"), row)

    def copy_blob(self, label, pk, field, name):
        # Source rows are scoped; storage names never become archive paths.
        suffix = Path(name).suffix.lower()
        suffix = suffix if len(suffix) <= 12 and suffix.removeprefix(".").isalnum() else ""
        relative = f"files/{label}/{pk}/{field.name}{suffix}"
        target = self.root / relative
        target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        try:
            before = field.storage.size(name)
            digest, size = hashlib.sha256(), 0
            with field.storage.open(name, "rb") as source, target.open("wb") as destination:
                while chunk := source.read(1024 * 1024):
                    self.reserve(len(chunk))
                    destination.write(chunk)
                    digest.update(chunk)
                    size += len(chunk)
            if size != before or field.storage.size(name) != before:
                raise ExportFailure("file_changed")
        except ExportFailure:
            raise
        except FileNotFoundError:
            raise ExportFailure("missing_file")
        except Exception:
            raise ExportFailure("unreadable_file")
        self.file_entries.append({"path": relative, "size": size, "sha256": digest.hexdigest(), "kind": "attachment", "model": label, "object_id": pk, "field": field.name})
        return relative

    def capture_relations(self, label):
        model = apps.get_model(label)
        pending = sorted(self.ids[label] - self.relations_done[label])
        if not pending:
            return
        for name in REGISTRY[label]["m2m"]:
            field = model._meta.get_field(name)
            through = field.remote_field.through
            source, target = field.m2m_field_name(), field.m2m_reverse_field_name()
            for start in range(0, len(pending), 500):
                for first, second in through.objects.filter(**{source + "__in": pending[start:start + 500]}).order_by(source, target).values_list(source, target).iterator(chunk_size=500):
                    self.refs[field.related_model._meta.label_lower].add(str(second))
                    self.write_row(self.root / "raw_relations" / f"{label}.{name}.jsonl", {"source": first, "target": second})
        self.relations_done[label].update(pending)

    def resolve_references(self):
        while True:
            previous = sum(len(values) for values in self.ids.values())
            for label in REGISTRY:
                self.capture_relations(label)
            for label, refs in list(self.refs.items()):
                if label not in REGISTRY:
                    raise ExportFailure("cross_tenant_reference")
                missing = sorted(refs - self.ids[label])
                if not missing:
                    continue
                model = apps.get_model(label)
                if label == "accounts.user":
                    for start in range(0, len(missing), 500):
                        internal = model.objects.filter(pk__in=missing[start:start + 500]).filter(Q(platform_staff_profile__isnull=False) | Q(affiliate_profile__portal_access_only=True))
                        for pk in internal.values_list("pk", flat=True):
                            self.actors[str(pk)] = str(uuid.uuid5(self.organization_id, f"export-actor:{pk}"))
                    if set(missing) - set(self.actors):
                        raise ExportFailure("cross_tenant_reference")
                elif REGISTRY[label]["scope"] is None or label == GLOBAL_ITEM_CATALOG:
                    for start in range(0, len(missing), 500):
                        queryset = model.objects.filter(pk__in=missing[start:start + 500])
                        if label == GLOBAL_ITEM_CATALOG:
                            queryset = queryset.filter(organization__isnull=True)
                        self.capture_rows(label, queryset)
            if sum(len(values) for values in self.ids.values()) == previous:
                break
        for label, refs in self.refs.items():
            remaining = refs - self.ids[label] - (set(self.actors) if label == "accounts.user" else set())
            if remaining:
                raise ExportFailure("cross_tenant_reference")

    def rewrite(self):
        for label, spec in REGISTRY.items():
            model = apps.get_model(label)
            source = self.root / "raw" / (label + ".jsonl")
            target = self.root / "data" / (label + ".jsonl")
            target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            target.touch()
            if source.exists():
                with source.open(encoding="utf-8") as handle:
                    for line in handle:
                        row = json.loads(line)
                        for name in spec["fields"]:
                            field = model._meta.get_field(name)
                            if field.is_relation and field.related_model._meta.label_lower == "accounts.user":
                                if row[name] is not None:
                                    row[name] = self.actors.get(str(row[name]), row[name])
                        if label == "accounts.operatorrecordownership":
                            key = row["model_label"].lower()
                            if str(row["object_id"]) not in self.ids.get(key, set()):
                                raise ExportFailure("cross_tenant_reference")
                        self.write_row(target, row, count=False)
            for name in spec["m2m"]:
                source_relation = self.root / "raw_relations" / f"{label}.{name}.jsonl"
                target_relation = self.root / "relations" / f"{label}.{name}.jsonl"
                target_relation.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                target_relation.touch()
                if source_relation.exists():
                    self.reserve(source_relation.stat().st_size)
                    shutil.copyfile(source_relation, target_relation)
        for pk in sorted(self.actors.values()):
            row = {"id": pk, "email": f"actor-{pk}@export.invalid", "full_name": "Ator interno omitido", "role": "operator", "organization": str(self.organization_id), "is_active": False, "organization_responsible": False, "avatar": "", "created_at": self.snapshot_at, "updated_at": self.snapshot_at}
            self.write_row(self.root / "data/accounts.user.jsonl", row)

    def schema(self):
        result = {}
        for label, spec in REGISTRY.items():
            model = apps.get_model(label)
            result[label] = {"ownership_path": spec["scope"], "fields": {name: {"type": model._meta.get_field(name).get_internal_type(), "nullable": model._meta.get_field(name).null, "related_model": model._meta.get_field(name).related_model._meta.label_lower if model._meta.get_field(name).is_relation else None} for name in spec["fields"]}, "many_to_many": {name: model._meta.get_field(name).related_model._meta.label_lower for name in spec["m2m"]}}
        return result

    def run(self, *, in_transaction=False):
        check_inventory()
        # Repeatable read must precede the first snapshot query in this transaction.
        with transaction.atomic():
            if connection.vendor == "postgresql" and not in_transaction:
                with connection.cursor() as cursor:
                    cursor.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ")
            elif connection.vendor not in {"postgresql", "sqlite"}:
                raise ExportFailure("snapshot_unavailable")
            Organization.objects.select_for_update().get(pk=self.organization_id)
            self.snapshot_at = timezone.now().isoformat()
            self.migrations = sorted(f"{app}.{name}" for app, name in MigrationRecorder(connection).applied_migrations())
            for label in REGISTRY:
                self.capture_rows(label, self.scoped(label))
            self.resolve_references()
            self.rewrite()
        return self


def sha256_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def csv_tables(capture):
    for label, spec in REGISTRY.items():
        target = capture.root / "tables" / (label + ".csv")
        target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        with target.open("w", encoding="utf-8-sig", newline="") as output, (capture.root / "data" / (label + ".jsonl")).open(encoding="utf-8") as source:
            writer = csv.writer(output)
            writer.writerow(spec["fields"])
            for line in source:
                row = json.loads(line)
                cells = []
                for name in spec["fields"]:
                    value = row.get(name)
                    text = dumps(value) if isinstance(value, (dict, list)) else "" if value is None else str(value)
                    cells.append("'" + text if text.lstrip().startswith(("=", "+", "-", "@")) else text)
                writer.writerow(cells)
        capture.reserve(target.stat().st_size)
