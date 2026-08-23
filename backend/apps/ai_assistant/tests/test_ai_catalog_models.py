from decimal import Decimal

from django.db import IntegrityError, transaction
from django.test import TestCase
from django.utils import timezone

from apps.ai_assistant.models import AIModel, AIModelSyncRun, AIProviderConfiguration


class AICatalogModelTests(TestCase):
    def setUp(self):
        self.provider = AIProviderConfiguration.objects.create(
            provider="opencode_zen",
            display_name="OpenCode Zen",
            base_url="https://opencode.ai/zen/v1",
            api_key_env_var="OPENCODE_ZEN_API_KEY",
            is_enabled=True,
            is_default=True,
        )

    def test_provider_does_not_store_secret_value(self):
        self.assertEqual(self.provider.api_key_env_var, "OPENCODE_ZEN_API_KEY")
        self.assertFalse(hasattr(self.provider, "api_key"))

    def test_model_is_unique_within_provider(self):
        AIModel.objects.create(
            provider=self.provider,
            external_id="free-model",
            display_name="Free Model",
            is_free=True,
            input_price=Decimal("0"),
            output_price=Decimal("0"),
        )
        with self.assertRaises(IntegrityError), transaction.atomic():
            AIModel.objects.create(
                provider=self.provider,
                external_id="free-model",
                display_name="Duplicated",
            )

    def test_only_one_primary_model_is_allowed_per_provider(self):
        AIModel.objects.create(
            provider=self.provider,
            external_id="primary-one",
            display_name="Primary One",
            is_primary=True,
        )
        with self.assertRaises(IntegrityError), transaction.atomic():
            AIModel.objects.create(
                provider=self.provider,
                external_id="primary-two",
                display_name="Primary Two",
                is_primary=True,
            )

    def test_sync_run_keeps_catalog_audit_summary(self):
        run = AIModelSyncRun.objects.create(
            provider=self.provider,
            status=AIModelSyncRun.Status.SUCCESS,
            trigger=AIModelSyncRun.Trigger.MANUAL,
            started_at=timezone.now(),
            finished_at=timezone.now(),
            models_found=3,
            free_models_found=2,
            added_model_ids=["model-a", "model-b"],
            response_summary={"source": "models_endpoint"},
        )
        self.assertEqual(run.free_models_found, 2)
        self.assertEqual(run.added_model_ids, ["model-a", "model-b"])
