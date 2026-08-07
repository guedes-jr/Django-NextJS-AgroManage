from datetime import timedelta

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.platform_admin.models import DemoRequest, PlatformAuditLog, PlatformStaffProfile

User = get_user_model()


class DemoRequestAPITestCase(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            email="demo-admin@platform.local",
            password="DemoAdminPassword-8472",
            full_name="Demo Admin",
        )
        PlatformStaffProfile.objects.create(user=self.admin, role=PlatformStaffProfile.Role.ADMIN)
        self.payload = {
            "name": "Cliente Potencial",
            "email": "cliente@example.com",
            "phone": "85999999999",
            "organization_name": "Fazenda Exemplo",
            "operation_profile": "Operação mista",
            "message": "Quero organizar estoque, produção e financeiro.",
        }

    def test_anonymous_visitor_creates_pending_request(self):
        response = self.client.post(reverse("public-demo-request"), self.payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        request = DemoRequest.objects.get(email=self.payload["email"])
        self.assertEqual(request.status, DemoRequest.Status.NEW)
        self.assertNotIn("ip_address", response.data)

    def test_platform_admin_approves_and_audits_request(self):
        demo_request = DemoRequest.objects.create(**self.payload)
        self.client.force_authenticate(user=self.admin)

        response = self.client.post(
            reverse("platform-demo-request-approve", args=[demo_request.id]),
            {"notes": "Perfil aderente ao plano Pro."},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        demo_request.refresh_from_db()
        self.assertEqual(demo_request.status, DemoRequest.Status.APPROVED)
        self.assertEqual(demo_request.decided_by, self.admin)
        self.assertTrue(PlatformAuditLog.objects.filter(action="demo_request.approved").exists())

    def test_decided_request_cannot_be_decided_again(self):
        demo_request = DemoRequest.objects.create(
            **self.payload,
            status=DemoRequest.Status.REJECTED,
        )
        self.client.force_authenticate(user=self.admin)

        response = self.client.post(
            reverse("platform-demo-request-approve", args=[demo_request.id]),
            {},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_admin_moves_lead_through_pipeline_and_schedules_demo(self):
        demo_request = DemoRequest.objects.create(**self.payload)
        self.client.force_authenticate(user=self.admin)
        pipeline = self.client.patch(
            reverse("platform-demo-request-update-pipeline", args=[demo_request.id]),
            {"status": "contacted", "estimated_value": "1499.00", "internal_notes": "Contato produtivo."},
            format="json",
        )
        self.assertEqual(pipeline.status_code, status.HTTP_200_OK)
        appointment = self.client.post(
            reverse("platform-demo-request-schedule", args=[demo_request.id]),
            {"starts_at": (timezone.now() + timedelta(days=2)).isoformat(), "duration_minutes": 45, "meeting_url": "https://meet.example.com/demo"},
            format="json",
        )
        self.assertEqual(appointment.status_code, status.HTTP_201_CREATED)
        demo_request.refresh_from_db()
        self.assertEqual(demo_request.status, DemoRequest.Status.SCHEDULED)
        self.assertEqual(demo_request.appointments.count(), 1)
        self.assertGreaterEqual(demo_request.activities.count(), 2)

    def test_public_marketing_event_is_available_in_commercial_dashboard(self):
        event = self.client.post(
            reverse("public-marketing-event"),
            {"event_name": "page_view", "session_id": "session-1", "path": "/gestao-pecuaria", "variant": "control", "utm_source": "google"},
            format="json",
        )
        self.assertEqual(event.status_code, status.HTTP_201_CREATED)
        self.client.force_authenticate(user=self.admin)
        dashboard = self.client.get(reverse("platform-commercial-dashboard"))
        self.assertEqual(dashboard.status_code, status.HTTP_200_OK)
        self.assertEqual(dashboard.data["summary"]["page_views"], 1)

    def test_visitor_can_choose_an_available_demo_slot(self):
        availability = self.client.get(reverse("public-demo-availability"))
        self.assertEqual(availability.status_code, status.HTTP_200_OK)
        self.assertTrue(availability.data["slots"])
        payload = {**self.payload, "email": "scheduled@example.com", "preferred_demo_at": availability.data["slots"][0]}
        response = self.client.post(reverse("public-demo-request"), payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        lead = DemoRequest.objects.get(email="scheduled@example.com")
        self.assertEqual(lead.status, DemoRequest.Status.SCHEDULED)
        self.assertEqual(lead.appointments.count(), 1)
