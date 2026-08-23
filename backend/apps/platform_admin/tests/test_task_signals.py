from types import SimpleNamespace

from django.test import TestCase

from apps.platform_admin.models import BackgroundTaskRun
from apps.platform_admin.task_signals import task_retried


class BackgroundTaskSignalTests(TestCase):
    def test_retry_signal_marks_operational_run_for_retry(self):
        task_retried(
            request=SimpleNamespace(id="catalog-task-retry-1"),
            reason=RuntimeError("temporary provider error"),
            sender=SimpleNamespace(name="apps.ai_assistant.tasks.sync_opencode_zen_models_task"),
        )
        run = BackgroundTaskRun.objects.get(task_id="catalog-task-retry-1")
        self.assertEqual(run.status, BackgroundTaskRun.Status.RETRY)
        self.assertEqual(run.error_class, "RuntimeError")
