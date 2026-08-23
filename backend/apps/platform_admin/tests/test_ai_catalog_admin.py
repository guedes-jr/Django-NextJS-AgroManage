from types import SimpleNamespace
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.ai_assistant.models import AIModel, AIModelSyncRun, AIProviderConfiguration
from apps.platform_admin.models import PlatformAuditLog, PlatformStaffProfile


User = get_user_model()


class PlatformAICatalogAdminTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            email="catalog-admin@platform.local",
            password="StrongPassword-123",
            full_name="Catalog Admin",
            is_staff=True,
        )
        PlatformStaffProfile.objects.create(
            user=self.admin, role=PlatformStaffProfile.Role.ADMIN
        )
        self.client.force_authenticate(self.admin)
        self.provider = AIProviderConfiguration.objects.create(
            provider="opencode_zen",
            display_name="OpenCode Zen",
            base_url="https://opencode.ai/zen/v1",
            api_key_env_var="OPENCODE_ZEN_API_KEY",
            is_enabled=True,
            is_default=True,
        )
        self.primary = AIModel.objects.create(
            provider=self.provider,
            external_id="free-primary",
            display_name="Free Primary",
            is_free=True,
            is_available=True,
            is_enabled=True,
            is_primary=True,
            priority=10,
        )
        self.fallback = AIModel.objects.create(
            provider=self.provider,
            external_id="free-fallback",
            display_name="Free Fallback",
            is_free=True,
            is_available=True,
            is_enabled=True,
            priority=20,
        )

    def test_staff_lists_providers_without_secret_name_or_value(self):
        response = self.client.get(reverse("platform-ai-providers"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data[0]["provider"], "opencode_zen")
        self.assertNotIn("api_key_env_var", response.data[0])
        self.assertNotIn("api_key", response.data[0])

    def test_admin_saves_encrypted_credential_without_exposing_it(self):
        response = self.client.patch(
            reverse("platform-ai-provider-detail", args=(self.provider.id,)),
            {"api_key": "zen-secret-value"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.provider.refresh_from_db()
        self.assertTrue(response.data["credential_configured"])
        self.assertNotIn("api_key", response.data)
        self.assertNotEqual(self.provider.encrypted_api_key, "zen-secret-value")
        self.assertEqual(self.provider.get_api_key(), "zen-secret-value")

    def test_admin_changes_primary_model_and_audits(self):
        response = self.client.patch(
            reverse("platform-ai-model-detail", args=(self.fallback.id,)),
            {"is_primary": True, "priority": 5},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.primary.refresh_from_db()
        self.fallback.refresh_from_db()
        self.assertFalse(self.primary.is_primary)
        self.assertTrue(self.fallback.is_primary)
        self.assertEqual(self.fallback.priority, 5)
        self.assertTrue(PlatformAuditLog.objects.filter(action="ai.model_updated").exists())

    def test_unavailable_model_cannot_be_enabled(self):
        self.fallback.is_available = False
        self.fallback.is_enabled = False
        self.fallback.save(update_fields=("is_available", "is_enabled", "updated_at"))
        response = self.client.patch(
            reverse("platform-ai-model-detail", args=(self.fallback.id,)),
            {"is_enabled": True},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_model_filters_return_only_free_models(self):
        AIModel.objects.create(
            provider=self.provider,
            external_id="paid",
            display_name="Paid",
            is_free=False,
            is_available=True,
        )
        response = self.client.get(reverse("platform-ai-models"), {"is_free": "true"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)
        self.assertTrue(all(item["is_free"] for item in response.data))

    @patch(
        "apps.platform_admin.views.sync_opencode_zen_models_task.apply_async",
        return_value=SimpleNamespace(id="manual-sync-task-1"),
    )
    def test_admin_queues_manual_sync_and_audits(self, apply_async):
        response = self.client.post(reverse("platform-ai-model-sync"), {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        self.assertEqual(response.data["task_id"], "manual-sync-task-1")
        apply_async.assert_called_once_with(kwargs={"trigger": AIModelSyncRun.Trigger.MANUAL})
        self.assertTrue(
            PlatformAuditLog.objects.filter(action="ai.model_sync_requested").exists()
        )

    def test_support_can_read_but_cannot_mutate_or_sync(self):
        support = User.objects.create_user(
            email="catalog-support@platform.local",
            password="StrongPassword-123",
            full_name="Catalog Support",
            is_staff=True,
        )
        PlatformStaffProfile.objects.create(
            user=support, role=PlatformStaffProfile.Role.SUPPORT
        )
        self.client.force_authenticate(support)
        listing = self.client.get(reverse("platform-ai-models"))
        mutation = self.client.patch(
            reverse("platform-ai-model-detail", args=(self.fallback.id,)),
            {"priority": 1}, format="json",
        )
        sync = self.client.post(reverse("platform-ai-model-sync"), {}, format="json")
        self.assertEqual(listing.status_code, status.HTTP_200_OK)
        self.assertEqual(mutation.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(sync.status_code, status.HTTP_403_FORBIDDEN)

    def test_model_endpoint_does_not_expose_raw_provider_metadata(self):
        self.primary.metadata = {"internal": "should-not-leak", "headers": {"secret": "value"}}
        self.primary.save(update_fields=("metadata", "updated_at"))
        response = self.client.get(reverse("platform-ai-models"))
        item = next(row for row in response.data if row["id"] == str(self.primary.id))
        self.assertNotIn("metadata", item)
        self.assertNotIn("headers", item)
