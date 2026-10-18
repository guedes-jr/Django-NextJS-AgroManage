import re
from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.cache import cache
from django.db import IntegrityError
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient, APITestCase

from apps.accounts.invitations import deliver_invitation, token_digest
from apps.accounts.models import OrganizationAdministratorInvitation
from apps.billing.models import Plan, Subscription
from apps.organizations.models import Organization
from apps.platform_admin.models import PlatformAuditLog, PlatformStaffProfile

User = get_user_model()
PASSWORD = "Garden-Harvest-Strong-843!"


@override_settings(FRONTEND_URL="https://app.example.test", EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class OrganizationInvitationTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.admin = User.objects.create_user(email="admin@platform.test", password=PASSWORD)
        PlatformStaffProfile.objects.create(user=self.admin, role=PlatformStaffProfile.Role.ADMIN)
        self.client.force_authenticate(self.admin)
        self.payload = {
            "name": "Cliente Convidado", "plan_id": str(Plan.objects.get(code="pro").pk),
            "billing_cycle": "yearly", "administrator": {"full_name": "Maria Produtora", "email": "Maria@Cliente.test"},
        }
        self.public = APIClient()

    def create_organization(self):
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(reverse("platform-organization-list"), self.payload, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        invitation = OrganizationAdministratorInvitation.objects.get(organization_id=response.data["id"])
        return response, invitation

    def invitation_token(self):
        return re.search(r"#token=([\w-]+)", mail.outbox[-1].body).group(1)

    def accept(self, token, password=PASSWORD, confirmation=None):
        return self.public.post(reverse("organization-invitation-accept"), {"token": token, "password": password, "password_confirmation": confirmation if confirmation is not None else password}, format="json")

    def resend(self, invitation):
        with self.captureOnCommitCallbacks(execute=True):
            return self.client.post(reverse("platform-organization-resend-administrator-invitation", args=[invitation.organization_id]), {}, format="json")

    def test_creation_provisions_admin_subscription_and_secret_only_in_email(self):
        response, invitation = self.create_organization()
        user = invitation.user
        self.assertEqual(user.email, "maria@cliente.test")
        self.assertEqual(user.organization_id, invitation.organization_id)
        self.assertEqual(user.role, "admin")
        self.assertTrue(user.organization_responsible)
        self.assertFalse(user.is_active)
        self.assertFalse(user.has_usable_password())
        self.assertEqual(invitation.organization.subscription.plan.code, "pro")
        self.assertEqual(invitation.organization.subscription.billing_cycle, "yearly")
        self.assertEqual(invitation.delivery_status, "sent")
        self.assertEqual(invitation.delivery_attempts, 1)
        token = self.invitation_token()
        self.assertEqual(invitation.token_digest, token_digest(token))
        self.assertNotIn(token, str(response.data))
        detail = self.client.get(reverse("platform-organization-detail", args=[invitation.organization_id]))
        self.assertEqual(detail.data["administrator_invitation"]["state"], "sent")
        self.assertNotIn("token_digest", str(detail.data))
        self.assertNotIn(token, str(list(PlatformAuditLog.objects.values())))
        self.assertIn("https://app.example.test/aceitar-convite#token=", mail.outbox[-1].body)
        self.assertEqual(mail.outbox[-1].to, ["maria@cliente.test"])

    def test_acceptance_activates_password_and_cannot_be_replayed(self):
        _, invitation = self.create_organization()
        token = self.invitation_token()
        preview = self.public.post(reverse("organization-invitation-inspect"), {"token": token}, format="json")
        self.assertEqual(preview.status_code, 200)
        self.assertEqual(preview.data["organization_name"], "Cliente Convidado")
        self.assertEqual(self.accept(token).status_code, 200)
        self.assertEqual(self.accept(token).status_code, 400)
        invitation.refresh_from_db()
        user = User.objects.get(pk=invitation.user_id)
        self.assertTrue(user.is_active)
        self.assertTrue(user.check_password(PASSWORD))
        self.assertIsNotNone(invitation.accepted_at)
        self.assertEqual(invitation.state, "accepted")
        login = self.public.post(reverse("auth_login"), {"email": user.email, "password": PASSWORD}, format="json")
        self.assertEqual(login.status_code, 200)
        self.assertEqual(User.objects.get(pk=user.pk).organization_id, invitation.organization_id)
        self.assertEqual(self.resend(invitation).status_code, 400)
        self.assertTrue(PlatformAuditLog.objects.filter(action="organization.invitation_accepted", actor=user).exists())

    def test_no_email_is_sent_until_transaction_commits(self):
        before = len(getattr(mail, "outbox", []))
        with self.captureOnCommitCallbacks(execute=False) as callbacks:
            response = self.client.post(reverse("platform-organization-list"), self.payload, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(len(callbacks), 1)
        self.assertEqual(len(getattr(mail, "outbox", [])), before)
        self.assertEqual(response.data["administrator_invitation"]["state"], "pending")

    def test_existing_email_is_rejected_without_moving_any_account(self):
        other = Organization.objects.create(name="Outro cliente", slug="other-invitation")
        for suffix, organization, staff in (("tenant", other, False), ("unbound", None, False), ("staff", None, True)):
            email = f"{suffix}@existing.test"
            user = User.objects.create_user(email=email, organization=organization)
            if staff:
                PlatformStaffProfile.objects.create(user=user, role=PlatformStaffProfile.Role.SUPPORT)
            self.payload["administrator"]["email"] = email.upper()
            counts = (Organization.objects.count(), Subscription.objects.count(), User.objects.count())
            response = self.client.post(reverse("platform-organization-list"), self.payload, format="json")
            self.assertEqual(response.status_code, 400)
            self.assertEqual((Organization.objects.count(), Subscription.objects.count(), User.objects.count()), counts)
            user.refresh_from_db()
            self.assertEqual(user.organization_id, organization.pk if organization else None)

    def test_missing_or_invalid_admin_rejected_before_provisioning(self):
        for administrator in (None, {}, {"full_name": "", "email": "not-email"}):
            payload = dict(self.payload)
            if administrator is None:
                payload.pop("administrator")
            else:
                payload["administrator"] = administrator
            self.assertEqual(self.client.post(reverse("platform-organization-list"), payload, format="json").status_code, 400)
        self.assertFalse(Organization.objects.filter(name=self.payload["name"]).exists())

    def test_database_failure_rolls_back_org_subscription_user_and_callback(self):
        for failure in (RuntimeError("provision failed"), IntegrityError("conflict")):
            with patch("apps.platform_admin.services.record_platform_action", side_effect=failure):
                with self.captureOnCommitCallbacks(execute=True) as callbacks:
                    response = self.client.post(reverse("platform-organization-list"), self.payload, format="json")
            self.assertEqual(response.status_code, 400 if isinstance(failure, IntegrityError) else 500)
            self.assertFalse(Organization.objects.filter(name=self.payload["name"]).exists())
            self.assertFalse(User.objects.filter(email="maria@cliente.test").exists())
            self.assertEqual(callbacks, [])
        self.assertEqual(OrganizationAdministratorInvitation.objects.count(), 0)

    def test_email_failure_keeps_creation_and_resend_recovers_without_duplicates(self):
        with patch("apps.accounts.invitations.send_mail", side_effect=OSError("private smtp credentials must not leak")):
            _, invitation = self.create_organization()
        self.assertEqual(invitation.delivery_status, "failed")
        self.assertNotIn("private", invitation.delivery_error)
        counts = (Organization.objects.count(), User.objects.count())
        self.assertEqual(self.resend(invitation).status_code, 200)
        invitation.refresh_from_db()
        self.assertEqual(invitation.delivery_status, "sent")
        self.assertEqual(invitation.delivery_attempts, 2)
        self.assertEqual((Organization.objects.count(), User.objects.count()), counts)
        self.assertEqual(OrganizationAdministratorInvitation.objects.count(), 1)

    def test_expired_and_invalid_tokens_fail_and_resend_rotates_secret(self):
        _, invitation = self.create_organization()
        old = self.invitation_token()
        OrganizationAdministratorInvitation.objects.filter(pk=invitation.pk).update(expires_at=timezone.now() - timedelta(seconds=1))
        self.assertEqual(self.accept(old).status_code, 400)
        self.assertEqual(self.accept("x" * 43).status_code, 400)
        self.assertEqual(self.resend(invitation).status_code, 200)
        new = self.invitation_token()
        self.assertNotEqual(new, old)
        self.assertEqual(self.accept(old).status_code, 400)
        self.assertEqual(self.accept(new).status_code, 200)

    def test_weak_and_mismatched_passwords_do_not_consume_invitation(self):
        _, invitation = self.create_organization()
        token = self.invitation_token()
        self.assertEqual(self.accept(token, "12345678").status_code, 400)
        self.assertEqual(self.accept(token, confirmation="different").status_code, 400)
        invitation.refresh_from_db()
        self.assertIsNone(invitation.accepted_at)
        self.assertFalse(invitation.user.is_active)
        self.assertEqual(self.accept(token).status_code, 200)

    def test_suspended_and_archived_organizations_cannot_accept_or_resend(self):
        _, invitation = self.create_organization()
        token = self.invitation_token()
        for state in ("suspended", "archived"):
            organization = invitation.organization
            organization.status = state
            organization.save(update_fields=["status"])
            self.assertEqual(self.accept(token).status_code, 400)
            self.assertEqual(self.resend(invitation).status_code, 400)

    def test_only_platform_admin_can_create_and_resend(self):
        _, invitation = self.create_organization()
        support = User.objects.create_user(email="support@invitation.test")
        PlatformStaffProfile.objects.create(user=support, role=PlatformStaffProfile.Role.SUPPORT)
        tenant = User.objects.create_user(email="tenant@invitation.test", organization=invitation.organization, role="admin")
        for user in (support, tenant):
            self.client.force_authenticate(user)
            self.assertEqual(self.resend(invitation).status_code, 403)
            self.assertEqual(self.client.post(reverse("platform-organization-list"), self.payload, format="json").status_code, 403)

    def test_stale_delivery_callback_does_not_resend_old_token(self):
        _, invitation = self.create_organization()
        token = self.invitation_token()
        self.resend(invitation)
        before = len(mail.outbox)
        deliver_invitation(invitation.pk, token)
        self.assertEqual(len(mail.outbox), before)
        invitation.refresh_from_db()
        self.assertEqual(invitation.delivery_attempts, 2)

    def test_duplicate_delivery_callback_does_not_send_twice(self):
        _, invitation = self.create_organization()
        before = len(mail.outbox)
        deliver_invitation(invitation.pk, self.invitation_token())
        invitation.refresh_from_db()
        self.assertEqual(len(mail.outbox), before)
        self.assertEqual(invitation.delivery_attempts, 1)

    def test_pending_user_cannot_login_through_google(self):
        _, invitation = self.create_organization()
        with patch("apps.accounts.views.verify_google_credential", return_value={"email": invitation.email, "name": "Maria", "sub": "google-test"}):
            response = self.public.post(reverse("auth_google"), {"credential": "test"}, format="json")
        self.assertEqual(response.status_code, 403)

    def test_edit_cannot_replace_administrator(self):
        _, invitation = self.create_organization()
        response = self.client.patch(reverse("platform-organization-detail", args=[invitation.organization_id]), {"administrator": {"full_name": "Outro", "email": "outro@test.local"}}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertFalse(User.objects.filter(email="outro@test.local").exists())
