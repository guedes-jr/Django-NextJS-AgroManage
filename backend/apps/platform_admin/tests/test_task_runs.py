from types import SimpleNamespace
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.platform_admin.models import BackgroundTaskRun, PlatformStaffProfile

User = get_user_model()


class PlatformTaskRunAPITestCase(APITestCase):
    def setUp(self):
        self.developer = User.objects.create_user(email="jobs@platform.local", password="DevPassword-8472", full_name="Jobs Dev")
        PlatformStaffProfile.objects.create(user=self.developer, role=PlatformStaffProfile.Role.DEVELOPER)
        self.client.force_authenticate(user=self.developer)
        self.run = BackgroundTaskRun.objects.create(
            task_id="failed-task-1",
            task_name="apps.notifications.tasks.send_daily_notifications_digest",
            status=BackgroundTaskRun.Status.FAILURE,
            error_class="RuntimeError",
            error_message="sanitized failure",
        )

    def test_developer_lists_failed_tasks(self):
        response = self.client.get(reverse("platform-task-run-list"), {"status": "failure"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertTrue(response.data["results"][0]["can_retry"])

    @patch("apps.platform_admin.views.current_app.send_task", return_value=SimpleNamespace(id="retry-task-1"))
    def test_retries_only_allowlisted_task(self, send_task):
        response = self.client.post(reverse("platform-task-run-retry", args=[self.run.id]))
        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        send_task.assert_called_once_with(self.run.task_name)
        retry = BackgroundTaskRun.objects.get(task_id="retry-task-1")
        self.assertEqual(retry.retry_of, self.run)
        self.assertEqual(retry.triggered_by, self.developer)

    def test_rejects_non_allowlisted_task(self):
        self.run.task_name = "dangerous.arbitrary.task"
        self.run.save(update_fields=["task_name", "updated_at"])
        response = self.client.post(reverse("platform-task-run-retry", args=[self.run.id]))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
