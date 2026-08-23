from types import SimpleNamespace
from unittest.mock import Mock, patch

from django.test import TestCase, override_settings

from apps.ai_assistant.models import AIModel, AIProviderConfiguration
from apps.ai_assistant.services.provider_router import AIProviderRouter
from apps.ai_assistant.services.providers import AIConfigurationError, AIProviderError, GeneratedAnswer


def generated(model, provider):
    return GeneratedAnswer(
        text="Resposta",
        response_id="response-id",
        model=model,
        provider=provider,
        input_tokens=10,
        output_tokens=5,
        latency_ms=20,
    )


class AIProviderRouterTests(TestCase):
    def setUp(self):
        self.zen = AIProviderConfiguration.objects.create(
            provider="opencode_zen",
            display_name="OpenCode Zen",
            base_url="https://opencode.ai/zen/v1",
            is_enabled=True,
            is_default=True,
        )
        self.openai = AIProviderConfiguration.objects.create(
            provider="openai",
            display_name="OpenAI",
            base_url="https://api.openai.com/v1",
            is_enabled=True,
        )

    def model(self, provider, external_id, **kwargs):
        defaults = {
            "display_name": external_id,
            "is_free": True,
            "is_available": True,
            "is_enabled": True,
            "priority": 100,
        }
        defaults.update(kwargs)
        return AIModel.objects.create(provider=provider, external_id=external_id, **defaults)

    @patch("apps.ai_assistant.services.provider_factory.create_provider_client")
    def test_primary_failure_falls_back_to_next_free_model(self, create_client):
        self.model(self.zen, "free-primary", is_primary=True, priority=10)
        self.model(self.zen, "free-fallback", priority=20)
        first = Mock()
        first.generate.side_effect = AIProviderError("indisponível")
        second = Mock()
        second.generate.return_value = generated("free-fallback", "opencode_zen")
        create_client.side_effect = [first, second]

        answer = AIProviderRouter().generate(
            user=SimpleNamespace(), conversation=SimpleNamespace(), question="Teste", history=[]
        )
        self.assertEqual(answer.model, "free-fallback")
        self.assertEqual(len(answer.attempts), 2)
        self.assertEqual(answer.attempts[0]["status"], "provider_error")
        self.assertEqual(answer.attempts[1]["status"], "completed")

    @override_settings(AI_ALLOW_PAID_FALLBACK=False)
    @patch("apps.ai_assistant.services.provider_factory.create_provider_client")
    def test_paid_model_from_secondary_provider_is_not_used_as_fallback(self, create_client):
        self.model(self.zen, "free-primary", is_primary=True)
        self.model(self.openai, "paid-secondary", is_free=False, is_primary=True)
        failing = Mock()
        failing.generate.side_effect = AIProviderError("indisponível")
        create_client.return_value = failing

        with self.assertRaises(AIProviderError):
            AIProviderRouter().generate(
                user=SimpleNamespace(), conversation=SimpleNamespace(), question="Teste", history=[]
            )
        self.assertEqual(create_client.call_count, 1)

    @override_settings(AI_ALLOW_PAID_FALLBACK=True)
    @patch("apps.ai_assistant.services.provider_factory.create_provider_client")
    def test_paid_fallback_requires_explicit_setting(self, create_client):
        self.model(self.zen, "free-primary", is_primary=True)
        self.model(self.openai, "paid-secondary", is_free=False, is_primary=True)
        failing = Mock()
        failing.generate.side_effect = AIProviderError("indisponível")
        paid = Mock()
        paid.generate.return_value = generated("paid-secondary", "openai")
        create_client.side_effect = [failing, paid]

        answer = AIProviderRouter().generate(
            user=SimpleNamespace(), conversation=SimpleNamespace(), question="Teste", history=[]
        )
        self.assertEqual(answer.provider, "openai")
        self.assertEqual(len(answer.attempts), 2)

    @override_settings(
        AI_DEFAULT_PROVIDER="opencode_zen",
        OPENCODE_ZEN_MODEL="legacy-free-model",
    )
    @patch("apps.ai_assistant.services.provider_factory.create_provider_client")
    def test_legacy_configuration_is_used_before_first_catalog_sync(self, create_client):
        AIModel.objects.all().delete()
        client = Mock()
        client.generate.return_value = generated("legacy-free-model", "opencode_zen")
        create_client.return_value = client
        answer = AIProviderRouter().generate(
            user=SimpleNamespace(), conversation=SimpleNamespace(), question="Teste", history=[]
        )
        self.assertEqual(answer.model, "legacy-free-model")
        create_client.assert_called_once_with(
            "opencode_zen", model="legacy-free-model", endpoint_type="chat_completions"
        )

    @patch("apps.ai_assistant.services.provider_factory.create_provider_client")
    def test_invalid_credentials_fall_back_without_recording_exception_text(self, create_client):
        self.model(self.zen, "free-primary", is_primary=True, priority=10)
        self.model(self.zen, "free-fallback", priority=20)
        fallback = Mock()
        fallback.generate.return_value = generated("free-fallback", "opencode_zen")
        create_client.side_effect = [
            AIConfigurationError("secret credential path"),
            fallback,
        ]
        answer = AIProviderRouter().generate(
            user=SimpleNamespace(), conversation=SimpleNamespace(), question="Teste", history=[]
        )
        self.assertEqual(answer.attempts[0]["status"], "configuration_error")
        self.assertNotIn("secret", str(answer.attempts))

    @patch("apps.ai_assistant.services.provider_factory.create_provider_client")
    def test_moderation_falls_back_when_first_provider_is_unavailable(self, create_client):
        self.model(self.zen, "free-primary", is_primary=True, priority=10)
        self.model(self.zen, "free-fallback", priority=20)
        first = Mock()
        first.moderate.side_effect = AIProviderError("offline")
        second = Mock()
        second.moderate.return_value = {"flagged": False, "categories": {}, "mode": "test"}
        create_client.side_effect = [first, second]
        result = AIProviderRouter().moderate("texto seguro")
        self.assertFalse(result["flagged"])
        self.assertEqual(create_client.call_count, 2)
