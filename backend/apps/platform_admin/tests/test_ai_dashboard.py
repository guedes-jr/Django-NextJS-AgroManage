from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.ai_assistant.models import (
    AIConversation, AIFeedback, AIMessage, AIModel, AIModelSyncRun,
    AIProviderConfiguration, AIUsage,
)
from apps.organizations.models import Organization
from apps.platform_admin.models import PlatformAuditLog, PlatformStaffProfile


User = get_user_model()


class PlatformAIDashboardTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            email="ai-admin@platform.local", password="StrongPassword-123",
            full_name="AI Admin", is_staff=True,
        )
        PlatformStaffProfile.objects.create(
            user=self.admin, role=PlatformStaffProfile.Role.ADMIN,
        )
        self.organization = Organization.objects.create(name="Cliente IA", slug="cliente-ia")
        self.producer = User.objects.create_user(
            email="produtor@cliente.local", password="StrongPassword-123",
            full_name="Produtor", organization=self.organization,
        )
        self.conversation = AIConversation.objects.create(
            organization=self.organization, user=self.producer, subject="crops",
        )
        assistant_message = AIMessage.objects.create(
            conversation=self.conversation, role=AIMessage.Role.ASSISTANT,
            content="Resposta privada que não deve aparecer no painel.",
            status=AIMessage.Status.COMPLETED, input_tokens=80, output_tokens=40,
        )
        AIFeedback.objects.create(message=assistant_message, user=self.producer, helpful=True)
        AIMessage.objects.create(
            conversation=self.conversation, role=AIMessage.Role.USER,
            content="Pergunta privada", status=AIMessage.Status.BLOCKED,
        )
        AIUsage.objects.create(
            organization=self.organization, user=self.producer,
            period_start=timezone.localdate().replace(day=1), questions_used=3,
            input_tokens=80, output_tokens=40, estimated_cost_usd="0.012500",
        )
        self.client.force_authenticate(self.admin)

    def test_dashboard_returns_metrics_without_message_content(self):
        response = self.client.get(reverse("platform-ai-dashboard"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["metrics"]["questions"], 3)
        self.assertEqual(response.data["metrics"]["helpful_rate"], 100.0)
        self.assertEqual(response.data["organizations"][0]["name"], "Cliente IA")
        self.assertNotIn("content", response.data["incidents"][0])

    def test_admin_can_change_organization_ai_limit_and_audits(self):
        response = self.client.patch(
            reverse("platform-ai-organization", args=(self.organization.id,)),
            {"enabled": True, "limit": 77}, format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["enabled"])
        self.assertEqual(response.data["limit"], 77)
        self.organization.subscription.refresh_from_db()
        self.assertEqual(self.organization.subscription.custom_limits["ai_questions_per_month"], 77)
        self.assertTrue(
            PlatformAuditLog.objects.filter(action="ai.organization_limits_updated").exists()
        )

    def test_consumption_distinguishes_unknown_cost_from_zero_and_tracks_daily_totals(self):
        AIMessage.objects.create(
            conversation=self.conversation, role="assistant", status="completed", content="Privado",
            provider="openrouter", model="free", input_tokens=100, output_tokens=50,
            cached_tokens=80, reasoning_tokens=25, cost_usd=0, cost_source="reported",
        )
        AIMessage.objects.create(
            conversation=self.conversation, role="assistant", status="blocked", content="",
            provider="openrouter", model="paid", input_tokens=10, output_tokens=5,
            cost_usd="0.000000123", cost_source="reported",
        )
        response = self.client.get(reverse("platform-ai-dashboard"))
        self.assertEqual(response.status_code, 200, response.data)
        operations = response.data["model_operations"]
        summary = operations["consumption"]
        self.assertEqual(summary["requests"], 3)
        self.assertEqual(summary["unknown_cost_requests"], 1)
        self.assertEqual(summary["zero_cost_requests"], 1)
        self.assertEqual(summary["cost_usd"], 0.000000123)
        self.assertEqual(summary["cached_tokens"], 80)
        self.assertEqual(summary["reasoning_tokens"], 25)
        legacy = next(row for row in operations["model_usage"] if row["provider"] == "legacy")
        self.assertIsNone(legacy["cost_usd"])
        self.assertEqual(operations["daily_usage"][0]["requests"], 3)
        self.assertNotIn("Privado", str(operations))

    def test_support_can_view_but_cannot_change_limits(self):
        support = User.objects.create_user(
            email="ai-support@platform.local", password="StrongPassword-123",
            full_name="AI Support", is_staff=True,
        )
        PlatformStaffProfile.objects.create(
            user=support, role=PlatformStaffProfile.Role.SUPPORT,
        )
        self.client.force_authenticate(support)
        dashboard = self.client.get(reverse("platform-ai-dashboard"))
        mutation = self.client.patch(
            reverse("platform-ai-organization", args=(self.organization.id,)),
            {"enabled": False}, format="json",
        )
        self.assertEqual(dashboard.status_code, status.HTTP_200_OK)
        self.assertEqual(mutation.status_code, status.HTTP_403_FORBIDDEN)

    def test_dashboard_exposes_model_metrics_and_catalog_health_without_content(self):
        provider = AIProviderConfiguration.objects.create(
            provider="opencode_zen", display_name="OpenCode Zen",
            base_url="https://opencode.ai/zen/v1", is_enabled=True, is_default=True,
        )
        AIModel.objects.create(
            provider=provider, external_id="free-observed", display_name="Free Observed",
            is_free=True, is_available=True, is_enabled=True, is_primary=True,
        )
        now = timezone.now()
        AIModelSyncRun.objects.create(
            provider=provider, status=AIModelSyncRun.Status.SUCCESS,
            trigger=AIModelSyncRun.Trigger.SCHEDULED, started_at=now, finished_at=now,
            models_found=1, free_models_found=1,
        )
        AIMessage.objects.create(
            conversation=self.conversation, role=AIMessage.Role.ASSISTANT,
            content="Outro conteúdo privado", status=AIMessage.Status.COMPLETED,
            provider="opencode_zen", model="free-observed", input_tokens=20,
            output_tokens=10, latency_ms=80, fallback_count=1,
            provider_attempts=[
                {"provider": "opencode_zen", "model": "free-old", "status": "provider_error"},
                {"provider": "opencode_zen", "model": "free-observed", "status": "completed"},
            ],
        )
        response = self.client.get(reverse("platform-ai-dashboard"))
        operations = response.data["model_operations"]
        self.assertEqual(operations["catalog"]["enabled_free_models"], 1)
        self.assertFalse(operations["catalog"]["is_stale"])
        self.assertEqual(operations["routing"]["fallback_answers"], 1)
        row = next(item for item in operations["model_usage"] if item["model"] == "free-observed")
        self.assertEqual(row["answers"], 1)
        self.assertNotIn("content", row)
