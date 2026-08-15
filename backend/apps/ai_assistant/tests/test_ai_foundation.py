from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.ai_assistant.models import AIConversation, AIMessage, AIUsage
from apps.ai_assistant.services.openai_service import AIProviderError, GeneratedAnswer
from apps.ai_assistant.services.quota import AIQuotaExceededError, consume_question, get_ai_quota
from apps.organizations.models import Organization


User = get_user_model()


class AIAssistantFoundationTests(APITestCase):
    def setUp(self):
        self.organization = Organization.objects.create(name="Fazenda IA", slug="fazenda-ia")
        self.user = User.objects.create_user(
            email="produtor@fazenda.local",
            password="StrongPassword-123",
            full_name="Produtor Teste",
            organization=self.organization,
        )
        self.client.force_authenticate(self.user)

    def test_free_plan_exposes_monthly_quota(self):
        quota = get_ai_quota(self.user)
        self.assertTrue(quota.enabled)
        self.assertEqual(quota.limit, 5)
        self.assertEqual(quota.remaining, 5)

    def test_custom_limit_is_consumed_atomically(self):
        subscription = self.organization.subscription
        subscription.custom_limits = {"ai_questions_per_month": 1}
        subscription.save(update_fields=("custom_limits", "updated_at"))

        first = consume_question(self.user, input_tokens=20, output_tokens=30)
        self.assertEqual(first.remaining, 0)
        with self.assertRaises(AIQuotaExceededError):
            consume_question(self.user)
        usage = AIUsage.objects.get(organization=self.organization, user=self.user)
        self.assertEqual(usage.questions_used, 1)
        self.assertEqual(usage.input_tokens, 20)

    def test_user_only_lists_own_organization_conversations(self):
        own = AIConversation.objects.create(organization=self.organization, user=self.user, title="Minha")
        other_org = Organization.objects.create(name="Outra", slug="outra")
        other_user = User.objects.create_user(
            email="outro@fazenda.local", password="StrongPassword-123", full_name="Outro",
            organization=other_org,
        )
        AIConversation.objects.create(organization=other_org, user=other_user, title="Privada")

        response = self.client.get(reverse("ai-conversation-list"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["id"], str(own.id))

    def test_conversation_is_created_for_authenticated_tenant(self):
        response = self.client.post(
            reverse("ai-conversation-list"), {"title": "Dúvida sobre milho", "subject": "crops"}
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        conversation = AIConversation.objects.get(id=response.data["id"])
        self.assertEqual(conversation.organization, self.organization)
        self.assertEqual(conversation.user, self.user)

    def test_usage_endpoint_returns_plan_limit(self):
        response = self.client.get(reverse("ai-usage"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["limit"], 5)
        self.assertEqual(response.data["used"], 0)

    @patch("apps.ai_assistant.views.OpenAIRuralAssistant")
    def test_successful_answer_consumes_quota_and_saves_tokens(self, assistant_class):
        conversation = AIConversation.objects.create(
            organization=self.organization, user=self.user, title="Nova conversa"
        )
        assistant = assistant_class.return_value
        assistant.moderate.return_value = {"flagged": False, "categories": {}}
        assistant.generate.return_value = GeneratedAnswer(
            text="Observe a umidade do solo e o estágio da cultura.", response_id="resp_123",
            model="gpt-test", input_tokens=40, output_tokens=20, latency_ms=120,
        )

        response = self.client.post(
            reverse("ai-conversation-ask", args=(conversation.id,)),
            {"question": "Como avaliar a irrigação do milho?"}, format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["quota"]["used"], 1)
        usage = AIUsage.objects.get(organization=self.organization, user=self.user)
        self.assertEqual(usage.input_tokens, 40)
        self.assertEqual(usage.output_tokens, 20)
        self.assertEqual(
            AIMessage.objects.filter(conversation=conversation, status=AIMessage.Status.COMPLETED).count(), 2
        )

    @patch("apps.ai_assistant.views.OpenAIRuralAssistant")
    def test_provider_failure_releases_reserved_question(self, assistant_class):
        conversation = AIConversation.objects.create(
            organization=self.organization, user=self.user, title="Falha"
        )
        assistant = assistant_class.return_value
        assistant.moderate.return_value = {"flagged": False, "categories": {}}
        assistant.generate.side_effect = AIProviderError("Indisponível")

        response = self.client.post(
            reverse("ai-conversation-ask", args=(conversation.id,)),
            {"question": "Qual a melhor fase para plantar?"}, format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertEqual(get_ai_quota(self.user).used, 0)

    @patch("apps.ai_assistant.views.OpenAIRuralAssistant")
    def test_flagged_question_does_not_consume_quota(self, assistant_class):
        conversation = AIConversation.objects.create(
            organization=self.organization, user=self.user, title="Segurança"
        )
        assistant_class.return_value.moderate.return_value = {
            "flagged": True, "categories": {"violence": True}
        }

        response = self.client.post(
            reverse("ai-conversation-ask", args=(conversation.id,)),
            {"question": "Uma solicitação perigosa qualquer"}, format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_422_UNPROCESSABLE_ENTITY)
        self.assertEqual(get_ai_quota(self.user).used, 0)

    @patch("apps.ai_assistant.views.OpenAIRuralAssistant")
    def test_emergency_question_adds_veterinary_warning(self, assistant_class):
        conversation = AIConversation.objects.create(
            organization=self.organization, user=self.user, title="Emergência"
        )
        assistant = assistant_class.return_value
        assistant.moderate.return_value = {"flagged": False, "categories": {}}
        assistant.generate.return_value = GeneratedAnswer(
            text="Mantenha o animal em local ventilado.", response_id="resp_emergency",
            model="gpt-test", input_tokens=10, output_tokens=10, latency_ms=50,
        )

        response = self.client.post(
            reverse("ai-conversation-ask", args=(conversation.id,)),
            {"question": "Meu suíno está com dificuldade para respirar"}, format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("Possível emergência veterinária", response.data["message"]["content"])
