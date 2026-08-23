from types import SimpleNamespace
from unittest.mock import patch

from django.conf import settings
from django.test import SimpleTestCase

from apps.ai_assistant.models import AIModelSyncRun
from apps.ai_assistant.tasks import sync_opencode_zen_models_task


class AIModelCatalogTaskTests(SimpleTestCase):
    @patch("apps.ai_assistant.tasks.sync_opencode_zen_models")
    def test_task_uses_scheduled_trigger_and_returns_serializable_summary(self, sync):
        sync.return_value = SimpleNamespace(
            run_id="run-123",
            models_found=5,
            free_models_found=3,
            models_created=2,
            models_updated=3,
            models_unavailable=1,
        )
        result = sync_opencode_zen_models_task.run()
        sync.assert_called_once_with(trigger=AIModelSyncRun.Trigger.SCHEDULED)
        self.assertEqual(result["free_models_found"], 3)
        self.assertEqual(result["run_id"], "run-123")

    def test_task_has_bounded_automatic_retries(self):
        self.assertEqual(sync_opencode_zen_models_task.max_retries, 3)
        self.assertEqual(sync_opencode_zen_models_task.retry_backoff, 60)
        self.assertEqual(sync_opencode_zen_models_task.retry_backoff_max, 900)
        self.assertTrue(sync_opencode_zen_models_task.retry_jitter)

    def test_weekly_schedule_points_to_catalog_task(self):
        entry = settings.CELERY_BEAT_SCHEDULE["sync-opencode-zen-models-weekly"]
        self.assertEqual(entry["task"], sync_opencode_zen_models_task.name)
        self.assertEqual(str(entry["schedule"]), "<crontab: 0 3 * * monday (m/h/dM/MY/d)>")
