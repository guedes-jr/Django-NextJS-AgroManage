from datetime import time

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.organizations.models import Organization
from apps.reports.models import FrequencyType, ReportConfig, ReportSchedule, ReportType

User = get_user_model()


class ReportsTenantIsolationTestCase(APITestCase):
    def setUp(self):
        self.org_a = Organization.objects.create(name="Relatórios A", slug="reports-a-isolation")
        self.org_b = Organization.objects.create(name="Relatórios B", slug="reports-b-isolation")
        self.user_a = User.objects.create_user(
            email="reports-a@example.com", password="Password-8472", full_name="Relatórios A", organization=self.org_a
        )
        self.config_a = ReportConfig.objects.create(
            organization=self.org_a, name="Config A", report_type=ReportType.DASHBOARD, created_by=self.user_a
        )
        self.config_b = ReportConfig.objects.create(
            organization=self.org_b, name="Config B", report_type=ReportType.DASHBOARD
        )
        self.schedule_b = ReportSchedule.objects.create(
            organization=self.org_b,
            report_config=self.config_b,
            name="Agenda B",
            frequency=FrequencyType.DAILY,
            schedule_time=time(8, 0),
        )
        self.client.force_authenticate(self.user_a)

    def test_schedule_list_and_detail_hide_foreign_tenant(self):
        response = self.client.get(reverse("report-schedule-list"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn(str(self.schedule_b.id), {str(item["id"]) for item in response.data["results"]})
        detail = self.client.get(reverse("report-schedule-detail", args=[self.schedule_b.id]))
        self.assertEqual(detail.status_code, status.HTTP_404_NOT_FOUND)

    def test_rejects_schedule_with_foreign_config(self):
        response = self.client.post(
            reverse("report-schedule-list"),
            {
                "name": "Agenda externa",
                "report_config": self.config_b.id,
                "frequency": FrequencyType.DAILY,
                "schedule_time": "08:00:00",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_rejects_generation_with_foreign_config(self):
        response = self.client.post(
            reverse("generated-report-generate"),
            {"name": "Relatório externo", "report_type": ReportType.DASHBOARD, "report_config": self.config_b.id},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_operator_edits_only_own_report_config_and_cannot_delete(self):
        other = User.objects.create_user(
            email="reports-other@example.com", password="Password-8472", full_name="Outro",
            organization=self.org_a, role=User.Role.OPERATOR,
        )
        other_config = ReportConfig.objects.create(
            organization=self.org_a, name="Config Outro", report_type=ReportType.FINANCE_CASHFLOW,
            created_by=other,
        )

        self.assertEqual(
            self.client.patch(
                reverse("report-config-detail", args=[self.config_a.id]), {"description": "Própria"},
                format="json",
            ).status_code,
            status.HTTP_200_OK,
        )
        self.assertEqual(
            self.client.patch(
                reverse("report-config-detail", args=[other_config.id]), {"description": "Negada"},
                format="json",
            ).status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            self.client.delete(reverse("report-config-detail", args=[self.config_a.id])).status_code,
            status.HTTP_403_FORBIDDEN,
        )
