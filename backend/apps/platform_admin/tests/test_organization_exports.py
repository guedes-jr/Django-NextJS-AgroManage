import csv
import hashlib
import io
import json
import tempfile
import uuid
import zipfile
from datetime import timedelta
from pathlib import Path
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.organizations.models import Organization
from apps.platform_admin.models import OrganizationExport, PlatformStaffProfile, PlatformAuditLog
from apps.platform_admin.exports.capture import Capture, check_inventory
from apps.platform_admin.exports.registry import REGISTRY
from apps.platform_admin.exports.service import generate_export, maintain_exports
from apps.platform_admin.exports.storage import ExportStorage
from apps.ai_assistant.models import AIConversation, AIMessage, SupportTicketMessage
from apps.ai_assistant.ticket_services import open_ticket, add_message, upload_attachment
from apps.farms.models import Farm, Sector
from apps.livestock.models import Animal, AnimalBatch, Species, Breed
from apps.inventory.models import ItemEstoque
from apps.tasks.models import Task

User = get_user_model()


@override_settings(STORAGES={"default": {"BACKEND": "django.core.files.storage.InMemoryStorage"}})
class OrganizationExportTests(APITestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(); self.addCleanup(self.directory.cleanup)
        self.settings = override_settings(ORGANIZATION_EXPORT_ROOT=str(Path(self.directory.name) / "exports"), SUPPORT_ATTACHMENT_ROOT=str(Path(self.directory.name) / "support"))
        self.settings.enable(); self.addCleanup(self.settings.disable)
        self.admin = self.staff("platform_admin")
        self.support = self.staff("platform_support")
        self.org = Organization.objects.create(name="Cliente Alfa", slug="export-alfa")
        self.other = Organization.objects.create(name="Cliente Beta", slug="export-beta")
        self.customer = User.objects.create_user(email="customer@exports.test", password="Password-DO-NOT-EXPORT!", full_name="Cliente", organization=self.org, role="admin", organization_responsible=True)
        self.foreign = User.objects.create_user(email="foreign@exports.test", organization=self.other, role="admin")
        self.farm = Farm.objects.create(organization=self.org, name="FAZENDA-ALFA")
        self.foreign_farm = Farm.objects.create(organization=self.other, name="PRIVATE-BETA")
        self.client.force_authenticate(self.admin)
        self.dispatcher = patch("apps.platform_admin.tasks.generate_organization_export.delay")
        self.dispatch = self.dispatcher.start(); self.addCleanup(self.dispatcher.stop)

    def staff(self, role):
        value = User.objects.create_user(email=f"{role}@exports.test", full_name="STAFF-PRIVATE")
        PlatformStaffProfile.objects.create(user=value, role=role)
        return value

    def url(self, job=None, action="list", org=None):
        params = {"organization_pk": str((org or self.org).pk)}
        if job:
            params["pk"] = str(job.pk)
        return reverse(f"platform-organization-export-{action}", kwargs=params)

    def request(self, format="customer", key=None, org=None):
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(self.url(org=org), {"format": format, "request_key": key or str(uuid.uuid4())}, format="json")
        self.assertEqual(response.status_code, 202, response.data)
        return OrganizationExport.objects.get(pk=response.data["id"])

    def generate(self, job):
        generate_export(job.pk)
        job.refresh_from_db()
        self.assertEqual(job.status, "ready", job.error_code)
        return zipfile.ZipFile(ExportStorage().path(job.archive_name))

    def rows(self, archive, label):
        return [json.loads(line) for line in archive.read(f"data/{label}.jsonl").decode().splitlines() if line]

    def test_inventory_manifest_complete_file_checksums_and_tenant_boundary(self):
        self.customer.avatar = ContentFile(b"avatar-data", name="avatar.png")
        self.customer.save(update_fields=["avatar"])
        sector = Sector.objects.create(farm=self.farm, name="Setor Alfa")
        key = str(uuid.uuid4())
        job = self.request(key=key)
        self.assertEqual(self.request(key=key).pk, job.pk)
        self.assertEqual(self.dispatch.call_count, 1)
        with self.generate(job) as archive:
            manifest = json.loads(archive.read("manifest.json"))
            self.assertEqual(manifest["organization_id"], str(self.org.pk))
            self.assertEqual(set(manifest["entity_counts"]), set(REGISTRY))
            for label, count in manifest["entity_counts"].items():
                self.assertEqual(len(self.rows(archive, label)), count, label)
            for entry in manifest["entries"]:
                content = archive.read(entry["path"])
                self.assertEqual(len(content), entry["size"])
                self.assertEqual(hashlib.sha256(content).hexdigest(), entry["sha256"])
            self.assertEqual(self.rows(archive, "farms.farm")[0]["id"], str(self.farm.pk))
            self.assertEqual(self.rows(archive, "farms.sector")[0]["farm"], str(self.farm.pk))
            text = b"\n".join(archive.read(name) for name in archive.namelist()).decode("utf-8-sig")
            for secret in ["PRIVATE-BETA", self.foreign.email, "Password-DO-NOT-EXPORT!", self.customer.password]:
                self.assertNotIn(secret, text)
            user = self.rows(archive, "accounts.user")[0]
            for field in ["password", "session_version", "is_staff", "is_superuser"]:
                self.assertNotIn(field, user)
            self.assertEqual(archive.read(user["avatar"]), b"avatar-data")
            self.assertEqual(len(manifest["attachments"]), 1)
            self.assertIn("tables/farms.farm.csv", archive.namelist())
        self.assertEqual(job.archive_sha256, hashlib.sha256(Path(ExportStorage().path(job.archive_name)).read_bytes()).hexdigest())

    def test_many_to_many_and_shared_catalogs_are_preserved(self):
        species = Species.objects.create(name="Espécie exportada", code="export-species")
        breed = Breed.objects.create(name="Raça exportada", species=species)
        unused = Species.objects.create(name="Catálogo não usado", code="export-unused")
        parent = AnimalBatch.objects.create(farm=self.farm, species=species, breed=breed, batch_code="SOURCE", quantity=5, entry_date=timezone.localdate())
        child = AnimalBatch.objects.create(farm=self.farm, species=species, batch_code="CHILD", quantity=2, entry_date=timezone.localdate())
        child.source_batches.add(parent)
        self.customer.allowed_livestock.add(species)
        with self.generate(self.request("recovery")) as archive:
            ids = {row["id"] for row in self.rows(archive, "livestock.species")}
            self.assertEqual(ids, {str(species.pk)})
            relations = [json.loads(line) for line in archive.read("relations/livestock.animalbatch.source_batches.jsonl").decode().splitlines()]
            self.assertIn({"source": str(child.pk), "target": str(parent.pk)}, relations)
            self.assertNotIn("tables/farms.farm.csv", archive.namelist())
            self.assertIn("schema.json", archive.namelist())

    def test_public_support_attachments_and_ai_content_without_internal_notes_or_provider_tokens(self):
        conversation = AIConversation.objects.create(organization=self.org, user=self.customer, subject="support", openai_previous_response_id="PROVIDER-SECRET")
        AIMessage.objects.create(conversation=conversation, role="user", content="IA-CUSTOMER-DATA", openai_response_id="PROVIDER-TOKEN", provider_attempts=[{"token": "ATTEMPT-SECRET"}])
        ticket = open_ticket(user=self.customer, values={"subject": "Pedido de ajuda", "body": "MENSAGEM-PUBLICA", "category": "question", "priority": "normal", "creation_key": uuid.uuid4(), "shared_context": ""})
        public = ticket.messages.get()
        upload_attachment(user=self.customer, ticket_id=ticket.pk, message_id=public.pk, values={"file": ContentFile(b"PUBLIC-FILE", name="public.txt"), "request_key": uuid.uuid4(), "expected_version": ticket.version})
        ticket.refresh_from_db()
        ticket, note = add_message(user=self.support, ticket_id=ticket.pk, staff=True, values={"body": "INTERNAL-NOTE-SECRET", "is_internal": True, "expected_version": ticket.version, "request_key": uuid.uuid4()})
        upload_attachment(user=self.support, ticket_id=ticket.pk, message_id=note.pk, staff=True, values={"file": ContentFile(b"INTERNAL-FILE-SECRET", name="internal.txt"), "request_key": uuid.uuid4(), "expected_version": ticket.version})
        with self.generate(self.request()) as archive:
            combined = b"\n".join(archive.read(name) for name in archive.namelist()).decode("utf-8-sig")
            self.assertIn("IA-CUSTOMER-DATA", combined)
            self.assertIn("PUBLIC-FILE", combined)
            for value in ["INTERNAL-NOTE-SECRET", "INTERNAL-FILE-SECRET", "PROVIDER-SECRET", "PROVIDER-TOKEN", "ATTEMPT-SECRET"]:
                self.assertNotIn(value, combined)
            self.assertEqual(len(self.rows(archive, "ai_assistant.supportticketmessage")), 1)

    def test_internal_actors_become_inactive_synthetic_references(self):
        task = Task.objects.create(organization=self.org, title="Registro assistido", created_by=self.support)
        with self.generate(self.request("recovery")) as archive:
            row = self.rows(archive, "tasks.task")[0]
            self.assertNotEqual(row["created_by"], str(self.support.pk))
            synthetic = next(value for value in self.rows(archive, "accounts.user") if value["id"] == row["created_by"])
            self.assertFalse(synthetic["is_active"])
            self.assertEqual(synthetic["full_name"], "Ator interno omitido")
            self.assertNotIn(self.support.email, archive.read("data/accounts.user.jsonl").decode())

    def test_cross_tenant_fk_fails_without_exposing_partial_package(self):
        Task.objects.create(organization=self.org, title="Referência indevida", farm=self.foreign_farm)
        job = self.request()
        generate_export(job.pk); job.refresh_from_db()
        self.assertEqual(job.status, "failed")
        self.assertEqual(job.error_code, "cross_tenant_reference")
        self.assertFalse(job.archive_name)
        self.assertEqual(self.client.get(self.url(job, "download")).status_code, 400)
        self.assertEqual(list((Path(self.directory.name) / "exports/work").iterdir()), [])

    def test_missing_file_fails_and_retry_keeps_history(self):
        self.org.logo = "missing-logo.png"; self.org.save(update_fields=["logo"])
        job = self.request()
        generate_export(job.pk); job.refresh_from_db()
        self.assertEqual(job.status, "failed")
        self.assertEqual(job.error_code, "missing_file")
        self.org.logo = None; self.org.save(update_fields=["logo"])
        key = str(uuid.uuid4())
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(self.url(job, "retry"), {"request_key": key}, format="json")
        self.assertEqual(response.status_code, 202)
        child = OrganizationExport.objects.get(pk=response.data["id"])
        self.assertEqual(child.parent_id, job.pk)
        with self.generate(child):
            pass
        job.refresh_from_db(); self.assertEqual(job.status, "failed")

    def test_owner_admin_only_and_assisted_access_blocked(self):
        job = self.request()
        for user in [self.customer, self.foreign, self.support]:
            self.client.force_authenticate(user)
            self.assertEqual(self.client.get(self.url()).status_code, 403)
            self.assertEqual(self.client.get(self.url(job, "detail")).status_code, 403)
        self.admin.support_access_grant = object(); self.admin.organization = self.org
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get(self.url()).status_code, 403)

    def test_download_scoping_expiry_private_headers_and_retention_cleanup(self):
        job = self.request()
        with self.generate(job):
            pass
        response = self.client.get(self.url(job, "download"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Cache-Control"], "private, no-store")
        self.assertEqual(response["X-Archive-SHA256"], job.archive_sha256)
        self.assertEqual(b"".join(response.streaming_content)[:2], b"PK")
        self.assertEqual(self.client.get(self.url(job, "download", self.other)).status_code, 404)
        path = Path(ExportStorage().path(job.archive_name))
        OrganizationExport.objects.filter(pk=job.pk).update(expires_at=timezone.now() - timedelta(seconds=1))
        self.assertEqual(self.client.get(self.url(job, "detail")).data["status"], "expired")
        self.assertEqual(self.client.get(self.url(job, "download")).status_code, 400)
        maintain_exports(); job.refresh_from_db()
        self.assertEqual(job.status, "expired"); self.assertFalse(path.exists())
        self.assertTrue(PlatformAuditLog.objects.filter(action="organization.export_downloaded").exists())

    def test_revocation_worker_redelivery_and_stale_lease_recovery(self):
        job = self.request()
        PlatformStaffProfile.objects.filter(user=self.admin).update(role="platform_finance")
        generate_export(job.pk); job.refresh_from_db()
        self.assertEqual(job.error_code, "permission_revoked")
        PlatformStaffProfile.objects.filter(user=self.admin).update(role="platform_admin")
        self.admin.refresh_from_db(); self.client.force_authenticate(self.admin)
        second = self.request()
        with self.generate(second):
            pass
        key = second.archive_name
        generate_export(second.pk); second.refresh_from_db()
        self.assertEqual(second.archive_name, key)
        third = self.request()
        OrganizationExport.objects.filter(pk=third.pk).update(status="running", lease_until=timezone.now() - timedelta(seconds=1))
        maintain_exports(); third.refresh_from_db()
        self.assertEqual(third.error_code, "interrupted")

    def test_limits_schema_validation_sanitized_errors_and_no_public_storage_url(self):
        check_inventory()
        job = self.request()
        with override_settings(ORGANIZATION_EXPORT_MAX_ROWS=1):
            generate_export(job.pk)
        job.refresh_from_db(); self.assertEqual(job.error_code, "limit_exceeded")
        another = self.request()
        with patch("apps.platform_admin.exports.service.Capture.run", side_effect=RuntimeError("DATABASE-SECRET")):
            generate_export(another.pk)
        another.refresh_from_db()
        response = self.client.get(self.url(another, "detail"))
        self.assertNotIn("DATABASE-SECRET", str(response.data))
        self.assertNotIn("archive_name", response.data)
        with self.assertRaises(ValueError):
            ExportStorage().url("anything.zip")

    def test_csv_formula_escaping_and_no_domain_side_effects(self):
        self.farm.name = "=CMD()"; self.farm.save()
        before = (User.objects.count(), Farm.objects.count(), SupportTicketMessage.objects.count())
        with self.generate(self.request()) as archive:
            values = list(csv.DictReader(io.StringIO(archive.read("tables/farms.farm.csv").decode("utf-8-sig"))))
            self.assertEqual(values[0]["name"], "'=CMD()")
        self.assertEqual(before, (User.objects.count(), Farm.objects.count(), SupportTicketMessage.objects.count()))

    def test_public_storage_root_rejected_and_broker_failure_preserves_queue(self):
        from django.conf import settings
        from django.core.exceptions import ImproperlyConfigured
        with override_settings(ORGANIZATION_EXPORT_ROOT=str(Path(settings.MEDIA_ROOT) / "exports")):
            with self.assertRaises(ImproperlyConfigured):
                ExportStorage().path("test.zip")
        with patch("apps.platform_admin.tasks.generate_organization_export.delay", side_effect=RuntimeError("Broker indisponível")):
            job = self.request()
        self.assertEqual(job.status, "queued")
        self.dispatch.reset_mock()
        maintain_exports()
        self.dispatch.assert_called_once_with(str(job.pk))
    def test_committed_package_survives_staging_cleanup_failure(self):
        job = self.request()
        with patch("apps.platform_admin.exports.service.tempfile.TemporaryDirectory.cleanup", side_effect=OSError("cleanup failed")):
            with self.generate(job) as archive:
                self.assertIn("manifest.json", archive.namelist())
        job.refresh_from_db()
        self.assertEqual(job.status, "ready")
        self.assertTrue(Path(ExportStorage().path(job.archive_name)).exists())

    def test_publication_failure_does_not_expose_a_partial_package(self):
        from apps.platform_admin.exports.service import worker_audit
        job = self.request()
        def audit(value, action):
            if action == "ready":
                raise RuntimeError("audit unavailable")
            return worker_audit(value, action)
        with patch("apps.platform_admin.exports.service.worker_audit", side_effect=audit):
            generate_export(job.pk)
        job.refresh_from_db()
        self.assertEqual(job.status, "failed")
        self.assertEqual(job.archive_name, "")
        self.assertEqual(list(Path(self.directory.name).glob("exports/packages/*.zip")), [])
        self.assertEqual(self.client.get(self.url(job, "download")).status_code, 400)

    def test_truncated_download_is_invalidated_and_can_be_retried(self):
        job = self.request()
        with self.generate(job):
            pass
        Path(ExportStorage().path(job.archive_name)).write_bytes(b"truncated")
        self.assertEqual(self.client.get(self.url(job, "download")).status_code, 404)
        job.refresh_from_db()
        self.assertEqual((job.status, job.error_code, job.archive_name), ("failed", "missing_file", ""))
        response = self.client.post(self.url(job, "retry"), {"request_key": str(uuid.uuid4())}, format="json")
        self.assertEqual(response.status_code, 202)
