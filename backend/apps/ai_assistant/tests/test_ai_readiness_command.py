from io import StringIO

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings
from django.utils import timezone

from apps.ai_assistant.models import AIModel, AIModelSyncRun, AIProviderConfiguration


class AIReadinessCommandTests(TestCase):
    @override_settings(AI_DEFAULT_PROVIDER="opencode_zen", OPENCODE_ZEN_API_KEY="")
    def test_strict_mode_fails_without_credentials_or_catalog(self):
        with self.assertRaises(CommandError):
            call_command("check_ai_readiness", strict=True, stdout=StringIO())

    @override_settings(AI_DEFAULT_PROVIDER="opencode_zen", OPENCODE_ZEN_API_KEY="test-key")
    def test_strict_mode_passes_with_recent_valid_catalog(self):
        provider = AIProviderConfiguration.objects.create(
            provider="opencode_zen", display_name="OpenCode Zen",
            base_url="https://opencode.ai/zen/v1", is_enabled=True, is_default=True,
        )
        AIModel.objects.create(
            provider=provider, external_id="free-ready", display_name="Free Ready",
            is_free=True, is_available=True, is_enabled=True, is_primary=True,
        )
        now = timezone.now()
        AIModelSyncRun.objects.create(
            provider=provider, status=AIModelSyncRun.Status.SUCCESS,
            started_at=now, finished_at=now, models_found=1, free_models_found=1,
        )
        output = StringIO()
        call_command("check_ai_readiness", strict=True, stdout=output)
        self.assertIn("Assistente IA pronto para operação", output.getvalue())
