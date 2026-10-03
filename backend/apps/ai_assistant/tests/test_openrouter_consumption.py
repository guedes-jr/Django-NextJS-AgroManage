from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import Mock

from django.test import TestCase

from apps.ai_assistant.models import AIModel, AIProviderConfiguration
from apps.ai_assistant.services.consumption import openrouter_cost
from apps.ai_assistant.services.provider_router import AIProviderRouter
from apps.ai_assistant.services.providers import OpenRouterProvider


class OpenRouterConsumptionTests(TestCase):
    def setUp(self):
        self.provider = AIProviderConfiguration.objects.create(
            provider="openrouter", display_name="OpenRouter", base_url="https://openrouter.ai/api/v1",
            is_enabled=True, is_default=True,
        )

    def model(self, name, *, free=True, primary=False, priority=100):
        return AIModel.objects.create(
            provider=self.provider, external_id=name, display_name=name, is_free=free,
            is_primary=primary, is_enabled=True, priority=priority,
            input_price=0 if free else Decimal("0.000001"),
            output_price=0 if free else Decimal("0.000002"),
        )

    def test_free_priority_and_paid_permission_override_paid_primary_choice(self):
        self.model("paid-primary", free=False, primary=True)
        self.model("free-one")
        self.assertEqual([item.model_id for item in AIProviderRouter()._candidates()], ["free-one"])
        self.provider.allow_paid_models = True
        self.provider.save()
        self.assertEqual([item.model_id for item in AIProviderRouter()._candidates()], ["free-one", "paid-primary"])
        self.provider.prefer_free_models = False
        self.provider.save()
        self.assertEqual(AIProviderRouter()._candidates()[0].model_id, "paid-primary")

    def test_attempt_cap_preserves_explicit_paid_fallback_after_free_models(self):
        for name in ["free-a", "free-b", "free-c", "free-d"]:
            self.model(name)
        self.model("paid-one", free=False)
        self.provider.allow_paid_models = True
        self.provider.max_model_attempts = 3
        self.provider.save()
        candidates = AIProviderRouter()._candidates()
        self.assertEqual(len(candidates), 3)
        self.assertTrue(candidates[0].is_free)
        self.assertTrue(candidates[1].is_free)
        self.assertFalse(candidates[2].is_free)

    def test_reported_cost_and_cache_metrics_are_captured_with_request_guards(self):
        client = Mock()
        client.chat.completions.create.return_value = SimpleNamespace(
            id="test", model="resolved/model", choices=[SimpleNamespace(message=SimpleNamespace(content="OK"))],
            usage=SimpleNamespace(prompt_tokens=100, completion_tokens=40, cost=0.000000123,
                                  prompt_tokens_details={"cached_tokens": 70},
                                  completion_tokens_details={"reasoning_tokens": 20}),
        )
        answer = OpenRouterProvider(client=client, model="openrouter/free", max_output_tokens=500).generate(
            user=None, conversation=SimpleNamespace(subject="general"), question="Teste", history=[],
        )
        self.assertEqual(answer.cost_usd, Decimal("0.000000123"))
        self.assertEqual(answer.cost_source, "reported")
        self.assertEqual(answer.cached_tokens, 70)
        self.assertEqual(answer.reasoning_tokens, 20)
        self.assertEqual(answer.requested_model, "openrouter/free")
        request = client.chat.completions.create.call_args.kwargs
        self.assertEqual(request["max_tokens"], 500)
        self.assertEqual(request["extra_body"]["provider"]["max_price"], {"prompt": 0, "completion": 0})
        self.assertTrue(request["extra_body"]["usage"]["include"])

    def test_cost_missing_uses_catalog_snapshot_and_never_fabricates_historical_zero(self):
        self.model("paid", free=False)
        cost, source = openrouter_cost(None, model="paid", input_tokens=100, output_tokens=50, cached_tokens=0)
        self.assertEqual(cost, Decimal("0.000200"))
        self.assertEqual(source, "estimated")
        for usage in [None, {"cost": "NaN"}, {"cost": -1}]:
            self.assertEqual(openrouter_cost(usage, model="unknown", input_tokens=1, output_tokens=1, cached_tokens=0), (None, "unknown"))
        self.assertEqual(openrouter_cost(None, model="paid", input_tokens=100, output_tokens=50, cached_tokens=70), (None, "unknown"))
        self.assertEqual(openrouter_cost({"cost": 0}, model="unknown", input_tokens=1, output_tokens=1, cached_tokens=0), (Decimal(0), "reported"))
