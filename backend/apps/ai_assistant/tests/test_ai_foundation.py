from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.ai_assistant.models import AIConversation, AIMessage, AIUsage
from apps.ai_assistant.services.openai_service import AIProviderError, GeneratedAnswer
from apps.ai_assistant.services.providers import AIProviderExhaustedError
from apps.ai_assistant.services.quota import AIQuotaExceededError, consume_question, get_ai_quota
from apps.organizations.models import Organization
from apps.farms.models import Farm


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

    @patch("apps.ai_assistant.views.get_ai_provider")
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

    @patch("apps.ai_assistant.views.get_ai_provider")
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

    @patch("apps.ai_assistant.views.get_ai_provider")
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

    @patch("apps.ai_assistant.views.get_ai_provider")
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

    @patch("apps.ai_assistant.views.get_ai_provider")
    def test_authorized_farm_context_is_forwarded_to_provider(self, provider_factory):
        farm = Farm.objects.create(
            organization=self.organization, name="Fazenda da Consulta", city="Sobral", state="CE"
        )
        conversation = AIConversation.objects.create(
            organization=self.organization,
            user=self.user,
            title="Contexto",
            subject=AIConversation.Subject.MANAGEMENT,
        )
        provider = provider_factory.return_value
        provider.moderate.return_value = {"flagged": False, "categories": {}}
        provider.generate.return_value = GeneratedAnswer(
            text="Resumo da fazenda.", response_id="context-response", model="test-model",
            provider="test", input_tokens=10, output_tokens=5, latency_ms=10,
        )
        response = self.client.post(
            reverse("ai-conversation-ask", args=(conversation.id,)),
            {
                "question": "Analise este contexto",
                "context_type": "farm",
                "context_id": str(farm.id),
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        sent_context = provider.generate.call_args.kwargs["context"]
        self.assertIn("Fazenda da Consulta", sent_context)
        self.assertIn("Cidade: Sobral", sent_context)

    def test_context_from_another_tenant_returns_not_found_without_consuming_quota(self):
        other = Organization.objects.create(name="Privada", slug="privada-context-test")
        private_farm = Farm.objects.create(organization=other, name="Fazenda Privada")
        conversation = AIConversation.objects.create(
            organization=self.organization, user=self.user, title="Isolamento"
        )
        response = self.client.post(
            reverse("ai-conversation-ask", args=(conversation.id,)),
            {
                "question": "Mostre os dados",
                "context_type": "farm",
                "context_id": str(private_farm.id),
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(get_ai_quota(self.user).used, 0)

    @patch("apps.ai_assistant.views.get_ai_provider")
    def test_exhausted_fallbacks_are_audited_without_upstream_details(self, provider_factory):
        conversation = AIConversation.objects.create(
            organization=self.organization, user=self.user, title="Fallbacks"
        )
        provider = provider_factory.return_value
        provider.moderate.return_value = {"flagged": False, "categories": {}}
        provider.generate.side_effect = AIProviderExhaustedError(
            "Nenhum modelo disponível.",
            attempts=(
                {"provider": "opencode_zen", "model": "free-a", "status": "provider_error"},
                {"provider": "opencode_zen", "model": "free-b", "status": "provider_error"},
            ),
        )
        response = self.client.post(
            reverse("ai-conversation-ask", args=(conversation.id,)),
            {"question": "Teste todos os modelos"}, format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        message = AIMessage.objects.get(conversation=conversation, role=AIMessage.Role.USER)
        self.assertEqual(message.fallback_count, 1)
        self.assertEqual(len(message.provider_attempts), 2)
        self.assertNotIn("detail", message.provider_attempts[0])

    @patch("apps.ai_assistant.views.get_ai_provider")
    def test_flagged_output_is_not_saved_and_releases_quota(self, provider_factory):
        conversation = AIConversation.objects.create(
            organization=self.organization, user=self.user, title="Saída bloqueada"
        )
        provider = provider_factory.return_value
        provider.moderate.side_effect = [
            {"flagged": False, "categories": {}},
            {"flagged": True, "categories": {"unsafe": True}},
        ]
        provider.generate.return_value = GeneratedAnswer(
            text="Conteúdo que deve ser retido", response_id="blocked-output",
            model="test", provider="test", input_tokens=10, output_tokens=10, latency_ms=5,
        )
        response = self.client.post(
            reverse("ai-conversation-ask", args=(conversation.id,)),
            {"question": "Faça uma avaliação"}, format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_422_UNPROCESSABLE_ENTITY)
        self.assertFalse(
            AIMessage.objects.filter(
                conversation=conversation, role=AIMessage.Role.ASSISTANT
            ).exists()
        )
        self.assertEqual(get_ai_quota(self.user).used, 0)

    def test_partial_context_parameters_are_rejected_before_quota(self):
        conversation = AIConversation.objects.create(
            organization=self.organization, user=self.user, title="Contexto incompleto"
        )
        response = self.client.post(
            reverse("ai-conversation-ask", args=(conversation.id,)),
            {"question": "Analise", "context_type": "farm"}, format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(get_ai_quota(self.user).used, 0)
