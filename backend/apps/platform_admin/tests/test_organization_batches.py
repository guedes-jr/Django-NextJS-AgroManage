from datetime import timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core import mail
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.models import OrganizationAdministratorInvitation
from apps.billing.models import Plan, Invoice
from apps.organizations.models import Organization
from apps.platform_admin.models import OrganizationBatch, OrganizationBatchItem, OrganizationQuotaSnapshot, PlatformStaffProfile, PlatformAuditLog, OrganizationAdoption
from apps.platform_admin.organization_batches import process_batch, prepare_batch
from apps.platform_admin.tasks import refresh_organization_quota_snapshots, resume_organization_batches

User = get_user_model()


class OrganizationBatchTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(email="batch-admin@test.test")
        PlatformStaffProfile.objects.create(user=self.admin, role="platform_admin")
        self.org = Organization.objects.create(name="Organização Alfa", slug="batch-alfa")
        self.other = Organization.objects.create(name="Organização Beta", slug="batch-beta")
        self.client.force_authenticate(self.admin)
        self.request = SimpleNamespace(user=self.admin, META={})
        self.delivery = patch("apps.platform_admin.tasks.process_organization_batch.delay")
        self.dispatch = self.delivery.start()
        self.addCleanup(self.delivery.stop)

    def prepare(self, action="suspend", ids=None, **kwargs):
        return prepare_batch(request=self.request, action=action, reason="Revisão de contrato", ids=ids or [self.org.pk], **kwargs)

    def endpoint(self, batch, suffix="detail"):
        return reverse(f"platform-organization-batch-{suffix}", args=[batch.pk])

    def confirm(self, batch):
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(self.endpoint(batch, "confirm"), {"expected_total": batch.total}, format="json")
        self.assertEqual(response.status_code, 202, response.data)

    def process(self, batch):
        with self.captureOnCommitCallbacks(execute=True):
            process_batch(batch.pk)
        process_batch(batch.pk)
        batch.refresh_from_db()

    def list_ids(self, **filters):
        response = self.client.get(reverse("platform-organization-list"), filters)
        self.assertEqual(response.status_code, 200, response.data)
        return {row["id"] for row in response.data["results"]}

    def invite(self):
        user = User.objects.create_user(email="invited@batch.test", password=None, organization=self.org, role="admin", is_active=False, organization_responsible=True)
        return OrganizationAdministratorInvitation.objects.create(organization=self.org, user=user, email=user.email, token_digest="f" * 64, expires_at=timezone.now() + timedelta(days=1))

    def test_review_does_not_mutate_and_freezes_all_matching_ids(self):
        response = self.client.post(reverse("platform-organization-batch-list"), {"action": "suspend", "reason": "Pendências", "all_matching": True, "filters": {"search": "Alfa"}}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        batch = OrganizationBatch.objects.get(pk=response.data["id"])
        self.assertEqual(batch.total, 1)
        Organization.objects.create(name="Organização Alfa Nova", slug="batch-new")
        self.org.name = "Nome alterado"
        self.org.save()
        self.assertEqual(batch.items.get().snapshot["name"], "Organização Alfa")
        self.confirm(batch)
        self.process(batch)
        self.org.refresh_from_db(); self.other.refresh_from_db()
        self.assertEqual(self.org.status, "suspended")
        self.assertEqual(self.other.status, "active")
        self.assertEqual(Organization.objects.get(slug="batch-new").status, "active")

    def test_duplicate_confirmation_and_processing_do_not_repeat_successes(self):
        batch = self.prepare()
        self.confirm(batch); self.confirm(batch)
        self.assertEqual(self.dispatch.call_count, 1)
        self.process(batch); self.process(batch)
        self.assertEqual(batch.items.get().status, "succeeded")
        self.assertEqual(PlatformAuditLog.objects.filter(action="organization.suspended", organization=self.org).count(), 1)
        self.assertEqual(PlatformAuditLog.objects.filter(action="organization.batch_item", organization=self.org).count(), 1)

    def test_expected_quantity_expiration_reason_and_selection_validation(self):
        batch = self.prepare()
        self.assertEqual(self.client.post(self.endpoint(batch, "confirm"), {"expected_total": 2}).status_code, 400)
        OrganizationBatch.objects.filter(pk=batch.pk).update(expires_at=timezone.now() - timedelta(seconds=1))
        self.assertEqual(self.client.post(self.endpoint(batch, "confirm"), {"expected_total": 1}).status_code, 400)
        for payload in [
            {"action": "suspend", "ids": [str(self.org.pk)]},
            {"action": "archive", "all_matching": True},
            {"action": "export", "all_matching": True, "ids": [str(self.org.pk)]},
            {"action": "export", "all_matching": True, "filters": {"unexpected": True}},
        ]:
            self.assertEqual(self.client.post(reverse("platform-organization-batch-list"), payload, format="json").status_code, 400)

    def test_permission_is_rechecked_for_every_item_and_batches_are_private(self):
        batch = self.prepare()
        self.confirm(batch)
        PlatformStaffProfile.objects.filter(user=self.admin).update(role="platform_support")
        self.process(batch)
        self.assertEqual(batch.items.get().status, "failed")
        self.org.refresh_from_db(); self.assertEqual(self.org.status, "active")
        stranger = User.objects.create_user(email="other-admin@batch.test")
        PlatformStaffProfile.objects.create(user=stranger, role="platform_admin")
        self.client.force_authenticate(stranger)
        self.assertEqual(self.client.get(self.endpoint(batch)).status_code, 404)
        self.assertEqual(self.client.get(self.endpoint(batch, "items")).status_code, 404)
        self.assertEqual(self.client.post(self.endpoint(batch, "confirm"), {"expected_total": 1}).status_code, 404)

    def test_lifecycle_eligibility_rechecked_without_reactivating_archived_tenants(self):
        batch = self.prepare(ids=[self.org.pk, self.other.pk])
        self.confirm(batch)
        self.other.status = "archived"; self.other.save()
        self.process(batch)
        self.assertEqual(batch.items.get(organization_id=self.other.pk).status, "skipped")
        retry = self.prepare("activate", ids=[self.org.pk, self.other.pk])
        self.confirm(retry); self.process(retry)
        self.other.refresh_from_db(); self.org.refresh_from_db()
        self.assertEqual(self.org.status, "active")
        self.assertEqual(self.other.status, "archived")

    def test_failure_rolls_back_one_organization_and_retry_only_freezes_failures(self):
        batch = self.prepare(ids=[self.org.pk, self.other.pk])
        self.confirm(batch)
        from apps.organizations.services import transition_organization
        def fail_one(**kwargs):
            result = transition_organization(**kwargs)
            if kwargs["organization_id"] == self.org.pk:
                raise RuntimeError("provider-secret must never appear")
            return result
        with patch("apps.organizations.services.transition_organization", side_effect=fail_one):
            self.process(batch)
        self.org.refresh_from_db(); self.other.refresh_from_db()
        self.assertEqual(self.org.status, "active"); self.assertEqual(self.other.status, "suspended")
        self.assertNotIn("secret", batch.items.get(organization_id=self.org.pk).message)
        response = self.client.post(self.endpoint(batch, "retry"), {}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        child = OrganizationBatch.objects.get(pk=response.data["id"])
        self.assertEqual(list(child.items.values_list("organization_id", flat=True)), [self.org.pk])
        repeated = self.client.post(self.endpoint(batch, "retry"), {})
        self.assertEqual(repeated.data["id"], str(child.pk))
        self.confirm(child); self.process(child)
        self.assertEqual(child.items.get().status, "succeeded")
        self.assertEqual(PlatformAuditLog.objects.filter(action="organization.suspended", organization=self.other).count(), 1)

    def test_export_csv_uses_review_snapshot_escapes_formulas_and_audits_download(self):
        self.org.name = "=CMD()"; self.org.save()
        batch = self.prepare("export")
        self.assertEqual(self.client.get(self.endpoint(batch, "download")).status_code, 400)
        self.org.name = "Nome novo"; self.org.save()
        self.confirm(batch); self.process(batch)
        response = self.client.get(self.endpoint(batch, "download"))
        self.assertEqual(response.status_code, 200)
        self.assertIn("'=CMD()", response.content.decode())
        self.assertNotIn("Nome novo", response.content.decode())
        self.assertEqual(response["Cache-Control"], "no-store")
        self.assertTrue(PlatformAuditLog.objects.filter(action="organization.batch_downloaded").exists())

    def test_read_only_staff_can_export_but_not_change_state_or_resend(self):
        PlatformStaffProfile.objects.filter(user=self.admin).update(role="platform_finance")
        self.admin.refresh_from_db()
        self.client.force_authenticate(self.admin)
        for action in ["suspend", "activate", "resend_invitation"]:
            response = self.client.post(reverse("platform-organization-batch-list"), {"action": action, "reason": "Motivo", "ids": [str(self.org.pk)]}, format="json")
            self.assertEqual(response.status_code, 403)
        self.assertEqual(self.client.post(reverse("platform-organization-batch-list"), {"action": "export", "ids": [str(self.org.pk)]}, format="json").status_code, 201)
        customer = User.objects.create_user(email="tenant@batch.test", organization=self.org, role="admin")
        self.client.force_authenticate(customer)
        self.assertEqual(self.client.get(reverse("platform-organization-batch-list")).status_code, 403)

    def test_invitation_success_is_not_resent_by_repeated_worker(self):
        self.invite()
        batch = self.prepare("resend_invitation")
        self.confirm(batch); self.process(batch); self.process(batch)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(batch.items.get().status, "succeeded")

    def test_email_failure_recorded_and_explicit_retry_sends_only_failed_invitation(self):
        self.invite()
        batch = self.prepare("resend_invitation")
        self.confirm(batch)
        with patch("apps.accounts.invitations.send_mail", side_effect=RuntimeError("SMTP-secret")):
            self.process(batch)
        self.assertEqual(batch.items.get().status, "failed")
        self.assertNotIn("SMTP", batch.items.get().message)
        response = self.client.post(self.endpoint(batch, "retry"), {})
        child = OrganizationBatch.objects.get(pk=response.data["id"])
        self.confirm(child); self.process(child)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(child.items.get().status, "succeeded")

    def test_unconfirmed_email_does_not_automatically_send_again(self):
        self.invite()
        batch = self.prepare("resend_invitation")
        self.confirm(batch)
        # Simulate loss of the post-commit callback in a crashed worker.
        with self.captureOnCommitCallbacks(execute=False):
            process_batch(batch.pk)
        item = batch.items.get()
        self.assertEqual(item.status, "delivery_pending")
        OrganizationBatchItem.objects.filter(pk=item.pk).update(updated_at=timezone.now() - timedelta(minutes=3))
        process_batch(batch.pk)
        item.refresh_from_db()
        self.assertEqual(item.status, "failed")
        self.assertEqual(len(mail.outbox), 0)

    def test_directory_filters_have_the_same_selection_as_frozen_review(self):
        admin = User.objects.create_user(email="tenant-admin@batch.test", organization=self.org, role="admin", organization_responsible=True)
        self.assertEqual(self.list_ids(without_admin=True), {str(self.other.pk)})
        self.assertEqual(self.list_ids(without_responsible=False), {str(self.org.pk)})
        PlatformStaffProfile.objects.create(user=admin, role="platform_support")
        self.assertIn(str(self.org.pk), self.list_ids(without_admin=True))
        OrganizationAdoption.objects.create(organization=self.org, status="inactive_30", calculated_at=timezone.now(), metrics={})
        OrganizationQuotaSnapshot.objects.create(organization=self.org, near_limit=True, calculated_at=timezone.now())
        for filters in [{"unused_days": "7"}, {"near_limit": "true"}, {"status": "active", "search": "Alfa"}, {"created_from": str(timezone.localdate()), "created_to": str(timezone.localdate())}]:
            listed = self.list_ids(**filters)
            review = prepare_batch(request=self.request, action="export", all_matching=True, filters=filters)
            self.assertEqual({str(value) for value in review.items.values_list("organization_id", flat=True)}, listed)

    def test_commercial_filters_handle_plan_trial_and_paid_or_void_invoices(self):
        plan = Plan.objects.create(code="batch-custom", name="Personalizado")
        sub = self.org.subscription
        sub.plan = plan; sub.status = "trialing"; sub.save()
        self.assertEqual(self.list_ids(plan=plan.code, trial="true"), {str(self.org.pk)})
        invoice = Invoice.objects.create(organization=self.org, subscription=sub, number="BATCH1", status="open", total=Decimal("20"), amount_paid=0, due_date=timezone.localdate() - timedelta(days=1))
        self.assertEqual(self.list_ids(financial_pending="true"), {str(self.org.pk)})
        invoice.status = "void"; invoice.save()
        self.assertEqual(self.list_ids(financial_pending="true"), set())
        invoice.status = "open"; invoice.amount_paid = invoice.total; invoice.save()
        self.assertEqual(self.list_ids(financial_pending="true"), set())

    def test_pagination_selection_and_result_filters(self):
        batch = self.prepare("export", ids=[self.org.pk, self.other.pk])
        response = self.client.get(self.endpoint(batch, "items"), {"page_size": 1})
        self.assertEqual(response.data["count"], 2)
        self.assertIsNotNone(response.data["next"])
        self.confirm(batch); self.process(batch)
        self.assertEqual(self.client.get(self.endpoint(batch, "items"), {"status": "failed"}).data["count"], 0)
        self.assertEqual(self.client.get(self.endpoint(batch, "items"), {"status": "bad"}).status_code, 400)

    def test_durable_queue_resumes_and_quota_snapshot_can_be_filtered(self):
        batch = self.prepare("export")
        self.confirm(batch)
        self.dispatch.reset_mock()
        resume_organization_batches()
        self.dispatch.assert_called_once_with(str(batch.pk))
        refresh_organization_quota_snapshots()
        self.assertEqual(OrganizationQuotaSnapshot.objects.count(), 2)
        self.assertEqual(self.list_ids(near_limit="false"), {str(self.org.pk), str(self.other.pk)})

    def test_failed_broker_publication_preserves_durable_queue_for_recovery(self):
        batch = self.prepare("export")
        with patch("apps.platform_admin.tasks.process_organization_batch.delay", side_effect=RuntimeError("Broker indisponível")):
            self.confirm(batch)
        batch.refresh_from_db()
        self.assertEqual(batch.status, "queued")
        self.process(batch)
        self.assertEqual(batch.status, "completed")

    def test_review_limit_and_unknown_or_deleted_selection_are_rejected(self):
        import uuid
        with patch("apps.platform_admin.organization_batches.MAX_ITEMS", 1):
            response = self.client.post(reverse("platform-organization-batch-list"), {"action": "export", "all_matching": True}, format="json")
        self.assertEqual(response.status_code, 400)
        response = self.client.post(reverse("platform-organization-batch-list"), {"action": "export", "ids": [str(uuid.uuid4())]}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertFalse(OrganizationBatch.objects.exists())
