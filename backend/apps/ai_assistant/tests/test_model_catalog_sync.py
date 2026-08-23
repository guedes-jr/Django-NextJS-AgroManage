from decimal import Decimal
from unittest.mock import Mock

from django.test import TestCase

from apps.ai_assistant.models import AIModel, AIModelSyncRun, AIProviderConfiguration
from apps.ai_assistant.services.model_catalog import sync_opencode_zen_models
from apps.ai_assistant.services.providers import AIProviderError, ProviderModel


class AIModelCatalogSyncTests(TestCase):
    def provider_client(self, models):
        client = Mock()
        client.list_models.return_value = models
        return client

    def test_sync_creates_free_and_paid_models_from_explicit_prices(self):
        result = sync_opencode_zen_models(
            provider_client=self.provider_client(
                [
                    ProviderModel(
                        external_id="free-one",
                        display_name="Free One",
                        metadata={
                            "pricing": {"input": 0, "output": "free"},
                            "capabilities": ["streaming", "tools"],
                            "context_window": 128000,
                        },
                    ),
                    ProviderModel(
                        external_id="paid-one",
                        display_name="Paid One",
                        metadata={"pricing": {"input": "0.10", "output": "0.50"}},
                    ),
                    ProviderModel(
                        external_id="free-in-name-only",
                        display_name="Unknown Price",
                        metadata={},
                    ),
                ]
            )
        )
        self.assertEqual(result.models_found, 3)
        self.assertEqual(result.free_models_found, 1)
        free_model = AIModel.objects.get(external_id="free-one")
        self.assertTrue(free_model.is_free)
        self.assertTrue(free_model.is_enabled)
        self.assertEqual(free_model.input_price, Decimal("0"))
        self.assertTrue(free_model.supports_tools)
        self.assertEqual(free_model.context_window, 128000)
        self.assertFalse(AIModel.objects.get(external_id="paid-one").is_enabled)
        self.assertFalse(AIModel.objects.get(external_id="free-in-name-only").is_free)

    def test_sync_preserves_manual_disable_for_existing_free_model(self):
        first_catalog = [
            ProviderModel("free-one", "Free One", {"pricing": {"input": 0, "output": 0}})
        ]
        sync_opencode_zen_models(provider_client=self.provider_client(first_catalog))
        AIModel.objects.filter(external_id="free-one").update(is_enabled=False)
        sync_opencode_zen_models(provider_client=self.provider_client(first_catalog))
        self.assertFalse(AIModel.objects.get(external_id="free-one").is_enabled)

    def test_missing_model_becomes_unavailable_without_being_deleted(self):
        initial = [
            ProviderModel("free-a", "Free A", {"pricing": {"input": 0, "output": 0}}),
            ProviderModel("free-b", "Free B", {"pricing": {"input": 0, "output": 0}}),
        ]
        sync_opencode_zen_models(provider_client=self.provider_client(initial))
        result = sync_opencode_zen_models(
            provider_client=self.provider_client(initial[:1])
        )
        removed = AIModel.objects.get(external_id="free-b")
        self.assertFalse(removed.is_available)
        self.assertFalse(removed.is_enabled)
        self.assertEqual(result.models_unavailable, 1)

    def test_failed_sync_keeps_last_valid_catalog(self):
        initial = [ProviderModel("free-a", "Free A", {"pricing": {"input": 0, "output": 0}})]
        sync_opencode_zen_models(provider_client=self.provider_client(initial))
        failing_client = Mock()
        failing_client.list_models.side_effect = AIProviderError("Falha controlada")
        with self.assertRaises(AIProviderError):
            sync_opencode_zen_models(provider_client=failing_client)
        model = AIModel.objects.get(external_id="free-a")
        self.assertTrue(model.is_available)
        self.assertEqual(AIModelSyncRun.objects.filter(status="failure").count(), 1)
        provider = AIProviderConfiguration.objects.get(provider="opencode_zen")
        self.assertEqual(provider.last_health_status, provider.HealthStatus.UNAVAILABLE)

    def test_empty_catalog_is_failure_and_does_not_invalidate_models(self):
        initial = [ProviderModel("free-a", "Free A", {"pricing": {"input": 0, "output": 0}})]
        sync_opencode_zen_models(provider_client=self.provider_client(initial))
        with self.assertRaisesMessage(AIProviderError, "catálogo vazio"):
            sync_opencode_zen_models(provider_client=self.provider_client([]))
        self.assertTrue(AIModel.objects.get(external_id="free-a").is_available)

    def test_model_that_becomes_paid_is_disabled_and_loses_primary_status(self):
        free = [ProviderModel("changing", "Changing", {"pricing": {"input": 0, "output": 0}})]
        sync_opencode_zen_models(provider_client=self.provider_client(free))
        AIModel.objects.filter(external_id="changing").update(is_primary=True)
        paid = [
            ProviderModel(
                "changing", "Changing", {"pricing": {"input": "0.10", "output": "0.90"}}
            )
        ]
        sync_opencode_zen_models(provider_client=self.provider_client(paid))
        model = AIModel.objects.get(external_id="changing")
        self.assertFalse(model.is_free)
        self.assertFalse(model.is_enabled)
        self.assertFalse(model.is_primary)

    def test_malformed_or_negative_prices_never_mark_model_as_free(self):
        catalog = [
            ProviderModel("malformed", "Malformed", {"pricing": {"input": "?", "output": 0}}),
            ProviderModel("negative", "Negative", {"pricing": {"input": -1, "output": -1}}),
        ]
        result = sync_opencode_zen_models(provider_client=self.provider_client(catalog))
        self.assertEqual(result.free_models_found, 0)
        self.assertFalse(AIModel.objects.get(external_id="malformed").is_free)
        self.assertFalse(AIModel.objects.get(external_id="negative").is_free)

    def test_duplicate_provider_ids_are_deduplicated_before_persistence(self):
        duplicate = ProviderModel("same-id", "Same", {"pricing": {"input": 0, "output": 0}})
        result = sync_opencode_zen_models(
            provider_client=self.provider_client([duplicate, duplicate])
        )
        self.assertEqual(result.models_found, 1)
        self.assertEqual(result.free_models_found, 1)
        self.assertEqual(AIModel.objects.filter(external_id="same-id").count(), 1)
