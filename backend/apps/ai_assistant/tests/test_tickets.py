import tempfile
import uuid
from pathlib import Path
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from rest_framework.test import APITestCase

from apps.organizations.models import Organization
from apps.platform_admin.models import PlatformStaffProfile
from apps.billing.quotas import storage_bytes
from apps.notifications.models import Notification
from apps.ai_assistant.models import AIConversation, AIMessage, SupportTicket, SupportTicketMessage, SupportTicketAttachment

User = get_user_model()


class HumanSupportTests(APITestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.settings = override_settings(SUPPORT_ATTACHMENT_ROOT=self.directory.name)
        self.settings.enable(); self.addCleanup(self.settings.disable)
        self.org = Organization.objects.create(name="Suporte Alfa", slug="support-tickets-alfa")
        self.other = Organization.objects.create(name="Suporte Beta", slug="support-tickets-beta")
        self.customer = User.objects.create_user(email="requester@tickets.test", full_name="Solicitante", organization=self.org, role="operator")
        self.colleague = User.objects.create_user(email="colleague@tickets.test", organization=self.org, role="manager")
        self.owner = User.objects.create_user(email="owner@tickets.test", organization=self.org, role="admin")
        self.foreign = User.objects.create_user(email="foreign@tickets.test", organization=self.other, role="admin")
        self.agent = User.objects.create_user(email="agent@tickets.test", full_name="Atendente")
        PlatformStaffProfile.objects.create(user=self.agent, role="platform_support")
        self.finance = User.objects.create_user(email="finance@tickets.test")
        PlatformStaffProfile.objects.create(user=self.finance, role="platform_finance")
        self.client.force_authenticate(self.customer)
        self.values = {"subject": "Ajuda no cadastro", "body": "O registro não aparece na tela.", "category": "technical", "creation_key": str(uuid.uuid4())}

    def url(self, ticket=None, action="detail", team=False, **kwargs):
        prefix = "admin-support-ticket" if team else "support-ticket"
        if ticket:
            return reverse(f"{prefix}-{action}", kwargs={"pk": str(ticket.pk), **kwargs})
        return reverse(f"{prefix}-{action}")

    def open(self, **values):
        data = {**self.values, **values}
        response = self.client.post(self.url(action="list"), data, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        return SupportTicket.objects.get(pk=response.data["id"])

    def reply(self, ticket, body="Resposta", internal=False, team=False, key=None, expected=None):
        ticket.refresh_from_db()
        data = {"body": body, "request_key": key or str(uuid.uuid4()), "expected_version": expected or ticket.version}
        if team:
            data["is_internal"] = internal
        return self.client.post(self.url(ticket, "messages", team), data, format="json")

    def transition(self, ticket, state, team=False):
        ticket.refresh_from_db()
        return self.client.post(self.url(ticket, "transition", team), {"status": state, "expected_version": ticket.version}, format="json")

    def upload(self, ticket, message, content=b"private bytes", key=None, filename="example.pdf", team=False):
        ticket.refresh_from_db()
        return self.client.post(self.url(ticket, "upload", team, message_id=str(message.pk)), {"file": SimpleUploadedFile(filename, content), "request_key": key or str(uuid.uuid4()), "expected_version": ticket.version}, format="multipart")

    def test_open_and_reply_are_idempotent_without_duplicate_notifications(self):
        ticket = self.open()
        notifications = Notification.objects.count()
        second = self.open()
        self.assertEqual(ticket.pk, second.pk)
        self.assertEqual(Notification.objects.count(), notifications)
        key = str(uuid.uuid4())
        first = self.reply(ticket, key=key)
        second = self.reply(ticket, key=key, expected=1)
        self.assertEqual(first.status_code, 201)
        self.assertEqual(first.data["message"]["id"], second.data["message"]["id"])
        self.assertEqual(ticket.messages.count(), 2)
        conflict = self.reply(ticket, body="Texto diferente", key=key)
        self.assertEqual(conflict.status_code, 409)

    def test_ticket_visibility_requester_admin_and_tenant_boundary(self):
        ticket = self.open()
        for user, code in [(self.colleague, 404), (self.owner, 200), (self.foreign, 404)]:
            self.client.force_authenticate(user)
            self.assertEqual(self.client.get(self.url(ticket)).status_code, code)
            response = self.client.get(self.url(action="list"), {"organization_id": str(self.org.pk)})
            self.assertEqual(response.data["count"], int(user == self.owner))
        self.client.force_authenticate(self.foreign)
        self.assertEqual(self.reply(ticket).status_code, 404)

    def test_team_roles_and_assisted_access_cannot_enter_customer_or_private_context(self):
        ticket = self.open()
        for user, expected in [(self.customer, 403), (self.finance, 403), (self.agent, 200)]:
            self.client.force_authenticate(user)
            self.assertEqual(self.client.get(self.url(ticket, team=True)).status_code, expected)
        self.assertEqual(self.client.get(self.url(ticket)).status_code, 403)
        self.agent.organization = self.org
        self.agent.support_access_grant = object()
        self.client.force_authenticate(self.agent)
        self.assertEqual(self.client.get(self.url(ticket)).status_code, 403)
        self.assertEqual(self.client.get(self.url(ticket, team=True)).status_code, 403)

    def test_notes_and_private_attachments_never_reach_customer_responses_or_history(self):
        ticket = self.open()
        self.client.force_authenticate(self.agent)
        result = self.reply(ticket, "INTERNAL-SECRET", internal=True, team=True)
        message = SupportTicketMessage.objects.get(pk=result.data["message"]["id"])
        attachment_response = self.upload(ticket, message, team=True)
        self.assertEqual(attachment_response.status_code, 201, attachment_response.data)
        attachment = SupportTicketAttachment.objects.get(pk=attachment_response.data["attachment"]["id"])
        ticket.refresh_from_db(); self.assertIsNone(ticket.first_response_at)
        for user in [self.customer, self.owner]:
            self.client.force_authenticate(user)
            messages = self.client.get(self.url(ticket, "messages"))
            self.assertEqual(messages.data["count"], 1)
            self.assertNotIn("INTERNAL-SECRET", str(messages.data))
            self.assertNotIn("is_internal", str(messages.data))
            history = self.client.get(self.url(ticket, "history"))
            self.assertNotIn("note_added", str(history.data))
            self.assertNotIn("attachment_added", str(history.data))
            download = self.client.get(self.url(ticket, "download", attachment_id=str(attachment.pk)))
            self.assertEqual(download.status_code, 404)
        self.assertFalse(Notification.objects.filter(user=self.customer).exists())

    def test_public_staff_reply_tracks_first_response_and_notifies_customer(self):
        ticket = self.open()
        self.client.force_authenticate(self.agent)
        first = self.reply(ticket, "Orientação pública", team=True)
        self.assertEqual(first.status_code, 201, first.data)
        ticket.refresh_from_db(); response_at = ticket.first_response_at
        self.assertIsNotNone(response_at)
        self.reply(ticket, "Segunda resposta", team=True)
        ticket.refresh_from_db(); self.assertEqual(ticket.first_response_at, response_at)
        self.assertTrue(Notification.objects.filter(user=self.customer, event_key__startswith="support.ticket:").exists())
        self.assertFalse(Notification.objects.filter(message__contains="Orientação pública").exists())

    def test_assignment_priority_audit_and_optimistic_version_conflicts(self):
        ticket = self.open()
        self.client.force_authenticate(self.agent)
        data = {"expected_version": ticket.version, "assignee_id": str(self.agent.pk), "priority": "high"}
        response = self.client.patch(self.url(ticket, team=True), data, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["assignee_id"], str(self.agent.pk))
        self.assertEqual(self.client.get(self.url(action="list", team=True), {"mine": "true"}).data["count"], 1)
        self.assertEqual(self.client.patch(self.url(ticket, team=True), data, format="json").status_code, 409)
        ticket.refresh_from_db()
        self.assertTrue(ticket.events.filter(kind="assignment_changed", is_internal=True).exists())
        invalid = self.client.patch(self.url(ticket, team=True), {"expected_version": ticket.version, "assignee_id": str(self.finance.pk)}, format="json")
        self.assertEqual(invalid.status_code, 404)
        self.client.force_authenticate(self.customer)
        self.assertEqual(self.client.patch(self.url(ticket), data, format="json").status_code, 405)

    def test_workflow_waiting_reply_resolution_closure_and_reopening(self):
        ticket = self.open()
        self.client.force_authenticate(self.agent)
        self.assertEqual(self.transition(ticket, "waiting_customer", True).status_code, 200)
        self.client.force_authenticate(self.customer)
        response = self.reply(ticket)
        self.assertEqual(response.data["ticket"]["status"], "in_progress")
        self.assertEqual(self.transition(ticket, "waiting_customer").status_code, 400)
        self.assertEqual(self.transition(ticket, "resolved").status_code, 200)
        ticket.refresh_from_db(); first = ticket.first_resolved_at
        self.assertEqual(self.reply(ticket).status_code, 400)
        self.assertEqual(self.transition(ticket, "closed").status_code, 200)
        self.assertEqual(self.transition(ticket, "open").status_code, 200)
        ticket.refresh_from_db()
        self.assertIsNone(ticket.resolved_at); self.assertIsNone(ticket.closed_at)
        self.assertEqual(ticket.first_resolved_at, first)
        self.transition(ticket, "resolved")
        ticket.refresh_from_db(); self.assertEqual(ticket.first_resolved_at, first)

    def test_explicit_conversation_link_only_own_support_with_reviewed_summary(self):
        conversation = AIConversation.objects.create(organization=self.org, user=self.customer, subject="support")
        AIMessage.objects.create(conversation=conversation, role="user", content="DO-NOT-SHARE-RAW")
        ticket = self.open(conversation_id=str(conversation.pk), shared_context="Resumo revisado pelo cliente")
        self.client.force_authenticate(self.agent)
        detail = self.client.get(self.url(ticket, team=True))
        self.assertIn("Resumo revisado", str(detail.data))
        self.assertNotIn("DO-NOT-SHARE", str(detail.data))
        self.assertNotIn("conversation_id", detail.data)
        self.client.force_authenticate(self.customer)
        foreign = AIConversation.objects.create(organization=self.other, user=self.foreign, subject="support")
        response = self.client.post(self.url(action="list"), {**self.values, "creation_key": str(uuid.uuid4()), "conversation_id": str(foreign.pk), "shared_context": "Resumo"}, format="json")
        self.assertEqual(response.status_code, 404)

    def test_attachment_private_download_validation_replay_and_storage_quota(self):
        ticket = self.open()
        message = ticket.messages.get()
        key = str(uuid.uuid4())
        response = self.upload(ticket, message, key=key)
        self.assertEqual(response.status_code, 201, response.data)
        attachment = SupportTicketAttachment.objects.get(pk=response.data["attachment"]["id"])
        self.assertNotIn("file", response.data["attachment"])
        self.assertEqual(storage_bytes(self.org.pk), len(b"private bytes"))
        self.assertEqual(self.upload(ticket, message, key=key).data["attachment"]["id"], str(attachment.pk))
        self.assertEqual(SupportTicketAttachment.objects.count(), 1)
        self.assertEqual(self.upload(ticket, message, key=key, content=b"different").status_code, 409)
        self.assertEqual(self.upload(ticket, message, filename="attack.html").status_code, 400)
        with self.assertRaises(ValueError):
            attachment.file.url
        url = self.url(ticket, "download", attachment_id=str(attachment.pk))
        download = self.client.get(url)
        self.assertEqual(download.status_code, 200)
        self.assertEqual(b"".join(download.streaming_content), b"private bytes")
        self.assertEqual(download["X-Content-Type-Options"], "nosniff")
        self.client.force_authenticate(self.foreign)
        self.assertEqual(self.client.get(url).status_code, 404)
        self.client.force_authenticate(self.customer)
        sub = self.org.subscription; sub.custom_limits = {"max_storage_mb": 0}; sub.save()
        denied = self.upload(ticket, message, content=b"new")
        self.assertEqual(denied.status_code, 409)
        self.assertEqual(SupportTicketAttachment.objects.count(), 1)

    def test_upload_only_to_own_message_and_empty_or_too_large_file_rejected(self):
        ticket = self.open()
        self.client.force_authenticate(self.agent)
        self.assertEqual(self.upload(ticket, ticket.messages.get(), team=True).status_code, 404)
        self.client.force_authenticate(self.customer)
        self.assertEqual(self.upload(ticket, ticket.messages.get(), content=b"").status_code, 400)
        response = self.upload(ticket, ticket.messages.get(), content=b"a" * (10 * 1024 * 1024 + 1))
        self.assertEqual(response.status_code, 400)

    def test_strict_fields_suspended_or_inactive_customers_and_no_delete_routes(self):
        for field, value in [("organization_id", str(self.other.pk)), ("is_internal", True), ("assignee_id", str(self.agent.pk)), ("status", "closed")]:
            response = self.client.post(self.url(action="list"), {**self.values, field: value}, format="json")
            self.assertEqual(response.status_code, 400)
        ticket = self.open()
        self.assertEqual(self.client.delete(self.url(ticket)).status_code, 405)
        self.customer.is_active = False
        self.client.force_authenticate(self.customer)
        self.assertEqual(self.client.get(self.url(ticket)).status_code, 403)

    def test_attachment_database_failure_removes_new_private_blob(self):
        ticket = self.open()
        message = ticket.messages.get()
        with patch("apps.ai_assistant.ticket_services.changed", side_effect=RuntimeError("Database failure")):
            self.assertEqual(self.upload(ticket, message).status_code, 500)
        self.assertFalse(SupportTicketAttachment.objects.exists())
        self.assertEqual(list(Path(self.directory.name).rglob("*.pdf")), [])
        self.assertEqual(storage_bytes(self.org.pk), 0)

    def test_pagination_filters_and_inactive_assignees(self):
        self.open()
        self.open(subject="Outra dúvida", creation_key=str(uuid.uuid4()), category="billing")
        response = self.client.get(self.url(action="list"), {"page_size": 1})
        self.assertEqual(response.data["count"], 2)
        self.assertIsNotNone(response.data["next"])
        self.client.force_authenticate(self.agent)
        response = self.client.get(self.url(action="list", team=True), {"organization_id": str(self.other.pk)})
        self.assertEqual(response.data["count"], 0)
        response = self.client.get(self.url(action="list", team=True), {"category": "billing", "unassigned": "true"})
        self.assertEqual(response.data["count"], 1)
        PlatformStaffProfile.objects.filter(user=self.agent).update(is_active=False)
        self.agent.refresh_from_db()
        self.client.force_authenticate(self.agent)
        self.assertEqual(self.client.get(self.url(action="assignees", team=True)).status_code, 403)

    def test_creation_retry_after_staff_metadata_changes_returns_original_ticket(self):
        ticket = self.open()
        self.client.force_authenticate(self.agent)
        response = self.client.patch(self.url(ticket, team=True), {"expected_version": ticket.version, "category": "billing", "priority": "high"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.client.force_authenticate(self.customer)
        repeated = self.open()
        self.assertEqual(repeated.pk, ticket.pk)
        self.assertEqual(SupportTicket.objects.count(), 1)

    def test_suspended_customer_and_public_storage_root_are_rejected(self):
        from django.conf import settings
        from django.core.exceptions import ImproperlyConfigured
        from apps.ai_assistant.ticket_storage import SupportAttachmentStorage
        self.org.status = "suspended"; self.org.save()
        self.assertEqual(self.client.get(self.url(action="list")).status_code, 403)
        with override_settings(SUPPORT_ATTACHMENT_ROOT=str(Path(settings.MEDIA_ROOT) / "private")):
            with self.assertRaises(ImproperlyConfigured):
                SupportAttachmentStorage().path("test.pdf")

    def test_attachment_limit_and_cross_message_binding(self):
        ticket = self.open()
        message = ticket.messages.get()
        second = self.open(creation_key=str(uuid.uuid4()))
        self.assertEqual(self.upload(second, message).status_code, 404)
        for count in range(5):
            self.assertEqual(self.upload(ticket, message, content=f"file-{count}".encode()).status_code, 201)
        self.assertEqual(self.upload(ticket, message).status_code, 400)
        self.assertEqual(message.attachments.count(), 5)

    def test_notification_preferences_and_message_query_count(self):
        from django.db import connection
        from django.test.utils import CaptureQueriesContext
        ticket = self.open()
        with CaptureQueriesContext(connection) as first:
            self.assertEqual(self.client.get(self.url(ticket, "messages")).status_code, 200)
        SupportTicketMessage.objects.bulk_create([SupportTicketMessage(ticket=ticket, author=self.customer, body="Mensagem pública", request_key=uuid.uuid4()) for _ in range(10)])
        with CaptureQueriesContext(connection) as second:
            response = self.client.get(self.url(ticket, "messages"))
        self.assertEqual(response.data["count"], 11)
        self.assertEqual(len(first), len(second))
        self.customer.receive_system_alerts = False
        self.customer.save(update_fields=["receive_system_alerts"])
        self.client.force_authenticate(self.agent)
        key = str(uuid.uuid4())
        self.assertEqual(self.reply(ticket, team=True, key=key).status_code, 201)
        self.assertEqual(self.reply(ticket, team=True, key=key).status_code, 201)
        self.assertFalse(Notification.objects.filter(user=self.customer).exists())
