from datetime import timedelta
from importlib import import_module
from types import SimpleNamespace
from unittest.mock import patch

from django.apps import apps
from django.contrib.auth import get_user_model
from django.db import IntegrityError, connection, transaction
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient, APITestCase

from apps.accounts.tokens import issue_tokens_for_user
from apps.organizations.models import Organization
from apps.platform_admin.models import PlatformAuditLog, PlatformStaffProfile, SupportAccessGrant

User = get_user_model()


class OrganizationStatusAPITests(APITestCase):
    def setUp(self):
        self.organization = Organization.objects.create(name="Estados", slug="estados")
        self.other = Organization.objects.create(name="Outra", slug="outra-status")
        self.member = User.objects.create_user(email="member@status.test", password="password123", organization=self.organization, role="admin")
        self.admin = User.objects.create_user(email="admin@status.test", password="password123")
        PlatformStaffProfile.objects.create(user=self.admin, role=PlatformStaffProfile.Role.ADMIN)
        self.client.force_authenticate(self.admin)

    def transition(self, action, data=None):
        return self.client.post(reverse(f"platform-organization-{action}", args=[self.organization.pk]), data or {}, format="json")

    def test_transitions_keep_distinct_states_dates_reasons_and_subscription(self):
        subscription = self.organization.subscription
        original_subscription_status = subscription.status
        before = self.organization.status_changed_at
        for action, expected, reason in (("suspend", "suspended", "Pausa solicitada"), ("archive", "archived", "Cliente encerrou operação"), ("activate", "active", "Retorno")):
            response = self.transition(action, {"reason": reason})
            self.assertEqual(response.status_code, 200, response.data)
            self.organization.refresh_from_db()
            self.assertEqual(self.organization.status, expected)
            self.assertEqual(self.organization.is_active, expected == "active")
            self.assertEqual(self.organization.status_reason, reason)
            self.assertGreater(self.organization.status_changed_at, before)
            before = self.organization.status_changed_at
            audit = PlatformAuditLog.objects.filter(organization=self.organization).first()
            self.assertEqual(audit.extra_data["status"], expected)
            self.assertEqual(audit.extra_data["reason"], reason)
        subscription.refresh_from_db()
        self.assertEqual(subscription.status, original_subscription_status)
        detail = self.client.get(reverse("platform-organization-detail", args=[self.organization.pk]))
        self.assertEqual(detail.data["status_display"], "Ativa")
        self.assertEqual(detail.data["status_reason"], "Retorno")

    def test_invalid_transitions_and_reasons_do_not_change_state(self):
        self.assertEqual(self.transition("activate").status_code, 400)
        self.assertEqual(self.transition("suspend", {"reason": "x" * 1001}).status_code, 400)
        self.assertEqual(self.transition("archive").status_code, 200)
        version = User.objects.get(pk=self.member.pk).session_version
        self.assertEqual(self.transition("archive").status_code, 400)
        self.assertEqual(self.transition("suspend").status_code, 400)
        self.assertEqual(User.objects.get(pk=self.member.pk).session_version, version)
        self.organization.refresh_from_db()
        self.assertEqual(self.organization.status, "archived")

    def test_audit_failure_rolls_back_state_and_session_revocation(self):
        grant = SupportAccessGrant.objects.create(
            operator=self.admin, organization=self.organization, justification="",
            expires_at=timezone.now() + timedelta(minutes=30),
        )
        with patch("apps.platform_admin.services.record_platform_action", side_effect=RuntimeError("audit unavailable")):
            self.assertEqual(self.transition("suspend").status_code, 500)
        self.organization.refresh_from_db()
        self.member.refresh_from_db()
        grant.refresh_from_db()
        self.assertEqual(self.organization.status, "active")
        self.assertEqual(self.member.session_version, 0)
        self.assertIsNone(grant.revoked_at)

    def test_status_and_legacy_filters(self):
        self.transition("archive")
        url = reverse("platform-organization-list")
        for value, expected in (("active", [str(self.other.pk)]), ("suspended", []), ("archived", [str(self.organization.pk)])):
            response = self.client.get(url, {"status": value})
            self.assertEqual(response.status_code, 200)
            self.assertEqual([row["id"] for row in response.data["results"]], expected)
        response = self.client.get(url, {"is_active": "false"})
        self.assertEqual(response.data["results"][0]["status"], "archived")
        self.assertEqual(self.client.get(url, {"status": "invalid"}).status_code, 400)

    def test_old_access_refresh_and_support_tokens_stay_revoked_after_reactivation(self):
        refresh = issue_tokens_for_user(self.member)
        customer = APIClient()
        customer.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
        grant = SupportAccessGrant.objects.create(operator=self.admin, organization=self.organization, justification="", expires_at=timezone.now() + timedelta(minutes=30))
        from apps.platform_admin.views import PlatformSupportAccessViewSet
        support_token = PlatformSupportAccessViewSet._issue_access_token(self.admin, grant, timedelta(minutes=30))
        support = APIClient()
        support.credentials(HTTP_AUTHORIZATION=f"Bearer {support_token}")
        self.assertEqual(self.transition("suspend").status_code, 200)
        self.assertEqual(customer.get(reverse("auth_me")).status_code, 401)
        self.assertEqual(support.get(reverse("my-organization")).status_code, 401)
        self.assertEqual(self.transition("activate").status_code, 200)
        self.assertEqual(customer.get(reverse("auth_me")).status_code, 401)
        self.assertEqual(support.get(reverse("my-organization")).status_code, 401)
        response = APIClient().post(reverse("auth_token_refresh"), {"refresh": str(refresh)}, format="json")
        self.assertEqual(response.status_code, 401)
        login = APIClient().post(reverse("auth_login"), {"email": self.member.email, "password": "password123"}, format="json")
        self.assertEqual(login.status_code, 200)
        self.assertEqual(User.objects.get(pk=self.member.pk).session_version, 2)

    def test_archived_organization_blocks_login_with_correct_message(self):
        self.transition("archive")
        response = APIClient().post(reverse("auth_login"), {"email": self.member.email, "password": "password123"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("Organização arquivada", str(response.data))

    def test_support_and_tenant_admin_cannot_change_organization_states(self):
        support = User.objects.create_user(email="support@status.test", password="password123")
        PlatformStaffProfile.objects.create(user=support, role=PlatformStaffProfile.Role.SUPPORT)
        for user in (support, self.member):
            self.client.force_authenticate(user)
            for action in ("archive", "suspend", "activate"):
                self.assertEqual(self.transition(action).status_code, 403)
        self.organization.refresh_from_db()
        self.assertEqual(self.organization.status, "active")

    def test_cadastro_patch_cannot_bypass_state_actions(self):
        response = self.client.patch(reverse("platform-organization-detail", args=[self.organization.pk]), {"status": "archived", "is_active": False}, format="json")
        self.assertEqual(response.status_code, 200)
        self.organization.refresh_from_db()
        self.assertEqual(self.organization.status, "active")
        self.assertTrue(self.organization.is_active)
        self.assertFalse(PlatformAuditLog.objects.filter(action="organization.archived").exists())


class OrganizationStatusModelTests(TestCase):
    def test_legacy_saves_keep_status_in_sync(self):
        organization = Organization.objects.create(name="Legado", slug="legado", is_active=False)
        self.assertEqual(organization.status, "suspended")
        organization.is_active = True
        organization.save(update_fields=["is_active"])
        organization.refresh_from_db()
        self.assertEqual(organization.status, "active")
        organization.is_active = False
        organization.save()
        organization.refresh_from_db()
        self.assertEqual(organization.status, "suspended")
        organization.status = "archived"
        organization.save(update_fields=["status"])
        organization.refresh_from_db()
        self.assertFalse(organization.is_active)

    def test_database_rejects_inconsistent_or_unknown_state(self):
        organization = Organization.objects.create(name="Constraint", slug="constraint")
        for values in ({"status": "archived"}, {"is_active": False}, {"status": "unknown"}):
            with self.assertRaises(IntegrityError), transaction.atomic():
                Organization.objects.filter(pk=organization.pk).update(**values)

    def test_backfill_uses_latest_transition_and_marks_ambiguous_inactive_rows(self):
        migration = import_module("apps.organizations.migrations.0004_backfill_organization_status")
        archived = Organization.objects.create(name="Arquivada antiga", slug="old-archive", is_active=False)
        suspended = Organization.objects.create(name="Suspensa antiga", slug="old-suspend", is_active=False)
        unknown = Organization.objects.create(name="Sem evidência", slug="old-unknown", is_active=False)
        active = Organization.objects.create(name="Ativa antiga", slug="old-active")
        old = timezone.now() - timedelta(days=2)
        for org in (archived, suspended, active):
            evidence = PlatformAuditLog.objects.create(organization=org, action="organization.archived")
            PlatformAuditLog.objects.filter(pk=evidence.pk).update(created_at=old)
        PlatformAuditLog.objects.create(organization=suspended, action="organization.suspended")
        user = User.objects.create_user(email="migration@status.test", organization=archived)
        grant = SupportAccessGrant.objects.create(operator=user, organization=archived, justification="", expires_at=timezone.now() + timedelta(minutes=30))
        migration.backfill_status(apps, SimpleNamespace(connection=connection))
        for org, expected in ((archived, "archived"), (suspended, "suspended"), (unknown, "suspended"), (active, "active")):
            org.refresh_from_db()
            self.assertEqual(org.status, expected)
        audit = PlatformAuditLog.objects.get(organization=unknown, action="organization.status_migrated")
        self.assertTrue(audit.extra_data["inferred"])
        self.assertIsNone(audit.extra_data["evidence_id"])
        user.refresh_from_db()
        grant.refresh_from_db()
        self.assertEqual(user.session_version, 1)
        self.assertIsNotNone(grant.revoked_at)
