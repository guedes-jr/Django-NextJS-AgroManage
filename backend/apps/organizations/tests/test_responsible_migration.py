from datetime import timedelta

from django.db import IntegrityError, connection, transaction
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase
from django.utils import timezone


class ResponsibleMigrationTests(TransactionTestCase):
    serialized_rollback = True

    def test_backfill_preserves_designations_reconciles_duplicates_and_audits_gaps(self):
        executor = MigrationExecutor(connection)
        final_targets = executor.loader.graph.leaf_nodes()
        try:
            executor.migrate([("accounts", "0009_organizationadministratorinvitation")])
            state = executor.loader.project_state([
                ("accounts", "0009_organizationadministratorinvitation"),
                ("affiliates", "0004_affiliateprofile_portal_access_only"),
                ("platform_admin", "0013_whatsappsessionobservation"),
            ]).apps
            Organization = state.get_model("organizations", "Organization")
            User = state.get_model("accounts", "User")
            Staff = state.get_model("platform_admin", "PlatformStaffProfile")
            Audit = state.get_model("platform_admin", "PlatformAuditLog")
            now = timezone.now()

            def org(slug):
                return Organization.objects.create(name=slug, slug=slug)

            def member(organization, label, **values):
                return User.objects.create(email=f"{label}@migration.test", organization=organization, role=values.pop("role", "admin"), **values)

            preserved = org("preserve-responsible")
            existing = member(preserved, "preserved", organization_responsible=True, is_active=False)
            member(preserved, "alternative")
            duplicates = org("duplicate-responsible")
            inactive = member(duplicates, "inactive", organization_responsible=True, is_active=False)
            oldest = member(duplicates, "oldest", organization_responsible=True)
            newer = member(duplicates, "newer", organization_responsible=True)
            User.objects.filter(pk=oldest.pk).update(created_at=now - timedelta(days=2))
            User.objects.filter(pk=inactive.pk).update(created_at=now - timedelta(days=3))
            missing = org("missing-responsible")
            chosen = member(missing, "chosen")
            operator = member(missing, "operator", role="operator", organization_responsible=True)
            unresolved = org("unresolved-responsible")
            lone_operator = member(unresolved, "lone-operator", role="operator")
            staff_org = org("staff-responsible")
            internal = member(staff_org, "internal", organization_responsible=True)
            Staff.objects.create(user=internal, role="platform_admin")
            customer = member(staff_org, "customer")

            executor = MigrationExecutor(connection)
            executor.migrate([("accounts", "0011_unique_organization_responsible")])
            User = executor.loader.project_state([("accounts", "0011_unique_organization_responsible")]).apps.get_model("accounts", "User")
            for organization, expected in ((preserved, existing), (duplicates, oldest), (missing, chosen), (staff_org, customer)):
                self.assertEqual(list(User.objects.filter(organization_id=organization.pk, organization_responsible=True).values_list("pk", flat=True)), [expected.pk])
            self.assertFalse(User.objects.filter(organization_id=unresolved.pk, organization_responsible=True).exists())
            self.assertEqual(User.objects.get(pk=operator.pk).role, "operator")
            self.assertEqual(User.objects.get(pk=lone_operator.pk).role, "operator")
            self.assertTrue(User.objects.get(pk=newer.pk).is_active)
            self.assertEqual(User.objects.get(pk=newer.pk).role, "admin")
            gap = Audit.objects.get(organization_id=unresolved.pk, action="organization.responsible_migrated")
            self.assertEqual(gap.extra_data["selection"], "no_eligible_administrator")
            duplicate_log = Audit.objects.get(organization_id=duplicates.pk, action="organization.responsible_migrated")
            self.assertEqual(set(duplicate_log.extra_data["previous_responsible_ids"]), {str(inactive.pk), str(oldest.pk), str(newer.pk)})
            with self.assertRaises(IntegrityError), transaction.atomic():
                User.objects.filter(pk=newer.pk).update(organization_responsible=True)
        finally:
            MigrationExecutor(connection).migrate(final_targets)
