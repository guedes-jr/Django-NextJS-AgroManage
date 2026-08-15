from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.ai_assistant.models import AIConversation, AIFeedback, AIMessage, AIUsage
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
