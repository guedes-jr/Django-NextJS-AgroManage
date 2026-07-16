from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.audit.models import AuditLog
from apps.farms.models import Farm
from apps.organizations.models import Organization
from apps.tasks.models import Task

User = get_user_model()


class TaskTenantIsolationTestCase(APITestCase):
    def setUp(self):
        self.org_a = Organization.objects.create(name="Tarefas A", slug="tasks-a-isolation")
        self.org_b = Organization.objects.create(name="Tarefas B", slug="tasks-b-isolation")
        self.user_a = User.objects.create_user(
            email="tasks-a@example.com", password="Password-8472", full_name="Tarefas A", organization=self.org_a
        )
        self.user_b = User.objects.create_user(
            email="tasks-b@example.com", password="Password-8472", full_name="Tarefas B", organization=self.org_b
        )
        self.farm_a = Farm.objects.create(organization=self.org_a, name="Fazenda A")
        self.farm_b = Farm.objects.create(organization=self.org_b, name="Fazenda B")
        self.task_b = Task.objects.create(
            organization=self.org_b, farm=self.farm_b, title="Tarefa B", created_by=self.user_b
        )
        self.client.force_authenticate(self.user_a)

    def test_list_and_detail_hide_foreign_tasks(self):
        response = self.client.get(reverse("task-list"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn(str(self.task_b.id), {str(item["id"]) for item in response.data["results"]})
        detail = self.client.get(reverse("task-detail", args=[self.task_b.id]))
        self.assertEqual(detail.status_code, status.HTTP_404_NOT_FOUND)

    def test_rejects_foreign_farm_and_assignee(self):
        cases = [{"farm": self.farm_b.id}, {"assigned_to": self.user_b.id}]
        for changes in cases:
            with self.subTest(changes=changes):
                payload = {"title": "Tentativa externa", **changes}
                response = self.client.post(reverse("task-list"), payload, format="json")
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_task_records_scoped_audit_log(self):
        response = self.client.post(
            reverse("task-list"), {"title": "Tarefa válida", "farm": self.farm_a.id}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        log = AuditLog.objects.get(model_name="Task", object_id=str(response.data["id"]))
        self.assertEqual(log.organization, self.org_a)
        self.assertEqual(log.user, self.user_a)

    def test_viewer_is_read_only_and_operator_cannot_delete(self):
        viewer = User.objects.create_user(
            email="tasks-viewer@example.com", password="Password-8472", full_name="Viewer",
            organization=self.org_a, role=User.Role.VIEWER,
        )
        self.client.force_authenticate(viewer)
        self.assertEqual(self.client.get(reverse("task-list")).status_code, status.HTTP_200_OK)
        self.assertEqual(
            self.client.post(reverse("task-list"), {"title": "Negada"}, format="json").status_code,
            status.HTTP_403_FORBIDDEN,
        )

        operator = User.objects.create_user(
            email="tasks-operator@example.com", password="Password-8472", full_name="Operator",
            organization=self.org_a, role=User.Role.OPERATOR,
        )
        task = Task.objects.create(organization=self.org_a, title="Operacional", created_by=self.user_a)
        self.client.force_authenticate(operator)
        self.assertEqual(
            self.client.post(reverse("task-list"), {"title": "Permitida"}, format="json").status_code,
            status.HTTP_201_CREATED,
        )
        own_task = Task.objects.get(title="Permitida")
        self.assertEqual(
            self.client.patch(
                reverse("task-detail", args=[own_task.id]), {"title": "Editada"}, format="json"
            ).status_code,
            status.HTTP_200_OK,
        )
        self.assertEqual(
            self.client.patch(
                reverse("task-detail", args=[task.id]), {"title": "Negada"}, format="json"
            ).status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            self.client.delete(reverse("task-detail", args=[task.id])).status_code,
            status.HTTP_403_FORBIDDEN,
        )
