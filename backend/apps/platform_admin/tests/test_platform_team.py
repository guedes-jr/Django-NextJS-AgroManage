from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.platform_admin.models import PlatformAuditLog, PlatformStaffProfile

User = get_user_model()


class PlatformTeamManagementAPITestCase(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            email="owner@platform.test",
            password="OwnerPassword-8472",
            full_name="Platform Owner",
            is_staff=True,
        )
        self.owner_profile = PlatformStaffProfile.objects.create(
            user=self.owner,
            role=PlatformStaffProfile.Role.OWNER,
        )
        self.admin = User.objects.create_user(
            email="admin@platform.test",
            password="AdminPassword-8472",
            full_name="Platform Admin",
            is_staff=True,
        )
        self.admin_profile = PlatformStaffProfile.objects.create(
            user=self.admin,
            role=PlatformStaffProfile.Role.ADMIN,
        )

    def test_owner_creates_internal_member_with_forced_password_change(self):
        self.client.force_authenticate(user=self.owner)

        response = self.client.post(
            reverse("platform-team-list"),
            {
                "email": "support@platform.test",
                "full_name": "Support Agent",
                "role": PlatformStaffProfile.Role.SUPPORT,
                "mfa_required": True,
                "initial_password": "SupportPassword-8472",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        member = User.objects.get(email="support@platform.test")
        self.assertTrue(member.force_password_change)
        self.assertTrue(member.platform_staff_profile.mfa_required)
        self.assertEqual(member.platform_staff_profile.role, PlatformStaffProfile.Role.SUPPORT)
        self.assertTrue(PlatformAuditLog.objects.filter(action="platform_team.created").exists())

    def test_admin_cannot_assign_owner_role(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.post(
            reverse("platform-team-list"),
            {
                "email": "other-owner@platform.test",
                "full_name": "Other Owner",
                "role": PlatformStaffProfile.Role.OWNER,
                "initial_password": "OtherOwnerPassword-8472",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_last_active_owner_cannot_be_blocked(self):
        self.client.force_authenticate(user=self.owner)

        response = self.client.patch(
            reverse("platform-team-detail", args=[self.owner.id]),
            {
                "email": self.owner.email,
                "full_name": self.owner.full_name,
                "role": PlatformStaffProfile.Role.ADMIN,
                "mfa_required": True,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("último proprietário", response.data["detail"])

    def test_member_cannot_block_own_account(self):
        self.client.force_authenticate(user=self.owner)

        response = self.client.post(reverse("platform-team-block", args=[self.owner.id]))

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_admin_blocks_member_and_revokes_sessions(self):
        support = User.objects.create_user(
            email="blocked-support@platform.test",
            password="BlockedPassword-8472",
            full_name="Blocked Support",
            is_staff=True,
        )
        profile = PlatformStaffProfile.objects.create(user=support, role=PlatformStaffProfile.Role.SUPPORT)
        self.client.force_authenticate(user=self.admin)

        response = self.client.post(reverse("platform-team-block", args=[support.id]))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        support.refresh_from_db()
        profile.refresh_from_db()
        self.assertFalse(support.is_active)
        self.assertFalse(profile.is_active)
        self.assertEqual(support.session_version, 1)
        self.assertTrue(PlatformAuditLog.objects.filter(action="platform_team.blocked").exists())

    def test_owner_updates_role_and_mfa_requirement(self):
        self.client.force_authenticate(user=self.owner)

        response = self.client.patch(
            reverse("platform-team-detail", args=[self.admin.id]),
            {
                "email": self.admin.email,
                "full_name": self.admin.full_name,
                "role": PlatformStaffProfile.Role.AUDITOR,
                "mfa_required": False,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.admin_profile.refresh_from_db()
        self.assertEqual(self.admin_profile.role, PlatformStaffProfile.Role.AUDITOR)
        self.assertFalse(self.admin_profile.mfa_required)
        self.assertTrue(PlatformAuditLog.objects.filter(action="platform_team.updated").exists())
