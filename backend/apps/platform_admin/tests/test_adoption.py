from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import RequestFactory
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase
from django.http import HttpResponse

from apps.organizations.models import Organization
from apps.platform_admin.adoption import aggregate_organization, record_activity
from apps.platform_admin.adoption_middleware import CustomerActivityMiddleware
from apps.platform_admin.models import AdoptionObservation, CustomerActivityDay, OrganizationAdoption, PlatformStaffProfile
from apps.platform_admin.tasks import refresh_organization_adoption

User = get_user_model()


class AdoptionTests(APITestCase):
    def setUp(self):
        self.now = timezone.now()
        AdoptionObservation.objects.update_or_create(pk=1, defaults={"started_at": self.now - timedelta(days=45)})
        self.org = Organization.objects.create(name="Adoção", slug="adoption")
        self.other = Organization.objects.create(name="Outra", slug="adoption-other")
        self.user = User.objects.create_user(email="customer@adoption.test", password="Strong-pass123!", organization=self.org, role="admin", organization_responsible=True)
        self.admin = User.objects.create_user(email="staff@adoption.test")
        PlatformStaffProfile.objects.create(user=self.admin, role="platform_admin")

    def endpoint(self, org=None):
        return reverse("platform-organization-dossier-adoption", args=[(org or self.org).pk])

    def test_collection_is_daily_idempotent_and_monotonic(self):
        for _ in range(3):
            record_activity(self.user, "login", self.now)
        record_activity(self.user, "login", self.now - timedelta(seconds=1))
        record_activity(self.user, "operation", self.now)
        self.assertEqual(CustomerActivityDay.objects.count(), 1)
        row = CustomerActivityDay.objects.get()
        self.assertEqual(row.last_login_at, self.now)
        self.assertEqual(row.last_operation_at, self.now)
        metrics = aggregate_organization(self.org.pk, self.now)
        self.assertEqual(metrics["active_users_7d"], 1)
        self.assertEqual(metrics["active_users_30d"], 1)
        self.assertTrue(metrics["checklist"]["responsible_activated"])
        self.assertTrue(metrics["checklist"]["first_operation"])

    def test_internal_inactive_affiliate_and_assisted_access_are_excluded(self):
        self.admin.organization = self.org
        self.admin.save()
        record_activity(self.admin, "login")
        # An inactive staff profile also does not turn an internal user into a customer.
        PlatformStaffProfile.objects.filter(user=self.admin).update(is_active=False)
        record_activity(self.admin, "operation")
        self.user.support_access_grant = object()
        record_activity(self.user, "operation")
        del self.user.support_access_grant
        self.user.is_active = False
        record_activity(self.user, "login")
        self.user.is_active = True
        from apps.affiliates.models import AffiliateProfile
        AffiliateProfile.objects.create(user=self.user, portal_access_only=True)
        record_activity(self.user, "login")
        self.assertFalse(CustomerActivityDay.objects.exists())

    def test_aggregation_excludes_internal_users_and_cross_tenant_events(self):
        record_activity(self.user, "login", self.now)
        # Simulate historical re-assignment without bypassing the public quota policy.
        User._base_manager.filter(pk=self.user.pk).update(organization=self.other, organization_responsible=False)
        self.user.refresh_from_db()
        self.assertEqual(aggregate_organization(self.org.pk, self.now)["active_users_30d"], 0)
        record_activity(self.user, "login", self.now)
        PlatformStaffProfile.objects.create(user=self.user, role="platform_support")
        self.assertEqual(aggregate_organization(self.other.pk, self.now)["active_users_30d"], 0)

    def test_inactivity_boundaries_unique_users_and_partial_periods(self):
        second = User.objects.create_user(email="second@adoption.test", organization=self.org)
        record_activity(second, "login", self.now - timedelta(days=40))
        for days, status in [(0, "active"), (7, "inactive_7"), (15, "inactive_15"), (30, "inactive_30")]:
            CustomerActivityDay.objects.filter(user=self.user).delete()
            record_activity(self.user, "login", self.now - timedelta(days=days))
            metrics = aggregate_organization(self.org.pk, self.now)
            self.assertEqual(metrics["status"], status)
            self.assertEqual(metrics["active_users_7d"], int(days <= 7))
            self.assertEqual(metrics["active_users_30d"], int(days <= 30))
            self.assertFalse(metrics["period_30d_complete"])

    def test_old_unknown_new_never_no_invented_history(self):
        self.assertEqual(aggregate_organization(self.org.pk)["status"], "never")
        Organization.objects.filter(pk=self.org.pk).update(created_at=self.now - timedelta(days=60))
        metrics = aggregate_organization(self.org.pk)
        self.assertEqual(metrics["status"], "unknown")
        self.assertIsNone(metrics["last_customer_login_at"])
        self.assertIsNone(metrics["checklist"]["first_operation"])
        self.assertFalse(metrics["history_complete"])

    def test_successful_customer_login_is_observed_but_failure_and_refresh_are_not(self):
        with self.captureOnCommitCallbacks(execute=True):
            failed = self.client.post(reverse("auth_login"), {"email": self.user.email, "password": "bad"})
        self.assertEqual(failed.status_code, 400)
        self.assertFalse(CustomerActivityDay.objects.exists())
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(reverse("auth_login"), {"email": self.user.email, "password": "Strong-pass123!"})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertIsNotNone(CustomerActivityDay.objects.get().last_login_at)

    def test_middleware_only_successful_domain_mutations(self):
        factory = RequestFactory()
        for method, path, status, expected in [
            ("get", "/api/v1/farms/", 200, False),
            ("post", "/api/v1/auth/token/refresh/", 200, False),
            ("post", "/api/v1/platform/organizations/", 201, False),
            ("post", "/api/v1/inventory/alertas/gerar_alertas/", 200, False),
            ("post", "/api/v1/farms/", 400, False),
            ("post", "/api/v1/farms/", 201, True),
            ("patch", "/api/v1/finance/transactions/123/", 200, True),
        ]:
            request = getattr(factory, method)(path)
            request.user = self.user
            middleware = CustomerActivityMiddleware(lambda req: HttpResponse(status=status))
            with patch("apps.platform_admin.adoption_middleware.queue_activity") as record:
                middleware(request)
            self.assertEqual(record.called, expected)

    def test_real_mutation_records_operation_get_and_failed_write_do_not(self):
        self.client.force_authenticate(self.user)
        with self.captureOnCommitCallbacks(execute=True):
            self.client.get("/api/v1/farms/")
            invalid = self.client.post("/api/v1/farms/", {})
        self.assertEqual(invalid.status_code, 400)
        self.assertFalse(CustomerActivityDay.objects.exists())
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post("/api/v1/farms/", {"name": "Primeira fazenda"})
        self.assertEqual(response.status_code, 201, response.data)
        self.assertIsNotNone(CustomerActivityDay.objects.get().last_operation_at)
        self.assertTrue(aggregate_organization(self.org.pk)["checklist"]["first_farm"])

    def test_read_permissions_scoping_filters_and_pending_snapshot(self):
        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.get(self.endpoint()).status_code, 403)
        self.client.force_authenticate(self.admin)
        self.assertIsNone(self.client.get(self.endpoint()).data["metrics"])
        record_activity(self.user, "operation")
        aggregate_organization(self.org.pk)
        aggregate_organization(self.other.pk)
        response = self.client.get(self.endpoint(self.other), {"organization": str(self.org.pk)})
        self.assertEqual(response.data["metrics"]["active_users_7d"], 0)
        response = self.client.get(reverse("platform-organization-list"), {"adoption": "active"})
        self.assertEqual([row["id"] for row in response.data["results"]], [str(self.org.pk)])
        self.assertEqual(self.client.get(reverse("platform-organization-list"), {"adoption": "invalid"}).status_code, 400)
        self.assertEqual(self.client.post(self.endpoint(), {}).status_code, 405)

    def test_materialization_repeatable_and_dashboard_reuses_snapshots(self):
        record_activity(self.user, "login")
        refresh_organization_adoption()
        refresh_organization_adoption()
        self.assertEqual(OrganizationAdoption.objects.count(), 2)
        self.client.force_authenticate(self.admin)
        response = self.client.get(reverse("platform-dashboard"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["adoption"]["by_status"]["active"], 1)
        self.assertEqual(response.data["adoption"]["pending"], 0)
