"""Fail-closed validation of server-created technical recovery packages."""
import hashlib
import json
import stat
import zipfile
from pathlib import PurePosixPath

from django.apps import apps
from django.conf import settings
from django.db.models import FileField

from ..exports.capture import Capture, ExportFailure, check_inventory, dumps, sha256_file
from ..exports.registry import REGISTRY, INVENTORY_VERSION, GLOBAL_ITEM_CATALOG


class RecoveryFailure(ExportFailure):
    pass


def fail(code="invalid_package"):
    raise RecoveryFailure(code)


class Package:
    def __init__(self, path, digest, organization_id):
        check_inventory()
        self.path = path
        self.organization_id = str(organization_id)
        if sha256_file(path) != digest:
            fail("integrity")
        self.rows, self.relations = {}, {}
        with zipfile.ZipFile(path) as archive:
            infos = archive.infolist()
            names = [entry.filename for entry in infos]
            if len(names) != len(set(names)) or sum(entry.file_size for entry in infos) > settings.ORGANIZATION_RECOVERY_MAX_BYTES:
                fail("limit_exceeded")
            for entry in infos:
                name = PurePosixPath(entry.filename)
                if name.is_absolute() or ".." in name.parts or "\\" in entry.filename or stat.S_ISLNK(entry.external_attr >> 16):
                    fail()
            self.manifest = json.loads(archive.read("manifest.json"))
            manifest = self.manifest
            if manifest.get("format_version") != 1 or manifest.get("inventory_version") != INVENTORY_VERSION or manifest.get("format") != "recovery" or manifest.get("organization_id") != self.organization_id:
                fail("incompatible")
            entries = manifest["entries"]
            paths = [entry["path"] for entry in entries]
            if len(paths) != len(set(paths)) or set(names) != set(paths) | {"manifest.json"}:
                fail()
            for entry in entries:
                size, digest = 0, hashlib.sha256()
                with archive.open(entry["path"]) as handle:
                    while chunk := handle.read(1024 * 1024):
                        size += len(chunk); digest.update(chunk)
                if size != entry["size"] or digest.hexdigest() != entry["sha256"]:
                    fail("integrity")
            schema = json.loads(archive.read("schema.json"))
            if schema.get("models") != Capture(organization_id, ".").schema() or schema.get("inventory_version") != INVENTORY_VERSION:
                fail("incompatible")
            if hashlib.sha256(archive.read("schema.json")).hexdigest() != manifest.get("schema_sha256"):
                fail("integrity")
            count = 0
            synthetic = set(manifest.get("synthetic_actor_ids", []))
            for label, spec in REGISTRY.items():
                model = apps.get_model(label)
                records = {}
                with archive.open(f"data/{label}.jsonl") as handle:
                    for line in handle:
                        count += 1
                        if count > settings.ORGANIZATION_RECOVERY_MAX_ROWS:
                            fail("limit_exceeded")
                        row = json.loads(line)
                        pk = str(model._meta.pk.to_python(row[model._meta.pk.name]))
                        if pk in records or set(row) - set(spec["fields"]):
                            fail()
                        if set(row) != set(spec["fields"]) and not (label == "accounts.user" and pk in synthetic):
                            fail()
                        for name, value in row.items():
                            field = model._meta.get_field(name)
                            if value is None:
                                if not field.null:
                                    fail()
                            elif not field.is_relation and field.get_internal_type() != "JSONField":
                                field.to_python(value)
                            if isinstance(field, FileField) and value and (value not in paths or not value.startswith(f"files/{label}/{pk}/")):
                                fail()
                        records[pk] = row
                if len(records) != manifest["entity_counts"].get(label):
                    fail("integrity")
                self.rows[label] = records
                for name in spec["m2m"]:
                    with archive.open(f"relations/{label}.{name}.jsonl") as handle:
                        links = [json.loads(line) for line in handle]
                    count += len(links)
                    if count > settings.ORGANIZATION_RECOVERY_MAX_ROWS:
                        fail("limit_exceeded")
                    self.relations[(label, name)] = links
        self.validate_relations()

    def validate_relations(self):
        if set(self.rows["organizations.organization"]) != {self.organization_id}:
            fail("isolation")
        for label, records in self.rows.items():
            model = apps.get_model(label)
            for pk, row in records.items():
                for name, value in row.items():
                    field = model._meta.get_field(name)
                    if field.is_relation and value is not None and str(value) not in self.rows[field.related_model._meta.label_lower]:
                        fail("isolation")
                scope = REGISTRY[label]["scope"]
                if scope is not None and not (label == GLOBAL_ITEM_CATALOG and row["organization"] is None):
                    current, current_model = row, model
                    for part in scope.split("__"):
                        if part == "pk":
                            current = str(current[current_model._meta.pk.name]); break
                        field = current_model._meta.get_field(part)
                        value = current.get(part)
                        if field.related_model._meta.label_lower == "organizations.organization":
                            current = str(value); break
                        if value is None:
                            # Legacy cycles can omit organization, never their field/farm chain.
                            fail("isolation")
                        current_model = field.related_model
                        current = self.rows[current_model._meta.label_lower][str(value)]
                    if current != self.organization_id:
                        fail("isolation")
                if label == "accounts.operatorrecordownership":
                    if str(row["object_id"]) not in self.rows.get(row["model_label"].lower(), {}):
                        fail("isolation")
        for (label, name), links in self.relations.items():
            target = apps.get_model(label)._meta.get_field(name).related_model._meta.label_lower
            pairs = set()
            for link in links:
                if set(link) != {"source", "target"}:
                    fail()
                pair = (str(link["source"]), str(link["target"]))
                if pair in pairs or pair[0] not in self.rows[label] or pair[1] not in self.rows[target]:
                    fail("isolation")
                pairs.add(pair)

    def shared(self, label, row):
        return REGISTRY[label]["scope"] is None or label.startswith("billing.") or (label == GLOBAL_ITEM_CATALOG and row["organization"] is None)

    def fingerprint(self):
        """Stable content digest: placeholder timestamps depend on capture time."""
        synthetic = set(self.manifest.get("synthetic_actor_ids", []))
        digest = hashlib.sha256()
        for label in sorted(self.rows):
            for pk, row in sorted(self.rows[label].items()):
                value = dict(row)
                if label == "accounts.user" and pk in synthetic:
                    value.pop("created_at", None); value.pop("updated_at", None)
                digest.update(dumps([label, value]).encode())
        for key, links in sorted(self.relations.items()):
            digest.update(dumps([key, sorted(links, key=dumps)]).encode())
        digest.update(dumps(self.manifest["attachments"]).encode())
        return digest.hexdigest()
