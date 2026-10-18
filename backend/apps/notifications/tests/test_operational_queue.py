from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.farms.models import Farm
from apps.livestock.models import (
    AcknowledgedOperationalAlert,
    Animal,
    Birth,
    Mating,
    Pregnancy,
    Species,
)
from apps.notifications.models import (
    NotificationPreference,
    WhatsAppQueueMessage,
)
from apps.notifications.operational import collect_operational_notifications
from apps.notifications.whatsapp_queue import dispatch_queue_message
from apps.organizations.models import Organization
from apps.platform_admin.models import PlatformStaffProfile

User = get_user_model()


class OperationalQueueTests(APITestCase):
    def setUp(self):
        self.org = Organization.objects.create(
            name="Operacional", slug="operacional-queue"
        )
        self.farm = Farm.objects.create(organization=self.org, name="Fazenda")
        self.species, _ = Species.objects.get_or_create(
            code="suinos", defaults={"name": "Suínos"}
        )
        self.user = User.objects.create_user(
            email="alerts@queue.test",
            full_name="Produtor",
            role="admin",
            organization=self.org,
            phone="11999999999",
            phone_is_whatsapp=True,
            receive_system_alerts=True,
        )
        NotificationPreference.objects.update_or_create(
            user=self.user,
            defaults={
                "animal_alerts": True,
                "whatsapp_reproductive_alerts": True,
                "email_notifications": False,
                "push_notifications": False,
            },
        )
        self.female = Animal.objects.create(
            farm=self.farm,
            species=self.species,
            identifier="BM-74",
            gender="F",
            category="Matriz",
        )
        mating = Mating.objects.create(
            female=self.female,
            mating_date=timezone.localdate() - timedelta(days=116),
            status="confirmed",
        )
        pregnancy = Pregnancy.objects.create(
            female=self.female,
            mating=mating,
            start_date=mating.mating_date,
            expected_birth_date=timezone.localdate() - timedelta(days=1),
            status="completed",
        )
        self.birth = Birth.objects.create(
            pregnancy=pregnancy,
            female=self.female,
            birth_date=timezone.localdate() - timedelta(days=1),
            live_born=10,
        )
        self.staff = User.objects.create_user(
            email="staff@queue.test", full_name="Admin da plataforma", is_staff=True
        )
        PlatformStaffProfile.objects.create(user=self.staff, role="platform_admin")
        self.client.force_authenticate(self.staff)

    def test_anticipated_alert_is_queued_without_visiting_dashboard(self):
        count = collect_operational_notifications()
        self.assertGreater(count, 0)
        row = WhatsAppQueueMessage.objects.get(
            delivery__notification__user=self.user, body__contains="aplicar ferro"
        )
        self.assertIn("Em 2 dias", row.body)
        self.assertEqual(row.status, "pending")
        self.assertFalse(row.delivery.notification.show_in_app)
        self.assertEqual(row.delivery.notification.deliveries.count(), 1)
        before = WhatsAppQueueMessage.objects.count()
        collect_operational_notifications()
        self.assertEqual(WhatsAppQueueMessage.objects.count(), before)

    def test_operator_receives_only_authorized_species_and_organization(self):
        operator = User.objects.create_user(
            email="operator@queue.test",
            role="operator",
            organization=self.org,
            phone=self.user.phone,
            phone_is_whatsapp=True,
            receive_system_alerts=True,
        )
        NotificationPreference.objects.update_or_create(
            user=operator, defaults={"whatsapp_reproductive_alerts": True}
        )
        collect_operational_notifications()
        self.assertFalse(
            WhatsAppQueueMessage.objects.filter(
                delivery__notification__user=operator
            ).exists()
        )
        operator.allowed_livestock.add(self.species)
        collect_operational_notifications()
        self.assertTrue(
            WhatsAppQueueMessage.objects.filter(
                delivery__notification__user=operator
            ).exists()
        )
        from apps.notifications.operator_scope import event_allowed

        row = WhatsAppQueueMessage.objects.filter(
            delivery__notification__user=operator
        ).first()
        key = row.delivery.notification.event_key
        self.assertTrue(event_allowed(operator, "animal_cycle", key))
        self.assertFalse(
            event_allowed(
                operator,
                "animal_cycle",
                key.replace(str(self.org.pk), "00000000-0000-0000-0000-000000000000"),
            )
        )
        operator.allowed_livestock.clear()
        self.assertFalse(event_allowed(operator, "animal_cycle", key))

    def test_confirmation_and_optout_prevent_queue_creation(self):
        from apps.livestock.operational_alerts import operational_alerts

        alerts = operational_alerts(self.org, "suinos")
        for alert in alerts:
            AcknowledgedOperationalAlert.objects.create(
                user=self.user, organization=self.org, alert_key=alert["alert_key"]
            )
        collect_operational_notifications()
        self.assertFalse(WhatsAppQueueMessage.objects.exists())
        AcknowledgedOperationalAlert.objects.all().delete()
        self.user.receive_system_alerts = False
        self.user.save()
        collect_operational_notifications()
        self.assertFalse(WhatsAppQueueMessage.objects.exists())

    def test_disconnected_manual_message_waits_without_attempting_send(self):
        row = WhatsAppQueueMessage.objects.create(phone="5511999999999", body="Teste")
        with (
            patch("common.wppconnect.is_configured", return_value=True),
            patch("common.wppconnect.is_connected", return_value=False),
            patch(
                "common.wppconnect.wpp_request", return_value=({"status": False}, None)
            ) as transport,
        ):
            dispatch_queue_message(row.pk)
        row.refresh_from_db()
        self.assertEqual(row.status, "pending")
        self.assertEqual(row.attempts, 0)
        transport.assert_called_once_with("status-session")

    def test_edit_resend_and_history(self):
        row = WhatsAppQueueMessage.objects.create(
            phone="5511999999999", body="Original"
        )
        endpoint = f"/api/v1/platform/whatsapp-web/queue/{row.pk}/"
        response = self.client.patch(endpoint, {"body": "Editada"}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        with (
            patch("common.wppconnect.is_configured", return_value=True),
            patch("common.wppconnect.is_connected", return_value=True),
            patch(
                "common.wppconnect.wpp_request",
                return_value=({"status": "success"}, None),
            ) as transport,
        ):
            dispatch_queue_message(row.pk)
        row.refresh_from_db()
        self.assertEqual(row.status, "sent")
        self.assertEqual(transport.call_args.kwargs["payload"]["message"], "Editada")
        self.assertEqual(self.client.post(endpoint, {}, format="json").status_code, 400)
        response = self.client.post(endpoint, {"confirm_resend": True}, format="json")
        self.assertEqual(response.status_code, 200)
        row.refresh_from_db()
        self.assertEqual(row.status, "pending")
        self.assertEqual(
            [x["action"] for x in row.history], ["edit", "attempt", "resend"]
        )

    def test_unknown_result_is_not_automatically_repeated(self):
        row = WhatsAppQueueMessage.objects.create(phone="5511999999999", body="Teste")
        with (
            patch("common.wppconnect.is_configured", return_value=True),
            patch("common.wppconnect.is_connected", return_value=True),
            patch(
                "common.wppconnect.wpp_request",
                side_effect=[({"status": True}, None), (None, "timeout")],
            ) as transport,
        ):
            dispatch_queue_message(row.pk)
            dispatch_queue_message(row.pk)
        row.refresh_from_db()
        self.assertEqual(row.status, "unknown")
        self.assertEqual(
            len([c for c in transport.call_args_list if c.args[0] == "send-message"]), 1
        )

    def test_active_processing_blocks_edits_and_customer_cannot_read_queue(self):
        row = WhatsAppQueueMessage.objects.create(
            phone="5511999999999",
            body="Teste",
            processing_until=timezone.now() + timedelta(minutes=1),
        )
        endpoint = f"/api/v1/platform/whatsapp-web/queue/{row.pk}/"
        self.assertEqual(
            self.client.patch(endpoint, {"body": "Outra"}, format="json").status_code,
            409,
        )
        self.client.force_authenticate(self.user)
        self.assertEqual(
            self.client.get("/api/v1/platform/whatsapp-web/queue/").status_code, 403
        )
        self.assertEqual(
            self.client.post(
                endpoint, {"confirm_resend": True}, format="json"
            ).status_code,
            403,
        )

    def test_manual_messages_enter_durable_queue(self):
        with patch("apps.platform_admin.views._wpp_request") as transport:
            response = self.client.post(
                "/api/v1/platform/whatsapp-web/messages/",
                {"phone": "5511999999999", "message": "Olá"},
                format="json",
            )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["status"], "queued")
        transport.assert_not_called()
        self.assertEqual(
            WhatsAppQueueMessage.objects.get(pk=response.data["id"]).body, "Olá"
        )

    def test_filtered_queue_is_paginated_and_counts_are_global(self):
        for body, status in [("Busca especial", "pending"), ("Outra", "sent")]:
            WhatsAppQueueMessage.objects.create(
                phone="5511999999999", body=body, status=status
            )
        response = self.client.get(
            "/api/v1/platform/whatsapp-web/queue/",
            {"status": "pending", "search": "especial", "page_size": 1},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["counts"]["sent"], 1)

    def test_pending_alert_is_skipped_when_producer_confirms_it(self):
        collect_operational_notifications()
        row = WhatsAppQueueMessage.objects.get(body__contains="aplicar ferro")
        key = row.delivery.notification.event_key.split(":")[3]
        AcknowledgedOperationalAlert.objects.create(
            user=self.user, organization=self.org, alert_key=key
        )
        with patch("common.wppconnect.wpp_request") as transport:
            dispatch_queue_message(row.pk)
        row.refresh_from_db()
        self.assertEqual(row.status, "skipped")
        transport.assert_not_called()

    def test_linked_delivery_sends_edited_text_and_records_attempt(self):
        collect_operational_notifications()
        row = WhatsAppQueueMessage.objects.get(body__contains="aplicar ferro")
        response = self.client.patch(
            f"/api/v1/platform/whatsapp-web/queue/{row.pk}/",
            {"body": "Lembrete editado pelo administrador"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        with (
            patch("common.wppconnect.is_configured", return_value=True),
            patch(
                "common.wppconnect.wpp_request", return_value=({"status": True}, None)
            ),
            patch("apps.notifications.tasks.is_configured", return_value=True),
            patch(
                "apps.notifications.tasks.wpp_request",
                return_value=({"status": True}, None),
            ) as transport,
        ):
            dispatch_queue_message(row.pk)
        row.refresh_from_db()
        self.assertEqual(row.status, "sent")
        self.assertEqual(row.delivery.status, "sent")
        self.assertEqual(
            transport.call_args.kwargs["payload"]["message"],
            "Lembrete editado pelo administrador",
        )
        self.assertEqual([h["action"] for h in row.history], ["edit", "attempt"])

    def test_due_and_overdue_stages_create_one_message_per_stage(self):
        collect_operational_notifications()
        future = timezone.localdate() + timedelta(days=2)
        with patch("django.utils.timezone.localdate", return_value=future):
            collect_operational_notifications()
            collect_operational_notifications()
        rows = WhatsAppQueueMessage.objects.filter(body__contains="aplicar ferro")
        self.assertEqual(rows.count(), 2)
        stages = {r.delivery.notification.event_key.split(":")[-1] for r in rows}
        self.assertEqual(stages, {"upcoming_3d", "due"})

    def test_old_processing_lease_becomes_unknown_without_transport(self):
        row = WhatsAppQueueMessage.objects.create(
            phone="5511999999999",
            body="Teste",
            processing_until=timezone.now() - timedelta(seconds=1),
        )
        with patch("common.wppconnect.wpp_request") as transport:
            dispatch_queue_message(row.pk)
        row.refresh_from_db()
        self.assertEqual(row.status, "unknown")
        self.assertIsNone(row.processing_until)
        transport.assert_not_called()

    def test_periodic_outbox_does_not_enqueue_same_message_twice(self):
        from apps.notifications.tasks import process_whatsapp_outbox

        row = WhatsAppQueueMessage.objects.create(phone="5511999999999", body="Teste")
        with (
            patch("common.wppconnect.is_configured", return_value=True),
            patch(
                "common.wppconnect.wpp_request", return_value=({"status": True}, None)
            ),
            patch(
                "apps.notifications.tasks.send_whatsapp_queue_message.delay"
            ) as enqueue,
        ):
            self.assertEqual(process_whatsapp_outbox()["queued"], 1)
            self.assertEqual(process_whatsapp_outbox()["queued"], 0)
        enqueue.assert_called_once_with(str(row.pk))

    def test_broker_failure_preserves_pending_message_for_next_scan(self):
        from apps.notifications.tasks import process_whatsapp_outbox

        row = WhatsAppQueueMessage.objects.create(phone="5511999999999", body="Teste")
        with (
            patch("common.wppconnect.is_configured", return_value=True),
            patch(
                "common.wppconnect.wpp_request", return_value=({"status": True}, None)
            ),
            patch(
                "apps.notifications.tasks.send_whatsapp_queue_message.delay",
                side_effect=RuntimeError("broker unavailable"),
            ),
        ):
            self.assertEqual(process_whatsapp_outbox()["queued"], 0)
        row.refresh_from_db()
        self.assertIsNone(row.last_enqueued_at)
        self.assertEqual(row.status, "pending")

    def test_platform_can_enable_stock_and_system_whatsapp_but_not_tenant_finance(self):
        response = self.client.patch(
            "/api/v1/platform/notifications/categories/stock/",
            {"whatsapp_enabled": True},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(
            self.client.patch(
                "/api/v1/platform/notifications/categories/system/",
                {"whatsapp_enabled": True}, format="json",
            ).status_code, 200,
        )
        for category in ["finance", "overdue_payment"]:
            self.assertEqual(
                self.client.patch(
                    f"/api/v1/platform/notifications/categories/{category}/",
                    {"whatsapp_enabled": True},
                    format="json",
                ).status_code,
                400,
            )

    def test_restocked_item_cancels_pending_low_stock_message(self):
        from apps.inventory.models import ItemEstoque, LoteEstoque
        from apps.notifications.services import NotificationService

        item = ItemEstoque.objects.create(
            organization=self.org,
            nome="Ração",
            categoria="racao",
            unidade_medida="kg",
            estoque_minimo=10,
        )
        n = NotificationService.create(
            user=self.user,
            title="Estoque baixo",
            message="Saldo baixo",
            notif_type="stock",
            event_key=f"inventory.low_stock:{item.pk}",
        )
        row = WhatsAppQueueMessage.objects.get(delivery__notification=n)
        LoteEstoque.objects.create(
            item=item,
            numero_lote="REPOSICAO",
            data_entrada=timezone.localdate(),
            quantidade_inicial=20,
            quantidade_atual=20,
        )
        with patch("common.wppconnect.wpp_request") as transport:
            dispatch_queue_message(row.pk)
        row.refresh_from_db()
        self.assertEqual(row.status, "skipped")
        transport.assert_not_called()

    def test_category_off_then_on_queues_current_alerts_without_duplicates(self):
        from apps.notifications.models import NotificationCategoryPolicy

        policy = NotificationCategoryPolicy.objects.get(category="animal_cycle")
        policy.whatsapp_enabled = False
        policy.save()
        collect_operational_notifications()
        self.assertFalse(WhatsAppQueueMessage.objects.exists())
        policy.whatsapp_enabled = True
        policy.save()
        collect_operational_notifications()
        self.assertTrue(WhatsAppQueueMessage.objects.exists())
        count = WhatsAppQueueMessage.objects.count()
        collect_operational_notifications()
        self.assertEqual(WhatsAppQueueMessage.objects.count(), count)

    def future_pregnancy(self, days):
        mating = Mating.objects.create(female=self.female, mating_date=timezone.localdate(), status="confirmed")
        return Pregnancy.objects.create(female=self.female, mating=mating, start_date=mating.mating_date, expected_birth_date=timezone.localdate() + timedelta(days=days), status="ongoing")

    def test_distant_birth_is_visible_in_system_but_not_queued_for_whatsapp(self):
        from apps.livestock.operational_alerts import operational_alerts
        for days in (4, 52, 113):
            pregnancy = self.future_pregnancy(days)
            collect_operational_notifications()
            self.assertTrue(any(alert.get("due_date") == pregnancy.expected_birth_date.isoformat() and "Parto" in alert["text"] for alert in operational_alerts(self.org, "suinos")))
            self.assertFalse(WhatsAppQueueMessage.objects.filter(body__contains="Parto da matriz").exists())
            pregnancy.delete()

    def test_birth_enters_window_once_at_three_days_and_retains_due_and_overdue(self):
        today = timezone.localdate()
        self.future_pregnancy(4)
        collect_operational_notifications()
        for elapsed in (1, 2, 3):
            with patch("django.utils.timezone.localdate", return_value=today + timedelta(days=elapsed)):
                collect_operational_notifications()
        rows = WhatsAppQueueMessage.objects.filter(body__contains="Parto da matriz")
        self.assertEqual(rows.count(), 1)
        self.assertIn("Em 3 dias", rows.get().body)
        for elapsed in (4, 5):
            with patch("django.utils.timezone.localdate", return_value=today + timedelta(days=elapsed)):
                collect_operational_notifications()
        self.assertEqual(rows.count(), 3)
        self.assertEqual({row.delivery.notification.event_key.split(":")[-1] for row in rows}, {"upcoming_3d", "due", "overdue"})

    def old_birth_delivery(self, days):
        from apps.notifications.models import Notification, NotificationDelivery
        from apps.notifications.operational import event_key
        from apps.notifications.whatsapp_queue import queue_notification
        from apps.livestock.operational_alerts import operational_alerts
        pregnancy = self.future_pregnancy(days)
        alert = next(a for a in operational_alerts(self.org, "suinos") if a.get("due_date") == pregnancy.expected_birth_date.isoformat() and "Parto" in a["text"])
        notification = Notification.objects.create(user=self.user, title=alert["text"], message=alert["text"], type="animal", category="animal_cycle", event_key=event_key(self.org, "suinos", alert).rsplit(":", 1)[0] + ":scheduled")
        delivery = NotificationDelivery.objects.create(notification=notification, channel="whatsapp_web")
        row = queue_notification(delivery)
        row.scheduled_for = timezone.now() - timedelta(seconds=1); row.save()
        return pregnancy, row

    def test_old_distant_queue_and_direct_delivery_are_blocked_before_transport(self):
        from apps.notifications.tasks import dispatch_notification
        _, row = self.old_birth_delivery(52)
        with patch("common.wppconnect.wpp_request") as transport:
            dispatch_queue_message(row.pk)
        row.refresh_from_db(); self.assertEqual(row.status, "skipped")
        transport.assert_not_called()
        _, other = self.old_birth_delivery(113)
        with patch("apps.notifications.tasks._send_whatsapp_web") as transport:
            dispatch_notification(str(other.delivery.notification_id), channels=["whatsapp_web"])
        other.refresh_from_db(); self.assertEqual(other.status, "skipped")
        self.assertIsNone(other.processing_until)
        transport.assert_not_called()

    def test_old_sent_early_reminder_does_not_prevent_new_three_day_reminder(self):
        today = timezone.localdate()
        _, row = self.old_birth_delivery(52)
        row.status = "sent"; row.save()
        row.delivery.status = "sent"; row.delivery.save()
        with patch("django.utils.timezone.localdate", return_value=today + timedelta(days=49)):
            collect_operational_notifications()
            collect_operational_notifications()
        rows = WhatsAppQueueMessage.objects.filter(body__contains="Parto da matriz")
        self.assertEqual(rows.count(), 2)
        self.assertEqual(rows.filter(status="pending").count(), 1)
