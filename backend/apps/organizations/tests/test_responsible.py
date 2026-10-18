from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core import mail
from django.db import IntegrityError, transaction
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient, APITestCase

from apps.accounts.invitations import schedule_invitation
from apps.accounts.models import OrganizationAdministratorInvitation
from apps.accounts.tokens import issue_tokens_for_user
from apps.organizations.models import Organization
from apps.platform_admin.models import PlatformAuditLog, PlatformStaffProfile

User = get_user_model()


class ResponsibleTransferTests(APITestCase):
    def setUp(self):
        self.organization = Organization.objects.create(name="Transferência", slug="transfer")
        self.other = Organization.objects.create(name="Outra", slug="transfer-other")
        self.owner = User.objects.create_user(email="owner@transfer.test", organization=self.organization, role="admin", organization_responsible=True)
        self.target = User.objects.create_user(email="target@transfer.test", full_name="Novo responsável", organization=self.organization, role="manager")
        self.admin = User.objects.create_user(email="admin@transfer.test")
        PlatformStaffProfile.objects.create(user=self.admin, role=PlatformStaffProfile.Role.ADMIN)
        self.client.force_authenticate(self.admin)
        self.url = reverse("platform-organization-transfer-responsible", args=[self.organization.pk])
        self.candidates_url = reverse("platform-organization-responsible-candidates", args=[self.organization.pk])

    def transfer(self, target=None, expected="current"):
        return self.client.post(self.url, {"user_id": str((target or self.target).pk), "expected_responsible_id": str(self.owner.pk) if expected == "current" else expected}, format="json")

    def test_transfer_promotes_target_preserves_previous_admin_and_records_audit(self):
        response = self.transfer()
        self.assertEqual(response.status_code, 200, response.data)
        self.target.refresh_from_db()
        self.owner.refresh_from_db()
        self.assertTrue(self.target.organization_responsible)
        self.assertEqual(self.target.role, "admin")
        self.assertFalse(self.owner.organization_responsible)
        self.assertTrue(self.owner.is_active)
        self.assertEqual(self.owner.role, "admin")
        self.assertEqual(User.objects.filter(organization=self.organization, organization_responsible=True).count(), 1)
        self.assertEqual(response.data["responsible"]["id"], str(self.target.pk))
        audit = PlatformAuditLog.objects.get(action="organization.responsible_transferred")
        self.assertEqual(audit.actor, self.admin)
        self.assertEqual(audit.extra_data["previous_responsible_id"], str(self.owner.pk))
        self.assertEqual(audit.extra_data["new_responsible_id"], str(self.target.pk))

    def test_no_changes_to_other_organization_or_subscription(self):
        other_owner = User.objects.create_user(email="other-owner@transfer.test", organization=self.other, role="admin", organization_responsible=True)
        subscription_status = self.organization.subscription.status
        self.transfer()
        other_owner.refresh_from_db()
        self.organization.refresh_from_db()
        self.assertTrue(other_owner.organization_responsible)
        self.assertEqual(self.organization.subscription.status, subscription_status)
        self.assertEqual(self.organization.status, "active")

    def test_rejects_inactive_external_internal_and_current_users(self):
        inactive = User.objects.create_user(email="inactive@transfer.test", organization=self.organization, is_active=False)
        external = User.objects.create_user(email="external@transfer.test", organization=self.other)
        staff = User.objects.create_user(email="staff@transfer.test", organization=self.organization)
        PlatformStaffProfile.objects.create(user=staff, role=PlatformStaffProfile.Role.SUPPORT)
        for candidate in (inactive, external, staff, self.owner):
            self.assertEqual(self.transfer(candidate).status_code, 400)
        self.owner.refresh_from_db()
        self.assertTrue(self.owner.organization_responsible)
        self.assertFalse(PlatformAuditLog.objects.filter(action="organization.responsible_transferred").exists())

    def test_requires_current_snapshot_and_rejects_stale_transfer(self):
        self.assertEqual(self.client.post(self.url, {"user_id": str(self.target.pk)}, format="json").status_code, 400)
        self.assertEqual(self.transfer(expected=None).status_code, 400)
        self.assertEqual(self.transfer().status_code, 200)
        third = User.objects.create_user(email="third@transfer.test", organization=self.organization)
        self.assertEqual(self.transfer(third).status_code, 400)
        self.assertEqual(User.objects.get(organization=self.organization, organization_responsible=True).pk, self.target.pk)

    def test_defines_responsible_when_missing(self):
        self.owner.organization_responsible = False
        self.owner.save(update_fields=["organization_responsible"])
        self.assertEqual(self.transfer(expected=None).status_code, 200)
        audit = PlatformAuditLog.objects.get(action="organization.responsible_transferred")
        self.assertIsNone(audit.extra_data["previous_responsible_id"])

    def test_only_platform_owners_and_admins_can_transfer_or_list_candidates(self):
        support = User.objects.create_user(email="support@transfer.test")
        PlatformStaffProfile.objects.create(user=support, role=PlatformStaffProfile.Role.SUPPORT)
        for actor in (self.owner, self.target, support):
            self.client.force_authenticate(actor)
            self.assertEqual(self.transfer().status_code, 403)
            self.assertEqual(self.client.get(self.candidates_url).status_code, 403)

    def test_candidates_are_scoped_searchable_and_paginated(self):
        User.objects.create_user(email="foreign@transfer.test", organization=self.other)
        User.objects.create_user(email="hidden@transfer.test", organization=self.organization, is_active=False)
        staff = User.objects.create_user(email="staff-candidate@transfer.test", organization=self.organization)
        PlatformStaffProfile.objects.create(user=staff, role=PlatformStaffProfile.Role.SUPPORT)
        response = self.client.get(self.candidates_url, {"search": "Novo responsável"})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["id"], str(self.target.pk))
        response = self.client.get(self.candidates_url)
        self.assertEqual(response.data["count"], 1)
        self.assertIn("next", response.data)

    def test_pending_invitation_is_revoked_without_activating_previous_owner(self):
        self.owner.is_active = False
        self.owner.save(update_fields=["is_active"])
        invitation = OrganizationAdministratorInvitation(organization=self.organization, user=self.owner, email=self.owner.email)
        with self.captureOnCommitCallbacks(execute=True):
            with transaction.atomic():
                schedule_invitation(invitation)
        import re
        token = re.search(r"#token=([\w-]+)", mail.outbox[-1].body).group(1)
        self.assertEqual(self.transfer().status_code, 200)
        invitation.refresh_from_db()
        self.owner.refresh_from_db()
        self.assertIsNotNone(invitation.revoked_at)
        self.assertEqual(invitation.state, "revoked")
        self.assertFalse(self.owner.is_active)
        self.assertEqual(self.owner.role, "admin")
        self.assertEqual(APIClient().post(reverse("organization-invitation-inspect"), {"token": token}, format="json").status_code, 400)
        self.assertEqual(self.client.post(reverse("platform-organization-resend-administrator-invitation", args=[self.organization.pk])).status_code, 400)

    def test_promotion_revokes_target_sessions_and_clears_operator_restrictions(self):
        self.target.role = "operator"
        self.target.can_operate_crops = True
        self.target.operator_read_only = True
        self.target.save()
        access = str(issue_tokens_for_user(self.target).access_token)
        self.assertEqual(self.transfer().status_code, 200)
        self.target.refresh_from_db()
        self.assertFalse(self.target.can_operate_crops)
        self.assertFalse(self.target.operator_read_only)
        self.assertEqual(self.target.session_version, 1)
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        self.assertEqual(client.get(reverse("auth_me")).status_code, 401)

    def test_audit_failure_rolls_back_both_flags_and_promotion(self):
        with patch("apps.platform_admin.services.record_platform_action", side_effect=RuntimeError("audit unavailable")):
            response = self.transfer()
        self.assertEqual(response.status_code, 500)
        self.owner.refresh_from_db()
        self.target.refresh_from_db()
        self.assertTrue(self.owner.organization_responsible)
        self.assertFalse(self.target.organization_responsible)
        self.assertEqual(self.target.role, "manager")
        self.assertEqual(self.target.session_version, 0)

    def test_new_responsible_cannot_be_removed_through_tenant_member_endpoint(self):
        self.transfer()
        self.target.refresh_from_db()
        self.client.force_authenticate(self.owner)
        detail = reverse("auth_member_detail", args=[self.target.pk])
        self.assertEqual(self.client.patch(detail, {"role": "operator"}, format="json").status_code, 400)
        self.assertEqual(self.client.delete(detail).status_code, 400)


class ResponsibleConstraintTests(TestCase):
    def test_database_rejects_two_responsibles_even_outside_service(self):
        organization = Organization.objects.create(name="Unicidade", slug="responsible-unique")
        User.objects.create_user(email="first@unique.test", organization=organization, role="admin", organization_responsible=True)
        with self.assertRaises(IntegrityError), transaction.atomic():
            User.objects.create_user(email="second@unique.test", organization=organization, role="admin", organization_responsible=True)
