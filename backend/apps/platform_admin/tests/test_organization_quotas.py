import re
from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.cache import cache
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.db import transaction
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient, APITestCase

from apps.accounts.invitations import schedule_invitation
from apps.accounts.models import OrganizationAdministratorInvitation
from apps.billing.models import OrganizationStoredFile
from apps.billing.quotas import MB, QuotaExceeded, organization_usage, reconcile_storage, storage_bytes
from apps.farms.models import Farm
from apps.organizations.models import Organization
from apps.platform_admin.models import PlatformAuditLog, PlatformStaffProfile

User = get_user_model()


@override_settings(STORAGES={"default": {"BACKEND": "django.core.files.storage.InMemoryStorage"}}, EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class OrganizationQuotaTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.organization = Organization.objects.create(name="Cotas", slug="quotas")
        self.owner = User.objects.create_user(email="owner@quotas.test", password="Long-Password-431!", full_name="Produtor", organization=self.organization, role="admin", organization_responsible=True)
        self.admin = User.objects.create_user(email="platform@quotas.test")
        PlatformStaffProfile.objects.create(user=self.admin, role="platform_admin")
        self.client.force_authenticate(self.admin)
        self.url = reverse("platform-organization-dossier-usage", args=[self.organization.pk])

    def limits(self, **values):
        subscription = self.organization.subscription
        subscription.custom_limits = values
        subscription.save(update_fields=["custom_limits"])

    def invite(self):
        self.owner.organization_responsible = False
        self.owner.save(update_fields=["organization_responsible"])
        user = User.objects.create_user(email="invite@quotas.test", organization=self.organization, role="admin", organization_responsible=True, is_active=False)
        invitation = OrganizationAdministratorInvitation(user=user, organization=self.organization, email=user.email)
        with self.captureOnCommitCallbacks(execute=True), transaction.atomic():
            schedule_invitation(invitation)
        return invitation, re.search(r"#token=([\w-]+)", mail.outbox[-1].body).group(1)

    def test_plan_limits_overrides_null_and_zero_have_distinct_meanings(self):
        plan = self.organization.subscription.plan
        plan.max_users = 3
        plan.max_farms = 1
        plan.max_storage_mb = 5
        plan.save()
        usage = organization_usage(self.organization.pk)
        self.assertEqual(usage["resources"]["users"]["capacity"], 3)
        self.limits(max_users=None, max_farms=0)
        usage = organization_usage(self.organization.pk)
        self.assertIsNone(usage["resources"]["users"]["capacity"])
        self.assertEqual(usage["resources"]["farms"]["capacity"], 0)
        self.assertEqual(usage["resources"]["storage"]["capacity"], 5 * MB)
        self.assertEqual(usage["resources"]["users"]["source"], "override")

    def test_member_creation_and_reactivation_are_enforced_and_release_seats(self):
        self.limits(max_users=1)
        self.client.force_authenticate(self.owner)
        response = self.client.post(reverse("auth_members_create"), {"email": "member@quotas.test", "full_name": "Membro", "password": "Strong-Garden-432!", "password_confirm": "Strong-Garden-432!", "role": "manager"}, format="json")
        self.assertEqual(response.status_code, 409, response.data)
        self.assertFalse(User.objects.filter(email="member@quotas.test").exists())
        inactive = User.objects.create_user(email="inactive@quotas.test", organization=self.organization, is_active=False)
        self.client.force_authenticate(self.admin)
        response = self.client.post(reverse("platform-user-activate", args=[inactive.pk]))
        self.assertEqual(response.status_code, 409)
        self.owner.is_active = False
        self.owner.save(update_fields=["is_active"])
        self.assertEqual(self.client.post(reverse("platform-user-activate", args=[inactive.pk])).status_code, 200)
        self.assertEqual(organization_usage(self.organization.pk)["active_users"], 1)

    def test_farm_api_creation_and_reactivation_use_active_farm_count(self):
        self.limits(max_farms=1)
        self.client.force_authenticate(self.owner)
        first = self.client.post(reverse("farms-list"), {"name": "Primeira"}, format="json")
        self.assertEqual(first.status_code, 201)
        self.assertEqual(self.client.post(reverse("farms-list"), {"name": "Segunda"}, format="json").status_code, 409)
        first_farm = Farm.objects.get(pk=first.data["id"])
        first_farm.is_active = False
        first_farm.save(update_fields=["is_active"])
        second = Farm.objects.create(organization=self.organization, name="Segunda")
        with self.assertRaises(QuotaExceeded):
            Farm.objects.filter(pk=first_farm.pk).update(is_active=True)
        second.delete()
        Farm.objects.filter(pk=first_farm.pk).update(is_active=True)
        self.assertEqual(Farm.objects.filter(organization=self.organization, is_active=True).count(), 1)

    def test_bulk_imports_and_batch_activation_cannot_partially_exceed_capacity(self):
        self.limits(max_farms=1, max_users=2)
        with self.assertRaises(QuotaExceeded):
            Farm.objects.bulk_create([Farm(organization=self.organization, name="A"), Farm(organization=self.organization, name="B")])
        self.assertEqual(Farm.objects.filter(organization=self.organization).count(), 0)
        with self.assertRaises(QuotaExceeded):
            User.objects.bulk_create([User(organization=self.organization, email="bulk1@test.local"), User(organization=self.organization, email="bulk2@test.local")])
        self.assertEqual(User.objects.filter(organization=self.organization).count(), 1)
        Farm.objects.bulk_create([Farm(organization=self.organization, name="A", is_active=False), Farm(organization=self.organization, name="B", is_active=False)])
        with self.assertRaises(QuotaExceeded):
            Farm.objects.filter(organization=self.organization).update(is_active=True)
        self.assertFalse(Farm.objects.filter(organization=self.organization, is_active=True).exists())

    def test_live_invite_reserves_one_seat_and_acceptance_does_not_double_count(self):
        self.limits(max_users=2)
        invitation, token = self.invite()
        usage = organization_usage(self.organization.pk)
        self.assertEqual(usage["reserved_users"], 1)
        self.assertEqual(usage["resources"]["users"]["used"], 2)
        with self.assertRaises(QuotaExceeded):
            User.objects.create_user(email="overflow@test.local", organization=self.organization)
        self.limits(max_users=1)  # Keep the previously reserved seat after a downgrade.
        response = APIClient().post(reverse("organization-invitation-accept"), {"token": token, "password": "Fresh-Garden-Password-834!", "password_confirmation": "Fresh-Garden-Password-834!"}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        usage = organization_usage(self.organization.pk)
        self.assertEqual(usage["active_users"], 2)
        self.assertEqual(usage["reserved_users"], 0)
        self.assertEqual(usage["resources"]["users"]["status"], "over_limit")

    def test_expiry_releases_seat_and_resend_requires_free_capacity(self):
        self.limits(max_users=2)
        invitation, _ = self.invite()
        invitation.expires_at = timezone.now() - timedelta(seconds=1)
        invitation.save(update_fields=["expires_at"])
        User.objects.create_user(email="replacement@test.local", organization=self.organization)
        previous_digest = invitation.token_digest
        response = self.client.post(reverse("platform-organization-resend-administrator-invitation", args=[self.organization.pk]))
        self.assertEqual(response.status_code, 409)
        invitation.refresh_from_db()
        self.assertEqual(invitation.token_digest, previous_digest)
        self.assertEqual(organization_usage(self.organization.pk)["reserved_users"], 0)

    def test_zero_seat_plan_rolls_back_organization_creation_and_invite(self):
        plan = self.organization.subscription.plan
        plan.max_users = 0
        plan.save()
        with self.captureOnCommitCallbacks(execute=True) as callbacks:
            response = self.client.post(reverse("platform-organization-list"), {"name": "Sem vagas", "plan_id": str(plan.pk), "administrator": {"full_name": "Responsável", "email": "zero@new.test"}}, format="json")
        self.assertEqual(response.status_code, 409)
        self.assertFalse(Organization.objects.filter(name="Sem vagas").exists())
        self.assertFalse(User.objects.filter(email="zero@new.test").exists())
        self.assertEqual(callbacks, [])

    def test_internal_team_is_excluded_from_seats_and_storage(self):
        self.limits(max_users=1, max_storage_mb=0)
        internal = User.objects.create_user(email="internal@quotas.test", organization=self.organization, is_active=False)
        PlatformStaffProfile.objects.create(user=internal, role="platform_support")
        internal.is_active = True
        internal.avatar = ContentFile(b"internal avatar", name="internal.bin")
        internal.save()
        self.assertTrue(default_storage.exists(internal.avatar.name))
        usage = organization_usage(self.organization.pk)
        self.assertEqual(usage["active_users"], 1)
        self.assertEqual(usage["resources"]["storage"]["used"], 0)

    def test_storage_rejects_before_writing_and_reservation_is_rolled_back(self):
        self.limits(max_storage_mb=0)
        self.owner.avatar = ContentFile(b"avatar", name="denied.bin")
        with self.assertRaises(QuotaExceeded):
            self.owner.save()
        self.assertFalse(default_storage.exists("avatars/denied.bin"))
        self.assertEqual(OrganizationStoredFile.objects.filter(organization=self.organization).count(), 0)
        self.owner.refresh_from_db()
        self.assertFalse(self.owner.avatar)

    def test_file_replacement_shrinking_clearing_and_downgrade_preserve_data(self):
        self.limits(max_storage_mb=1)
        self.owner.avatar = ContentFile(b"a" * MB, name="large.bin")
        self.owner.save()
        old_name = self.owner.avatar.name
        self.assertEqual(storage_bytes(self.organization.pk), MB)
        self.limits(max_storage_mb=0)
        self.owner.full_name = "Nome atualizado"
        self.owner.save(update_fields=["full_name"])
        self.assertTrue(default_storage.exists(old_name))
        self.owner.avatar = ContentFile(b"b" * (MB + 1), name="bigger.bin")
        with self.assertRaises(QuotaExceeded):
            self.owner.save()
        self.owner.refresh_from_db()
        self.owner.avatar = ContentFile(b"small", name="small.bin")
        with self.captureOnCommitCallbacks(execute=True):
            self.owner.save()
        self.assertFalse(default_storage.exists(old_name))
        self.assertEqual(storage_bytes(self.organization.pk), 5)
        new_name = self.owner.avatar.name
        self.owner.avatar = None
        with self.captureOnCommitCallbacks(execute=True):
            self.owner.save()
        self.assertEqual(storage_bytes(self.organization.pk), 0)
        self.assertFalse(default_storage.exists(new_name))

    def test_shared_file_is_counted_once_and_not_deleted_while_referenced(self):
        self.limits(max_storage_mb=1)
        self.owner.avatar = ContentFile(b"shared", name="shared.bin")
        self.owner.save()
        second = User.objects.create_user(email="shared@test.local", organization=self.organization, avatar=self.owner.avatar.name)
        self.assertEqual(storage_bytes(self.organization.pk), 6)
        path = self.owner.avatar.name
        self.owner.avatar = None
        with self.captureOnCommitCallbacks(execute=True):
            self.owner.save()
        self.assertTrue(default_storage.exists(path))
        with self.captureOnCommitCallbacks(execute=True):
            second.delete()
        self.assertFalse(default_storage.exists(path))
        self.assertEqual(storage_bytes(self.organization.pk), 0)

    def test_direct_field_save_and_bulk_files_cannot_bypass_storage(self):
        self.limits(max_storage_mb=0)
        with self.assertRaises(QuotaExceeded):
            self.owner.avatar.save("direct.bin", ContentFile(b"direct"))
        self.owner.refresh_from_db()
        with self.assertRaises(QuotaExceeded):
            User.objects.bulk_create([User(email="bulk-file@test.local", organization=self.organization, avatar=ContentFile(b"bulk", name="bulk.bin"))])
        self.assertFalse(User.objects.filter(email="bulk-file@test.local").exists())
        self.owner.avatar.save("deferred.bin", ContentFile(b"deferred"), save=False)
        self.assertFalse(default_storage.exists("avatars/deferred.bin"))
        with self.assertRaises(QuotaExceeded):
            self.owner.save()

    def test_failed_storage_write_releases_accounting_and_keeps_previous_file(self):
        self.owner.avatar = ContentFile(b"old", name="old.bin")
        self.owner.save()
        old = self.owner.avatar.name
        self.owner.avatar = ContentFile(b"new", name="new.bin")
        with patch.object(default_storage, "save", side_effect=OSError("write failed")):
            with self.assertRaises(OSError):
                self.owner.save()
        self.owner.refresh_from_db()
        self.assertEqual(self.owner.avatar.name, old)
        self.assertEqual(storage_bytes(self.organization.pk), 3)
        self.assertTrue(default_storage.exists(old))

    def test_reconciliation_imports_existing_files_and_reports_unmeasurable_records(self):
        name = default_storage.save("avatars/legacy.bin", ContentFile(b"legacy"))
        User._base_manager.filter(pk=self.owner.pk).update(avatar=name)
        usage = organization_usage(self.organization.pk)
        self.assertEqual(usage["resources"]["storage"]["used"], 6)
        self.limits(max_storage_mb=1)
        with patch.object(default_storage, "size", side_effect=PermissionError("private storage error")):
            state = reconcile_storage(self.organization.pk)
        self.assertEqual(state.unknown_files, 1)
        self.owner.refresh_from_db()
        self.owner.avatar = ContentFile(b"larger file", name="larger.bin")
        with self.assertRaisesMessage(Exception, "Não foi possível medir todos os arquivos"):
            self.owner.save()
        state = reconcile_storage(self.organization.pk)
        self.assertEqual(state.unknown_files, 0)
        default_storage.delete(name)
        state = reconcile_storage(self.organization.pk)
        self.assertEqual(state.missing_files, 1)
        self.assertEqual(storage_bytes(self.organization.pk), 0)

    def test_overrides_are_validated_audited_and_reset_without_touching_other_keys(self):
        self.limits(unrelated_setting=7)
        response = self.client.patch(self.url, {"max_users": 0, "max_farms": None, "warning_threshold_percent": 50}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["resources"]["users"]["status"], "over_limit")
        self.assertTrue(PlatformAuditLog.objects.filter(action="organization.limits_updated", organization=self.organization).exists())
        response = self.client.patch(self.url, {"inherit": ["max_users", "max_farms", "warning_threshold_percent"]}, format="json")
        self.assertEqual(response.status_code, 200)
        self.organization.subscription.refresh_from_db()
        self.assertEqual(self.organization.subscription.custom_limits, {"unrelated_setting": 7})
        for payload in ({"max_users": -1}, {"warning_threshold_percent": 0}, {"max_users": 2, "inherit": ["max_users"]}, {"unknown": 1}):
            self.assertEqual(self.client.patch(self.url, payload, format="json").status_code, 400)

    def test_read_write_permissions_and_organization_boundary(self):
        other = Organization.objects.create(name="Outra", slug="other-quotas")
        self.limits(max_users=1)
        User.objects.create_user(email="other@quotas.test", organization=other)
        response = self.client.get(self.url, {"organization": str(other.pk)})
        self.assertEqual(response.data["active_users"], 1)
        support = User.objects.create_user(email="support@quota.test")
        PlatformStaffProfile.objects.create(user=support, role="platform_support")
        self.client.force_authenticate(support)
        self.assertEqual(self.client.get(self.url).status_code, 200)
        self.assertEqual(self.client.patch(self.url, {"max_users": 3}, format="json").status_code, 403)
        self.assertEqual(self.client.post(reverse("platform-organization-dossier-reconcile-storage", args=[self.organization.pk])).status_code, 403)
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.get(self.url).status_code, 403)

    def test_all_tenant_file_types_obey_the_storage_cap(self):
        from apps.crops.models import Field, PlantingCycle, SoilAnalysis
        from apps.finance.models import FinancialCategory, Transaction
        from apps.inventory.models import Fornecedor
        from apps.reports.models import GeneratedReport
        farm = Farm.objects.create(organization=self.organization, name="Cultivo")
        field = Field.objects.create(farm=farm, name="Talhão", area_ha=1)
        plantation = PlantingCycle.objects.create(organization=self.organization, field=field, crop_name="Milho", planting_date=timezone.localdate())
        category = FinancialCategory.objects.create(organization=self.organization, name="Despesas", category_type="expense")
        self.limits(max_storage_mb=0)
        records = [
            (self.organization, "logo"),
            (Fornecedor(organization=self.organization, nome="Fornecedor"), "imagem"),
            (Transaction(organization=self.organization, category=category, description="Comprovante", amount=1, due_date=timezone.localdate()), "attachment"),
            (GeneratedReport(organization=self.organization, name="Relatório", report_type="farm_summary", format_used="pdf"), "file"),
            (SoilAnalysis(plantation=plantation, field=field), "file"),
        ]
        for record, name in records:
            with self.subTest(model=record._meta.label_lower):
                setattr(record, name, ContentFile(b"upload", name="file.bin"))
                with self.assertRaises(QuotaExceeded):
                    record.save()
        self.assertEqual(storage_bytes(self.organization.pk), 0)

    def test_failed_database_write_removes_only_the_new_blob(self):
        existing = default_storage.save("avatars/preexisting.bin", ContentFile(b"keep"))
        self.owner.avatar = existing
        with patch.object(self.owner, "_save_table", side_effect=RuntimeError("database write failed")):
            with self.assertRaises(RuntimeError):
                self.owner.save()
        self.assertTrue(default_storage.exists(existing))
        self.owner.refresh_from_db()
        self.owner.avatar = ContentFile(b"new", name="new-database-failure.bin")
        with patch.object(self.owner, "_save_table", side_effect=RuntimeError("database write failed")):
            with self.assertRaises(RuntimeError):
                self.owner.save()
        self.assertFalse(default_storage.exists(self.owner.avatar.name))
        self.assertEqual(storage_bytes(self.organization.pk), 0)

    def test_direct_file_deletion_defers_physical_cleanup_until_commit(self):
        self.owner.avatar = ContentFile(b"delete", name="delete.bin")
        self.owner.save()
        name = self.owner.avatar.name
        with self.captureOnCommitCallbacks(execute=True):
            self.owner.avatar.delete()
            self.assertTrue(default_storage.exists(name))
        self.assertFalse(default_storage.exists(name))
        self.assertEqual(storage_bytes(self.organization.pk), 0)

    def test_warning_threshold_and_legacy_internal_avatar_exclusion(self):
        self.limits(max_users=2, warning_threshold_percent=50)
        self.assertEqual(organization_usage(self.organization.pk)["resources"]["users"]["status"], "warning")
        self.owner.avatar = ContentFile(b"legacy staff", name="team.bin")
        self.owner.save()
        PlatformStaffProfile.objects.create(user=self.owner, role="platform_support")
        usage = organization_usage(self.organization.pk)
        self.assertEqual(usage["active_users"], 0)
        self.assertEqual(usage["resources"]["storage"]["used"], 0)

    def test_auto_provisioning_rolls_back_when_first_seat_is_not_available(self):
        plan = self.organization.subscription.plan
        plan.max_users = 0
        plan.save()
        unbound = User.objects.create_user(email="unbound@quota.test", password="Long-Password-431!")
        before = Organization.objects.count()
        response = APIClient().post(reverse("auth_login"), {"email": unbound.email, "password": "Long-Password-431!"}, format="json")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(Organization.objects.count(), before)
        unbound.refresh_from_db()
        self.assertIsNone(unbound.organization_id)

    def test_binding_existing_avatar_checks_storage_without_removing_original(self):
        self.limits(max_storage_mb=0)
        unbound = User.objects.create_user(email="old-avatar@quota.test", avatar=ContentFile(b"existing", name="unbound.bin"))
        path = unbound.avatar.name
        self.assertTrue(default_storage.exists(path))
        unbound.organization = self.organization
        with self.assertRaises(QuotaExceeded):
            unbound.save(update_fields=["organization"])
        unbound.refresh_from_db()
        self.assertIsNone(unbound.organization_id)
        self.assertTrue(default_storage.exists(path))
        self.assertEqual(storage_bytes(self.organization.pk), 0)

    def test_tenant_storage_display_initializes_legacy_file_usage(self):
        name = default_storage.save("avatars/legacy-display.bin", ContentFile(b"legacy display"))
        User._base_manager.filter(pk=self.owner.pk).update(avatar=name)
        self.client.force_authenticate(self.owner)
        response = self.client.get(reverse("my-organization"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["storage_used"], 14 / MB)
