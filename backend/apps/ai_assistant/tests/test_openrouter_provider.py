from types import SimpleNamespace
from unittest.mock import Mock, patch

from django.test import TestCase, override_settings

from apps.ai_assistant.models import AIModel, AIProviderConfiguration
from apps.ai_assistant.services.model_catalog import sync_openrouter_models
from apps.ai_assistant.services.provider_factory import create_provider_client
from apps.ai_assistant.services.provider_router import AIProviderRouter
from apps.ai_assistant.services.providers import (
    AIConfigurationError,
    AIProviderError,
    OpenRouterProvider,
)
from apps.ai_assistant.tasks import sync_openrouter_models_task


class OpenRouterTests(TestCase):
    def make_client(self):
        client = Mock()
        client.chat.completions.create.return_value = SimpleNamespace(
            id="router-answer",
            model="vendor/model:free",
            choices=[
                SimpleNamespace(message=SimpleNamespace(content=" Resposta real. "))
            ],
            usage=SimpleNamespace(prompt_tokens=12, completion_tokens=5),
        )
        client.models.list.return_value = SimpleNamespace(
            data=[
                {
                    "id": "vendor/model:free",
                    "name": "Free model",
                    "architecture": {"output_modalities": ["text"]},
                    "pricing": {"prompt": "0", "completion": "0", "request": "0"},
                    "context_length": 32000,
                    "supported_parameters": ["tools"],
                },
                {
                    "id": "vendor/paid",
                    "pricing": {"prompt": "0.001", "completion": "0.002"},
                },
                {
                    "id": "vendor/request-fee",
                    "pricing": {"prompt": "0", "completion": "0", "request": "1"},
                },
                {"id": "vendor/unknown:free"},
                {
                    "id": "vendor/image",
                    "architecture": {"output_modalities": ["image"]},
                },
            ]
        )
        return client

    @override_settings(OPENROUTER_API_KEY="")
    def test_missing_key_has_configuration_error(self):
        with self.assertRaisesMessage(AIConfigurationError, "chave do OpenRouter"):
            OpenRouterProvider()

    @override_settings(OPENROUTER_MAX_OUTPUT_TOKENS=800)
    def test_generation_uses_chat_api_and_support_prompt_with_authorized_context(self):
        client = self.make_client()
        answer = OpenRouterProvider(client=client, model="vendor/model:free").generate(
            user=SimpleNamespace(),
            conversation=SimpleNamespace(subject="support"),
            question="Como cadastrar?",
            history=[],
            context="Guia autorizado",
        )
        self.assertEqual(answer.text, "Resposta real.")
        self.assertEqual(answer.provider, "openrouter")
        self.assertEqual(answer.input_tokens, 12)
        request = client.chat.completions.create.call_args.kwargs
        self.assertEqual(request["model"], "vendor/model:free")
        self.assertEqual(request["max_tokens"], 800)
        self.assertIn("Guia autorizado", request["messages"][0]["content"])
        self.assertIn(
            "Ajude exclusivamente a usar o sistema", request["messages"][0]["content"]
        )
        self.assertEqual(request["messages"][-1]["content"], "Como cadastrar?")

    def test_catalog_import_enables_only_explicitly_free_text_models(self):
        provider = OpenRouterProvider(client=self.make_client())
        result = sync_openrouter_models(provider_client=provider)
        self.assertEqual(result.models_found, 4)
        self.assertEqual(result.free_models_found, 1)
        free = AIModel.objects.get(external_id="vendor/model:free")
        self.assertTrue(free.is_enabled)
        self.assertTrue(free.supports_tools)
        self.assertEqual(free.context_window, 32000)
        self.assertFalse(AIModel.objects.filter(external_id="vendor/image").exists())
        for name in ["vendor/paid", "vendor/request-fee", "vendor/unknown:free"]:
            self.assertFalse(AIModel.objects.get(external_id=name).is_enabled)
        self.assertFalse(free.provider.is_enabled)

    def test_api_error_details_are_never_exposed(self):
        client = self.make_client()
        error = RuntimeError("private credential and upstream details")
        error.status_code = 429
        client.chat.completions.create.side_effect = error
        with self.assertRaisesMessage(
            AIProviderError, "limite de requisições"
        ) as caught:
            OpenRouterProvider(client=client).generate(
                user=SimpleNamespace(),
                conversation=SimpleNamespace(),
                question="Teste",
                history=[],
            )
        self.assertNotIn("private", str(caught.exception))

    def test_sync_preserves_admin_paid_choice_but_disables_newly_paid_free_model(self):
        client = self.make_client()
        provider = OpenRouterProvider(client=client)
        sync_openrouter_models(provider_client=provider)
        paid = AIModel.objects.get(external_id="vendor/paid")
        paid.is_enabled = True
        paid.is_primary = True
        paid.save()
        sync_openrouter_models(provider_client=provider)
        paid.refresh_from_db()
        self.assertTrue(paid.is_enabled)
        self.assertTrue(paid.is_primary)
        client.models.list.return_value.data[0]["pricing"]["prompt"] = "0.001"
        sync_openrouter_models(provider_client=provider)
        free = AIModel.objects.get(external_id="vendor/model:free")
        self.assertFalse(free.is_enabled)
        self.assertFalse(free.is_free)

    @override_settings(OPENROUTER_API_KEY="environment-key")
    def test_admin_key_takes_precedence_and_timeout_is_used(self):
        factory = Mock()
        provider = AIProviderConfiguration.objects.create(
            provider="openrouter",
            display_name="OpenRouter",
            base_url="https://openrouter.ai/api/v1",
            timeout_seconds=30,
        )
        provider.set_api_key("admin-key")
        provider.save()
        with patch.dict(
            "apps.ai_assistant.services.provider_factory.PROVIDER_FACTORIES",
            {"openrouter": factory},
        ):
            create_provider_client("openrouter", model="vendor/model:free")
        factory.assert_called_once_with(
            model="vendor/model:free", api_key="admin-key", timeout=30,
            max_output_tokens=1200, allow_paid_models=False,
        )

    @override_settings(AI_DEFAULT_PROVIDER="openai", OPENROUTER_MODEL="openrouter/free")
    def test_empty_catalog_uses_openrouter_selected_in_admin(self):
        AIProviderConfiguration.objects.create(
            provider="openrouter",
            display_name="OpenRouter",
            base_url="https://openrouter.ai/api/v1",
            is_enabled=True,
            is_default=True,
        )
        candidate = AIProviderRouter()._candidates()[0]
        self.assertEqual(candidate.provider_id, "openrouter")
        self.assertEqual(candidate.model_id, "openrouter/free")
        self.assertEqual(candidate.endpoint_type, "chat_completions")

    @patch("apps.ai_assistant.tasks.sync_openrouter_models")
    def test_scheduled_task_skips_disabled_provider(self, sync):
        self.assertEqual(sync_openrouter_models_task.run(), {"status": "disabled"})
        sync.assert_not_called()
