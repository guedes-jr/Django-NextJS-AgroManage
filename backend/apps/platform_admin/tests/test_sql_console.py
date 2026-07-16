from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.platform_admin.models import PlatformStaffProfile, SqlQueryExecution
from apps.platform_admin.sql_console import UnsafeQuery, validate_readonly_query

User = get_user_model()


class SqlConsolePolicyTestCase(APITestCase):
    def test_rejects_writes_multiple_statements_and_sensitive_functions(self):
        unsafe = [
            "DELETE FROM accounts_user",
            "SELECT 1; SELECT 2",
            "WITH removed AS (DELETE FROM accounts_user RETURNING *) SELECT * FROM removed",
            "SELECT pg_read_file('/etc/passwd')",
            "SELECT pg_sleep(10)",
        ]
        for query in unsafe:
            with self.subTest(query=query), self.assertRaises(UnsafeQuery):
                validate_readonly_query(query)

    def test_developer_executes_limited_select_and_history_redacts_literals(self):
        developer = User.objects.create_user(email="sql@platform.local", password="SqlPassword-8472", full_name="SQL Dev")
        PlatformStaffProfile.objects.create(user=developer, role=PlatformStaffProfile.Role.DEVELOPER)
        self.client.force_authenticate(user=developer)

        response = self.client.post(
            reverse("platform-sql-execute"), {"query": "SELECT 'secret-value' AS value, 1 AS number"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["columns"], ["value", "number"])
        self.assertEqual(response.data["rows"][0], ["secret-value", 1])
        history = SqlQueryExecution.objects.get(pk=response.data["execution_id"])
        self.assertNotIn("secret-value", history.query_text)
        self.assertIn("'?'", history.query_text)

    def test_support_cannot_access_sql_console(self):
        support = User.objects.create_user(email="no-sql@platform.local", password="SupportPassword-8472", full_name="Support")
        PlatformStaffProfile.objects.create(user=support, role=PlatformStaffProfile.Role.SUPPORT)
        self.client.force_authenticate(user=support)
        response = self.client.post(reverse("platform-sql-execute"), {"query": "SELECT 1"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_developer_can_explain_select_without_analyze(self):
        developer = User.objects.create_user(email="explain@platform.local", password="SqlPassword-8472", full_name="Explain Dev")
        PlatformStaffProfile.objects.create(user=developer, role=PlatformStaffProfile.Role.DEVELOPER)
        self.client.force_authenticate(user=developer)

        response = self.client.post(reverse("platform-sql-explain"), {"query": "SELECT 1 AS number"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["database"], "sqlite")
        self.assertTrue(response.data["plan"])
        history = SqlQueryExecution.objects.get(pk=response.data["execution_id"])
        self.assertTrue(history.query_text.startswith("explain:SELECT"))

    def test_explain_reuses_readonly_policy(self):
        developer = User.objects.create_user(email="blocked@platform.local", password="SqlPassword-8472", full_name="Blocked Dev")
        PlatformStaffProfile.objects.create(user=developer, role=PlatformStaffProfile.Role.DEVELOPER)
        self.client.force_authenticate(user=developer)

        response = self.client.post(
            reverse("platform-sql-explain"), {"query": "DELETE FROM organizations_organization"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
