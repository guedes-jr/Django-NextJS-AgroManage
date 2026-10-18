import json
import uuid
from datetime import timedelta
from pathlib import Path
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.db import transaction
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.organizations.models import Organization
from apps.platform_admin.models import OrganizationExport, OrganizationRecovery, PlatformAuditLog, PlatformStaffProfile
from apps.platform_admin.exports.service import generate_export
from apps.platform_admin.exports.storage import ExportStorage
from apps.platform_admin.recovery.service import process_recovery, directory, maintain_recoveries
from apps.platform_admin.recovery.package import Package, RecoveryFailure
from apps.farms.models import Farm
from apps.livestock.models import AnimalBatch, Species
from apps.tasks.models import Task
from apps.notifications.services import NotificationService
from . import test_organization_exports as fixtures

User = get_user_model()


@override_settings(STORAGES={"default": {"BACKEND": "django.core.files.storage.InMemoryStorage"}})
class OrganizationRecoveryTests(APITestCase):
    staff = fixtures.OrganizationExportTests.staff
    url = fixtures.OrganizationExportTests.url

    def setUp(self):
        fixtures.OrganizationExportTests.setUp(self)
        self.recovery_dispatcher = patch("apps.platform_admin.tasks.process_organization_recovery.delay")
        self.recovery_dispatch = self.recovery_dispatcher.start(); self.addCleanup(self.recovery_dispatcher.stop)

    def source(self):
        job = fixtures.OrganizationExportTests.request(self, "recovery")
        generate_export(job.pk); job.refresh_from_db()
        self.assertEqual(job.status, "ready", job.error_code)
        return job

    def rurl(self, job=None, action="list", org=None):
        kwargs = {"organization_pk": str((org or self.org).pk)}
        if job:
            kwargs["pk"] = str(job.pk)
        return reverse("platform-organization-recovery-" + action, kwargs=kwargs)

    def request(self, source=None):
        source = source or self.source()
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(self.rurl(), {"source_id": str(source.pk), "request_key": str(uuid.uuid4())}, format="json")
        self.assertEqual(response.status_code, 202, response.data)
        return OrganizationRecovery.objects.get(pk=response.data["id"])

    def rehearse(self, source=None):
        job = self.request(source)
        process_recovery(job.pk); job.refresh_from_db()
        self.assertEqual(job.status, "ready", job.error_code)
        return job

    def confirm(self, job, action="apply"):
        response = self.client.post(self.rurl(job, action), {"digest": job.preview_digest if action == "apply" else job.applied_digest, "confirmation": self.org.name}, format="json")
        self.assertEqual(response.status_code, 202, response.data)
        process_recovery(job.pk); job.refresh_from_db()
        return job

    def test_rehearsal_is_isolated_and_original_is_unchanged(self):
        self.customer.avatar.save("avatar.txt", ContentFile(b"PRIVATE-CUSTOMER-FILE"), save=True)
        source = self.source()
        before = (self.org.name, self.farm.name, self.customer.password, self.customer.is_active)
        job = self.rehearse(source)
        clone = job.isolated_organization
        self.assertTrue(clone.recovery_isolated); self.assertFalse(clone.is_active)
        self.assertEqual(Farm.objects.filter(organization=clone).count(), 1)
        clone_user = User.objects.get(organization=clone)
        self.assertFalse(clone_user.is_active); self.assertFalse(clone_user.has_usable_password())
        self.assertTrue(clone_user.email.endswith("@export.invalid"))
        self.assertIsNone(NotificationService.create(clone_user, "title", "body"))
        self.org.refresh_from_db(); self.farm.refresh_from_db(); self.customer.refresh_from_db()
        self.assertEqual(before, (self.org.name, self.farm.name, self.customer.password, self.customer.is_active))
        self.assertEqual(job.preview["verified_rehearsal_counts"]["farms.farm"], 1)
        self.assertEqual(job.preview["files"], 1)
        response = self.client.get(self.rurl(job, "records"), {"entity": "farms.farm"})
        self.assertEqual(response.data["results"][0]["source"]["name"], self.farm.name)
        self.assertEqual(response.data["results"][0]["restored"]["organization"], clone.pk)
        self.assertEqual(response.data["results"][0]["restored"]["name"], self.farm.name)
        self.assertEqual(self.client.get(self.rurl(job, "detail", self.other)).status_code, 404)

    def test_apply_preserves_new_records_and_credentials_and_rollback_restores_before(self):
        source = self.source()
        self.farm.name = "Changed after export"; self.farm.save()
        added = Farm.objects.create(organization=self.org, name="NEWER-PRESERVED")
        job = self.rehearse(source)
        self.assertEqual(job.preview["newer_records_preserved"]["farms.farm"], 1)
        password = self.customer.password
        self.confirm(job)
        self.assertEqual(job.status, "applied", job.error_code)
        self.farm.refresh_from_db(); self.assertEqual(self.farm.name, "FAZENDA-ALFA")
        self.customer.refresh_from_db(); self.assertEqual(self.customer.password, password)
        self.assertTrue(self.customer.is_active); self.assertTrue(Farm.objects.filter(pk=added.pk).exists())
        self.assertTrue(job.before_sha256); self.assertTrue(job.journal_sha256)
        self.confirm(job, "rollback")
        self.assertEqual(job.status, "rolled_back", job.error_code)
        self.farm.refresh_from_db(); self.assertEqual(self.farm.name, "Changed after export")
        self.foreign_farm.refresh_from_db(); self.assertEqual(self.foreign_farm.name, "PRIVATE-BETA")
        self.assertTrue(PlatformAuditLog.objects.filter(action="organization.recovery_rolled_back").exists())

    def test_stale_preview_and_post_apply_changes_block_writes(self):
        job = self.rehearse()
        self.farm.name = "AFTER-PREVIEW"; self.farm.save()
        self.confirm(job)
        self.assertEqual(job.status, "ready"); self.assertEqual(job.error_code, "stale_preview")
        self.assertEqual(self.client.post(self.rurl(job, "refresh"), {}, format="json").status_code, 202)
        process_recovery(job.pk); job.refresh_from_db()
        self.confirm(job); self.assertEqual(job.status, "applied", job.error_code)
        self.farm.name = "AFTER-APPLY"; self.farm.save()
        self.confirm(job, "rollback")
        self.assertEqual(job.status, "applied"); self.assertEqual(job.error_code, "rollback_conflict")
        self.farm.refresh_from_db(); self.assertEqual(self.farm.name, "AFTER-APPLY")

    def test_confirmation_permissions_idempotency_and_foreign_package(self):
        source = self.source()
        key = str(uuid.uuid4())
        payload = {"source_id": str(source.pk), "request_key": key}
        first = self.client.post(self.rurl(), payload, format="json")
        second = self.client.post(self.rurl(), payload, format="json")
        self.assertEqual(first.data["id"], second.data["id"])
        self.assertEqual(self.client.post(self.rurl(org=self.other), {**payload, "request_key": str(uuid.uuid4())}, format="json").status_code, 400)
        job = OrganizationRecovery.objects.get(pk=first.data["id"])
        process_recovery(job.pk); job.refresh_from_db()
        self.assertEqual(self.client.post(self.rurl(job, "apply"), {"digest": job.preview_digest, "confirmation": "wrong"}, format="json").status_code, 400)
        for user in (self.support, self.customer, self.foreign):
            self.client.force_authenticate(user)
            self.assertEqual(self.client.get(self.rurl(job, "detail")).status_code, 403)
        self.client.force_authenticate(self.admin)
        process_recovery(job.pk); self.assertEqual(OrganizationRecovery.objects.get(pk=job.pk).status, "ready")

    def test_package_tampering_and_limits_leave_no_partial_clone(self):
        source = self.source()
        path = Path(ExportStorage().path(source.archive_name)); path.write_bytes(b"BAD ZIP")
        job = self.request(source); process_recovery(job.pk); job.refresh_from_db()
        self.assertEqual(job.status, "failed"); self.assertEqual(job.error_code, "integrity")
        self.assertFalse(Organization.objects.filter(recovery_isolated=True).exists())
        another = self.request(self.source())
        with override_settings(ORGANIZATION_RECOVERY_MAX_ROWS=1):
            process_recovery(another.pk)
        another.refresh_from_db(); self.assertEqual(another.error_code, "limit_exceeded")

    def test_revocation_and_stale_delivery_do_not_publish(self):
        job = self.request()
        PlatformStaffProfile.objects.filter(user=self.admin).update(role="platform_finance")
        process_recovery(job.pk); job.refresh_from_db()
        self.assertEqual(job.error_code, "permission_revoked")
        self.assertFalse(Organization.objects.filter(recovery_isolated=True).exists())
        PlatformStaffProfile.objects.filter(user=self.admin).update(role="platform_admin")
        another = OrganizationRecovery.objects.create(organization=self.org, source=job.source, requested_by=self.admin, request_key=uuid.uuid4(), status="running", lease_until=timezone.now() - timedelta(seconds=1))
        maintain_recoveries(); another.refresh_from_db()
        self.assertEqual(another.status, "failed"); self.assertEqual(another.error_code, "interrupted")
    def test_deleted_records_internal_actors_and_m2m_are_restored_and_removed_by_rollback(self):
        species = Species.objects.create(name="Recovery species", code="recovery-species")
        parent = AnimalBatch.objects.create(farm=self.farm, species=species, batch_code="P", quantity=3, entry_date=timezone.localdate())
        child = AnimalBatch.objects.create(farm=self.farm, species=species, batch_code="C", quantity=1, entry_date=timezone.localdate())
        child.source_batches.add(parent)
        lost = Farm.objects.create(organization=self.org, name="Lost farm")
        task = Task.objects.create(organization=self.org, farm=lost, title="Recovered task", created_by=self.admin)
        source = self.source()
        task_id, lost_id = task.pk, lost.pk
        task.delete(); lost.delete(); child.source_batches.clear()
        job = self.rehearse(source)
        clone_batches = AnimalBatch.objects.filter(farm__organization=job.isolated_organization)
        self.assertEqual(clone_batches.get(batch_code="C").source_batches.get().batch_code, "P")
        self.confirm(job); self.assertEqual(job.status, "applied", job.error_code)
        recovered = Task.objects.get(pk=task_id)
        self.assertEqual(recovered.farm_id, lost_id)
        self.assertNotEqual(recovered.created_by_id, self.admin.pk)
        actor_id = recovered.created_by_id
        self.assertFalse(recovered.created_by.is_active)
        self.assertEqual(list(child.source_batches.values_list("pk", flat=True)), [parent.pk])
        self.confirm(job, "rollback"); self.assertEqual(job.status, "rolled_back", job.error_code)
        self.assertFalse(Farm.objects.filter(pk=lost_id).exists())
        self.assertFalse(Task.objects.filter(pk=task_id).exists())
        self.assertFalse(User.objects.filter(pk=actor_id).exists())
        self.assertFalse(child.source_batches.exists())

    def test_file_recovery_and_rollback_restore_original_bytes(self):
        self.org.logo.save("snapshot.png", ContentFile(b"SNAPSHOT-BYTES"), save=True)
        source = self.source()
        self.org.logo.save("current.png", ContentFile(b"BEFORE-BYTES"), save=True)
        before_name = self.org.logo.name
        job = self.rehearse(source)
        self.confirm(job); self.assertEqual(job.status, "applied", job.error_code)
        self.org.refresh_from_db()
        imported_name = self.org.logo.name
        with self.org.logo.open("rb") as handle:
            self.assertEqual(handle.read(), b"SNAPSHOT-BYTES")
        response = self.client.get(self.rurl(job, "download"), {"kind": "before"})
        self.assertEqual(response.status_code, 200); response.close()
        self.assertEqual(response["Cache-Control"], "private, no-store")
        with self.captureOnCommitCallbacks(execute=True):
            self.confirm(job, "rollback")
        self.assertEqual(job.status, "rolled_back", job.error_code)
        self.org.refresh_from_db(); self.assertEqual(self.org.logo.name, before_name)
        with self.org.logo.open("rb") as handle:
            self.assertEqual(handle.read(), b"BEFORE-BYTES")
        self.assertFalse(self.org.logo.storage.exists(imported_name))

    def test_schedules_billing_and_isolated_authentication_are_disabled(self):
        from datetime import time
        from django.db import IntegrityError
        from rest_framework.exceptions import AuthenticationFailed
        from rest_framework_simplejwt.tokens import AccessToken
        from common.authentication import ActiveOrganizationJWTAuthentication
        from apps.billing.models import Subscription
        from apps.reports.models import ReportConfig, ReportSchedule
        from apps.platform_admin.recovery.importer import query
        config = ReportConfig.objects.create(organization=self.org, name="Config", report_type="stock", created_by=self.customer)
        schedule = ReportSchedule.objects.create(organization=self.org, report_config=config, name="Schedule", frequency="daily", schedule_time=time(12), is_active=True, send_email=True)
        source = self.source()
        billing_before = list(Subscription.objects.filter(organization=self.org).values())
        job = self.rehearse(source)
        clone = job.isolated_organization
        self.assertFalse(Subscription.objects.filter(organization=clone).exists())
        clone_schedule = ReportSchedule.objects.get(organization=clone)
        self.assertFalse(clone_schedule.is_active); self.assertFalse(clone_schedule.send_email)
        clone_user = User.objects.get(organization=clone)
        query(User).filter(pk=clone_user.pk).update(is_active=True)
        clone_user.refresh_from_db()
        token = AccessToken.for_user(clone_user)
        with self.assertRaises(AuthenticationFailed):
            ActiveOrganizationJWTAuthentication().get_user(token)
        with self.assertRaises(IntegrityError), transaction.atomic():
            query(Organization).filter(pk=clone.pk).update(status="active", is_active=True)
        activate = reverse("platform-organization-activate", args=[clone.pk])
        self.assertEqual(self.client.post(activate, {"reason": "not allowed"}, format="json").status_code, 400)
        self.confirm(job); self.assertEqual(job.status, "applied", job.error_code)
        schedule.refresh_from_db(); self.assertFalse(schedule.is_active); self.assertFalse(schedule.send_email)
        self.assertEqual(list(Subscription.objects.filter(organization=self.org).values()), billing_before)

    def test_application_audit_failure_rolls_back_all_domain_changes(self):
        from apps.platform_admin.recovery.service import audit
        source = self.source()
        self.farm.name = "KEEP-ON-FAILURE"; self.farm.save()
        job = self.rehearse(source)
        def record(value, event):
            if event == "applied":
                raise RuntimeError("INTERNAL-SECRET")
            return audit(value, event)
        with patch("apps.platform_admin.recovery.service.audit", side_effect=record):
            self.confirm(job)
        self.assertEqual(job.status, "ready"); self.assertEqual(job.error_code, "failed")
        self.farm.refresh_from_db(); self.assertEqual(self.farm.name, "KEEP-ON-FAILURE")
        self.assertNotIn("INTERNAL-SECRET", str(self.client.get(self.rurl(job, "detail")).data))

    def test_changed_catalog_and_conflicting_identity_block_rehearsal(self):
        species = Species.objects.create(name="Shared original", code="shared-original")
        AnimalBatch.objects.create(farm=self.farm, species=species, batch_code="S", quantity=1, entry_date=timezone.localdate())
        source = self.source()
        species.name = "Changed global"; species.save()
        job = self.request(source); process_recovery(job.pk); job.refresh_from_db()
        self.assertEqual(job.error_code, "catalog_conflict")
        self.assertFalse(Organization.objects.filter(recovery_isolated=True).exists())
        species.name = "Shared original"; species.save()
        from apps.platform_admin.recovery.importer import query
        query(Farm).filter(pk=self.farm.pk).update(organization=self.other)
        job = self.request(source); process_recovery(job.pk); job.refresh_from_db()
        self.assertEqual(job.error_code, "isolation")
        self.assertFalse(Organization.objects.filter(recovery_isolated=True).exists())
    def test_valid_checksums_do_not_allow_cross_tenant_rows_or_path_traversal(self):
        import hashlib
        import zipfile
        from apps.platform_admin.exports.capture import dumps, sha256_file
        source = self.source()
        with zipfile.ZipFile(ExportStorage().path(source.archive_name)) as archive:
            contents = {name: archive.read(name) for name in archive.namelist()}
        manifest = json.loads(contents["manifest.json"])
        row = json.loads(contents["data/farms.farm.jsonl"].decode().splitlines()[0])
        row["organization"] = str(self.other.pk)
        contents["data/farms.farm.jsonl"] = (dumps(row) + "\n").encode()
        for entry in manifest["entries"]:
            entry["sha256"] = hashlib.sha256(contents[entry["path"]]).hexdigest()
            entry["size"] = len(contents[entry["path"]])
        contents["manifest.json"] = dumps(manifest).encode()
        path = Path(self.directory.name) / "forged.zip"
        with zipfile.ZipFile(path, "w") as archive:
            for name, content in contents.items():
                archive.writestr(name, content)
        with self.assertRaises(RecoveryFailure) as failure:
            Package(path, sha256_file(path), self.org.pk)
        self.assertEqual(failure.exception.code, "isolation")
        with zipfile.ZipFile(path, "a") as archive:
            archive.writestr("../escape.txt", b"escape")
        with self.assertRaises(RecoveryFailure):
            Package(path, sha256_file(path), self.org.pk)
        self.assertFalse((Path(self.directory.name).parent / "escape.txt").exists())

    def test_expiry_waits_for_requested_rehearsal_then_private_source_survives(self):
        from apps.platform_admin.exports.service import maintain_exports
        source = self.source()
        job = self.request(source)
        path = Path(ExportStorage().path(source.archive_name))
        OrganizationExport.objects.filter(pk=source.pk).update(expires_at=timezone.now() - timedelta(seconds=1))
        maintain_exports(); self.assertTrue(path.exists())
        process_recovery(job.pk); job.refresh_from_db()
        self.assertEqual(job.status, "ready", job.error_code)
        maintain_exports(); self.assertFalse(path.exists())
        response = self.client.get(self.rurl(job, "download"))
        self.assertEqual(response.status_code, 200); response.close()
        self.confirm(job); self.assertEqual(job.status, "applied", job.error_code)
    def test_failed_rollback_keeps_applied_data_and_audit_history(self):
        from apps.platform_admin.recovery.service import audit
        source = self.source()
        self.farm.name = "BEFORE-APPLY"; self.farm.save()
        job = self.rehearse(source)
        self.confirm(job); self.assertEqual(job.status, "applied", job.error_code)
        def record(value, event):
            if event == "rolled_back":
                raise RuntimeError("rollback audit failure")
            return audit(value, event)
        with patch("apps.platform_admin.recovery.service.audit", side_effect=record):
            self.confirm(job, "rollback")
        self.assertEqual(job.status, "applied"); self.assertEqual(job.error_code, "failed")
        self.farm.refresh_from_db(); self.assertEqual(self.farm.name, "FAZENDA-ALFA")
        self.assertTrue(PlatformAuditLog.objects.filter(action="organization.recovery_failed", object_id=str(job.pk)).exists())
        self.confirm(job, "rollback"); self.assertEqual(job.status, "rolled_back", job.error_code)

    def test_revocation_at_publication_discards_entire_rehearsal(self):
        job = self.request()
        with patch("apps.platform_admin.recovery.service.fresh_permission", side_effect=[True, True, False]):
            process_recovery(job.pk)
        job.refresh_from_db()
        self.assertEqual(job.status, "failed"); self.assertEqual(job.error_code, "permission_revoked")
        self.assertFalse(Organization.objects.filter(recovery_isolated=True).exists())

    def test_orphan_sweeper_removes_abandoned_files_and_preserves_live_files(self):
        self.org.logo.save("snapshot.png", ContentFile(b"LIVE-LOGO"), save=True)
        job = self.rehearse()
        self.confirm(job); self.assertEqual(job.status, "applied", job.error_code)
        self.org.refresh_from_db()
        storage = self.org.logo.storage
        orphan = storage.save(f"recovered/{job.pk}/orphan.bin", ContentFile(b"ABANDONED"))
        maintain_recoveries()
        self.assertFalse(storage.exists(orphan))
        self.assertTrue(storage.exists(self.org.logo.name))
    def test_rollback_recovers_previous_upload_from_backup_if_old_file_was_collected(self):
        self.org.logo.save("snapshot.png", ContentFile(b"OLD-SNAPSHOT"), save=True)
        source = self.source()
        self.org.logo.save("before.png", ContentFile(b"COPY-BEFORE-APPLY"), save=True)
        before_path = self.org.logo.name
        job = self.rehearse(source)
        self.confirm(job); self.assertEqual(job.status, "applied", job.error_code)
        self.org.logo.storage.delete(before_path)
        self.confirm(job, "rollback"); self.assertEqual(job.status, "rolled_back", job.error_code)
        self.org.refresh_from_db()
        self.assertNotEqual(self.org.logo.name, before_path)
        with self.org.logo.open("rb") as handle:
            self.assertEqual(handle.read(), b"COPY-BEFORE-APPLY")
