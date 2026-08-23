from django.test import SimpleTestCase, override_settings

from apps.ai_assistant.services.provider_factory import get_ai_provider
from apps.ai_assistant.services.provider_router import AIProviderRouter
from apps.ai_assistant.services.providers import AIConfigurationError, AIProvider, OpenAIProvider


class AIProviderFactoryTests(SimpleTestCase):
    @override_settings(AI_DEFAULT_PROVIDER="unknown")
    def test_unknown_provider_has_clear_configuration_error(self):
        with self.assertRaisesMessage(AIConfigurationError, "não está disponível"):
            get_ai_provider("unknown")

    @override_settings(AI_DEFAULT_PROVIDER="openai", OPENAI_API_KEY="test-key")
    def test_default_provider_implements_provider_contract(self):
        provider = get_ai_provider()
        self.assertIsInstance(provider, AIProvider)
        self.assertIsInstance(provider, AIProviderRouter)
        concrete = get_ai_provider("openai")
        self.assertIsInstance(concrete, OpenAIProvider)
