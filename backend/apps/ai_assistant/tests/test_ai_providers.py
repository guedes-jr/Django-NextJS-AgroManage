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


class AIPromptLanguageTests(SimpleTestCase):
    def test_domain_and_support_prompts_use_the_organization_language(self):
        from apps.ai_assistant.services.prompt import build_system_prompt

        for subject in ["general", "crops", "livestock", "support"]:
            for language, name in [("pt-BR", "português brasileiro"), ("en", "inglês"), ("es", "espanhol"), ("pt-PT", "português de Portugal")]:
                with self.subTest(subject=subject, language=language):
                    prompt = build_system_prompt(subject=subject, language=language, authorized_context="Contexto autorizado")
                    self.assertIn(f"Responda em {name}", prompt)
                    if language != "pt-BR":
                        self.assertNotIn("Responda em português brasileiro", prompt)
                    self.assertIn("Contexto autorizado", prompt)
                    self.assertIn("não confiáveis", prompt)

    def test_unsupported_language_keeps_brazilian_portuguese_as_default(self):
        from apps.ai_assistant.services.prompt import build_system_prompt

        self.assertIn("Responda em português brasileiro", build_system_prompt(language="fr"))
