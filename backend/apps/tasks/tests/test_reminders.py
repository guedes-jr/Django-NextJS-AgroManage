from datetime import timedelta
from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase
from apps.organizations.models import Organization
from apps.tasks.models import Task
from apps.tasks.reminders import collect_reminders, reminder_allowed
from apps.notifications.models import NotificationCategoryPolicy, NotificationDelivery, WhatsAppQueueMessage


class AgendaReminderTests(APITestCase):
    def setUp(self):
        self.now=timezone.now()
        self.org=Organization.objects.create(name="Agenda",slug="agenda-reminders")
        self.user=get_user_model().objects.create_user(email="reminders@example.invalid",password="test",role="admin",organization=self.org,phone="79999999999",phone_is_whatsapp=True,receive_system_alerts=True)
        self.client.force_authenticate(self.user)
        NotificationCategoryPolicy.objects.update_or_create(category="agenda",defaults={"enabled":True,"whatsapp_enabled":True,"group_similar_minutes":0})

    def scheduled(self,**kwargs):
        return Task.objects.create(**dict({"organization":self.org,"created_by":self.user,"title":"Visita técnica","event_kind":"appointment","due_date":timezone.localdate()+timedelta(days=1),"start_time":"10:00","whatsapp_remind_at":self.now-timedelta(minutes=1)},**kwargs))

    def test_create_event_and_validate_schedule(self):
        tomorrow=(timezone.localdate()+timedelta(days=1)).isoformat()
        payload={"title":"Reunião","event_kind":"event","due_date":tomorrow,"start_time":"10:00","end_time":"11:00","whatsapp_remind_at":(self.now+timedelta(hours=1)).isoformat()}
        result=self.client.post(reverse("task-list"),payload,format="json")
        self.assertEqual(result.status_code,201,result.data)
        self.assertEqual(result.data["event_kind"],"event")
        payload["end_time"]="09:00"
        self.assertEqual(self.client.post(reverse("task-list"),payload,format="json").status_code,400)
        payload["end_time"]="11:00";payload["whatsapp_remind_at"]=(self.now-timedelta(minutes=1)).isoformat()
        self.assertEqual(self.client.post(reverse("task-list"),payload,format="json").status_code,400)
        self.assertFalse(NotificationDelivery.objects.exists())

    def test_collector_enqueues_once_without_contacting_provider(self):
        task=self.scheduled(start_time=None)
        with patch("common.wppconnect.wpp_request") as provider:
            self.assertEqual(collect_reminders(),1)
            self.assertEqual(collect_reminders(),0)
            provider.assert_not_called()
        self.assertEqual(WhatsAppQueueMessage.objects.count(),1)
        task.refresh_from_db()
        self.assertEqual(task.reminder_delivery.status,"pending")
        self.assertIn("dia inteiro",task.reminder_delivery.notification.message)

    def test_consent_and_policy_are_respected(self):
        self.scheduled(start_time=None)
        self.user.receive_system_alerts=False;self.user.save()
        self.assertEqual(collect_reminders(),0)
        self.user.receive_system_alerts=True;self.user.save()
        NotificationCategoryPolicy.objects.filter(category="agenda").update(whatsapp_enabled=False)
        self.assertEqual(collect_reminders(),0)
        self.assertFalse(NotificationDelivery.objects.exists())

    def test_cancelled_or_changed_event_revokes_queued_message(self):
        task=self.scheduled(start_time=None)
        collect_reminders();task.refresh_from_db()
        key=task.reminder_delivery.notification.event_key
        self.assertTrue(reminder_allowed(self.user,key))
        response=self.client.patch(reverse("task-detail",args=[task.pk]),{"status":"cancelled"},format="json")
        self.assertEqual(response.status_code,200,response.data)
        self.assertFalse(reminder_allowed(self.user,key))
        with patch("apps.notifications.tasks._send_whatsapp_web") as send:
            from apps.notifications.tasks import dispatch_notification
            dispatch_notification(str(task.reminder_delivery.notification_id),channels=["whatsapp_web"])
            send.assert_not_called()
        task.reminder_delivery.refresh_from_db()
        self.assertEqual(task.reminder_delivery.status,"skipped")

    def test_expired_events_and_recovery_orgs_never_enqueue(self):
        task=self.scheduled(start_time=None,due_date=timezone.localdate()-timedelta(days=1))
        self.assertEqual(collect_reminders(),0)
        task.due_date=timezone.localdate()+timedelta(days=1);task.save()
        self.org.recovery_isolated=True;self.org.is_active=False;self.org.save()
        self.assertEqual(collect_reminders(),0)

    def test_foreign_and_noncreator_cannot_take_over_reminder(self):
        task=self.scheduled(start_time=None)
        org=Organization.objects.create(name="Other",slug="other-reminders")
        other=get_user_model().objects.create_user(email="other-remind@example.invalid",password="test",role="admin",organization=org)
        self.client.force_authenticate(other)
        self.assertEqual(self.client.get(reverse("task-detail",args=[task.pk])).status_code,404)
        self.assertFalse(reminder_allowed(other,f"agenda.reminder:{task.pk}:{task.reminder_version}"))
        other=get_user_model().objects.create_user(email="same-org-remind@example.invalid",password="test",role="admin",organization=self.org)
        self.client.force_authenticate(other)
        result=self.client.patch(reverse("task-detail",args=[task.pk]),{"whatsapp_remind_at":(self.now+timedelta(hours=1)).isoformat()},format="json")
        self.assertEqual(result.status_code,400)

    def test_timed_event_appears_on_calendar_with_hour(self):
        self.scheduled(start_time="10:30",whatsapp_remind_at=None)
        day=(timezone.localdate()+timedelta(days=1)).isoformat()
        result=self.client.get(reverse("organization-agenda"),{"start":day,"end":day,"domain":"tasks"})
        self.assertEqual(result.status_code,200,result.data)
        self.assertEqual(result.data["results"][0]["title"],"10:30 · Visita técnica")

    def test_authorized_whatsapp_delivery_uses_existing_sender(self):
        task=self.scheduled(start_time=None)
        collect_reminders();task.refresh_from_db()
        from apps.notifications.tasks import dispatch_notification
        with patch("apps.notifications.tasks.is_configured",return_value=True), patch("apps.notifications.tasks.wpp_request",return_value=({},"")) as send:
            dispatch_notification(str(task.reminder_delivery.notification_id),channels=["whatsapp_web"])
        task.reminder_delivery.refresh_from_db()
        self.assertEqual(task.reminder_delivery.status,"sent")
        self.assertEqual(send.call_count,1)
        self.assertEqual(send.call_args.kwargs["payload"]["phone"],"5579999999999")

    def test_reminder_at_start_survives_scheduler_tick_delay(self):
        local=timezone.localtime(self.now)-timedelta(minutes=1)
        self.scheduled(start_time=local.time().replace(tzinfo=None),due_date=local.date())
        self.assertEqual(collect_reminders(),1)
