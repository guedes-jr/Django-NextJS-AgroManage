from datetime import timedelta
from io import BytesIO
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone
from PIL import Image
from rest_framework.exceptions import ValidationError
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.notifications.marketing import prepare_campaign, preview, publish, resolve
from apps.notifications.models import (
    MarketingAudience,
    MarketingCampaign,
    MarketingImage,
    Notification,
    NotificationCategoryPolicy,
    NotificationDailyGuard,
    NotificationDelivery,
    NotificationPreference,
)
from apps.notifications.services import NotificationService
from apps.notifications.tasks import dispatch_notification
from apps.organizations.models import Organization
from apps.platform_admin.models import PlatformStaffProfile


class MarketingTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            email="admin@marketing.test", full_name="Admin"
        )
        PlatformStaffProfile.objects.create(user=self.admin, role="platform_admin")
        self.client.force_authenticate(self.admin)
        self.org = Organization.objects.create(
            name="Fazenda Teste", slug="marketing-test"
        )
        self.user = User.objects.create_user(
            email="member@marketing.test",
            full_name="Membro",
            organization=self.org,
            role="manager",
            phone="81999990000",
            phone_is_whatsapp=True,
        )
        self.pref = NotificationPreference.objects.create(
            user=self.user, marketing_alerts=True
        )
        self.audience = MarketingAudience.objects.create(
            name="Gerentes", filters={"roles": ["manager"], "search": "Fazenda"}
        )
        self.campaign = MarketingCampaign.objects.create(
            title="Oferta",
            body="**Novidade**\n[Visite](https://example.com)",
            audience=self.audience,
            send_whatsapp=True,
        )
        NotificationCategoryPolicy.objects.filter(category="marketing").update(
            enabled=True, whatsapp_enabled=True
        )

    def test_roles_and_consent_filter_the_audience(self):
        self.assertEqual(len(resolve(self.campaign)[1]), 1)
        self.pref.marketing_alerts = False
        self.pref.save()
        self.assertEqual(resolve(self.campaign)[1], [])
        self.pref.marketing_alerts = True
        self.pref.save()
        self.user.role = "operator"
        self.user.save()
        self.assertEqual(resolve(self.campaign)[1], [])

    def test_master_opt_out_and_other_organization_are_excluded(self):
        self.user.receive_system_alerts = False
        self.user.save()
        self.assertEqual(resolve(self.campaign)[1], [])
        self.user.receive_system_alerts = True
        self.user.save()
        self.audience.filters = {
            "roles": ["manager"],
            "organizations": [str(self.admin.pk)],
        }
        self.audience.save()
        self.assertEqual(resolve(self.campaign)[1], [])

    def test_phone_deduplication_keeps_in_app_recipients(self):
        other = User.objects.create_user(
            email="second@marketing.test",
            full_name="Segundo",
            organization=self.org,
            role="manager",
            phone="5581999990000",
            phone_is_whatsapp=True,
        )
        NotificationPreference.objects.create(user=other, marketing_alerts=True)
        rows = resolve(self.campaign)[1]
        self.assertEqual(len(rows), 2)
        self.assertEqual(sum(row[3] for row in rows), 1)

    def test_publish_requires_fresh_preview_and_cannot_repeat(self):
        token = preview(self.campaign)["token"]
        self.user.receive_system_alerts = False
        self.user.save()
        with self.assertRaises(ValidationError):
            publish(self.campaign.pk, token)
        self.user.receive_system_alerts = True
        self.user.save()
        publish(self.campaign.pk, preview(self.campaign)["token"])
        with self.assertRaises(ValidationError):
            publish(self.campaign.pk, preview(self.campaign)["token"])
        self.assertEqual(self.campaign.recipients.count(), 1)

    def test_outbox_is_idempotent_and_respects_channel_selection(self):
        publish(self.campaign.pk, preview(self.campaign)["token"])
        self.assertEqual(prepare_campaign(self.campaign.pk), 1)
        self.assertEqual(prepare_campaign(self.campaign.pk), 0)
        notification = self.campaign.notifications.get()
        self.assertTrue(notification.show_in_app)
        self.assertEqual(
            list(notification.deliveries.values_list("channel", flat=True)),
            ["whatsapp_web"],
        )

    def test_audience_changes_do_not_change_snapshot_roles(self):
        publish(self.campaign.pk, preview(self.campaign)["token"])
        self.audience.filters = {"roles": ["owner"]}
        self.audience.save()
        prepare_campaign(self.campaign.pk)
        self.assertEqual(self.campaign.notifications.count(), 1)

    def test_outbox_rechecks_consent_and_cancel(self):
        publish(self.campaign.pk, preview(self.campaign)["token"])
        self.pref.marketing_alerts = False
        self.pref.save()
        prepare_campaign(self.campaign.pk)
        self.assertEqual(self.campaign.notifications.count(), 0)
        self.assertTrue(self.campaign.recipients.exclude(skip_reason="").exists())

    @override_settings(
        WPP_CONNECT_URL="http://wpp.test",
        WPP_CONNECT_TOKEN="test",
        WPP_CONNECT_SESSION="test",
    )
    @patch(
        "apps.notifications.tasks.wpp_request",
        return_value=({"status": "success"}, None),
    )
    def test_whatsapp_supports_images_and_never_repeats_confirmed_delivery(
        self, transport
    ):
        buffer = BytesIO()
        Image.new("RGB", (2, 2)).save(buffer, format="PNG")
        with override_settings(
            STORAGES={
                "default": {"BACKEND": "django.core.files.storage.InMemoryStorage"}
            }
        ):
            asset = MarketingImage.objects.create(
                image=SimpleUploadedFile(
                    "image.png", buffer.getvalue(), content_type="image/png"
                ),
                mime_type="image/png",
            )
            self.campaign.images.add(asset)
            publish(self.campaign.pk, preview(self.campaign)["token"])
            prepare_campaign(self.campaign.pk)
            notification = self.campaign.notifications.get()
            dispatch_notification.run(str(notification.pk))
            dispatch_notification.run(str(notification.pk))
            self.assertEqual(transport.call_count, 2)
            self.assertEqual(transport.call_args.args[0], "send-file-base64")
            self.assertTrue(
                transport.call_args.kwargs["payload"]["base64"].startswith(
                    "data:image/png;base64,"
                )
            )
            delivery = notification.deliveries.get()
            self.assertEqual(delivery.parts_sent, 2)
            self.assertEqual(delivery.status, "sent")

    @override_settings(
        WPP_CONNECT_URL="http://wpp.test",
        WPP_CONNECT_TOKEN="test",
        WPP_CONNECT_SESSION="test",
    )
    @patch(
        "apps.notifications.tasks.wpp_request",
        return_value=(None, "Tempo de espera esgotado"),
    )
    def test_ambiguous_error_is_not_automatically_resent(self, transport):
        publish(self.campaign.pk, preview(self.campaign)["token"])
        prepare_campaign(self.campaign.pk)
        notification = self.campaign.notifications.get()
        dispatch_notification.run(str(notification.pk))
        dispatch_notification.run(str(notification.pk))
        self.assertEqual(notification.deliveries.get().status, "unknown")
        self.assertEqual(transport.call_count, 1)

    @patch("apps.notifications.tasks.wpp_request")
    def test_cancel_blocks_queued_whatsapp(self, transport):
        publish(self.campaign.pk, preview(self.campaign)["token"])
        prepare_campaign(self.campaign.pk)
        self.campaign.status = "cancelled"
        self.campaign.save()
        dispatch_notification.run(str(self.campaign.notifications.get().pk))
        transport.assert_not_called()
        self.assertEqual(
            self.campaign.notifications.get().deliveries.get().status, "skipped"
        )

    def test_platform_api_permissions_and_role_options(self):
        response = self.client.get("/api/v1/platform/marketing/options/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            {r["value"] for r in response.data["roles"]}, set(User.Role.values)
        )
        response = self.client.patch(
            f"/api/v1/platform/marketing/audiences/{self.audience.pk}/",
            {"filters": {"roles": ["future-invalid"]}},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.client.force_authenticate(self.user)
        for route in ("options", "campaigns", "audiences", "images"):
            self.assertEqual(
                self.client.get(f"/api/v1/platform/marketing/{route}/").status_code, 403
            )

    def test_campaign_editing_locked_after_publish_and_url_is_validated(self):
        path = f"/api/v1/platform/marketing/campaigns/{self.campaign.pk}/"
        self.assertEqual(
            self.client.patch(
                path, {"link_url": "javascript:alert(1)"}, format="json"
            ).status_code,
            400,
        )
        publish(self.campaign.pk, preview(self.campaign)["token"])
        self.assertEqual(
            self.client.patch(path, {"title": "Mudou"}, format="json").status_code, 400
        )

    def test_invalid_image_upload_is_rejected(self):
        bad = SimpleUploadedFile(
            "payload.svg",
            b"<svg><script>alert(1)</script></svg>",
            content_type="image/svg+xml",
        )
        self.assertEqual(
            self.client.post(
                "/api/v1/platform/marketing/images/", {"image": bad}, format="multipart"
            ).status_code,
            400,
        )

    def test_metrics_counts_delivery_status_and_latency(self):
        notification = Notification.objects.create(
            user=self.user, title="Teste", message="Teste", category="marketing"
        )
        delivery = NotificationDelivery.objects.create(
            notification=notification,
            channel="whatsapp_web",
            status="sent",
            delivered_at=timezone.now(),
        )
        NotificationDelivery.objects.filter(pk=delivery.pk).update(
            created_at=timezone.now() - timedelta(seconds=10)
        )
        response = self.client.get(
            "/api/v1/platform/notifications/metrics/",
            {"days": 7, "channel": "whatsapp_web"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["statuses"], {"sent": 1})
        self.assertEqual(response.data["success_rate"], 100)
        self.assertGreaterEqual(response.data["average_seconds"], 9)
        self.assertEqual(
            self.client.get(
                "/api/v1/platform/notifications/metrics/", {"days": 1}
            ).status_code,
            400,
        )

    def test_real_subscription_plan_overrides_legacy_plan(self):
        from apps.billing.models import Plan, Subscription

        plan = Plan.objects.create(code="campaign-pro", name="Pro")
        Subscription.objects.update_or_create(
            organization=self.org,
            defaults={"plan": plan, "status": "active", "started_at": timezone.now()},
        )
        self.audience.filters = {"roles": ["manager"], "plans": ["free"]}
        self.audience.save()
        self.assertEqual(resolve(self.campaign)[1], [])
        self.audience.filters["plans"] = ["campaign-pro"]
        self.audience.save()
        self.assertEqual(len(resolve(self.campaign)[1]), 1)

    def test_publish_api_and_campaign_list_summary(self):
        path = f"/api/v1/platform/marketing/campaigns/{self.campaign.pk}/publish/"
        token = self.client.get(
            f"/api/v1/platform/marketing/campaigns/{self.campaign.pk}/preview/"
        ).data["token"]
        self.assertEqual(
            self.client.post(path, {"token": token}, format="json").status_code, 400
        )
        self.assertEqual(
            self.client.post(
                path, {"confirm": True, "token": token}, format="json"
            ).status_code,
            200,
        )
        prepare_campaign(self.campaign.pk)
        response = self.client.get("/api/v1/platform/marketing/campaigns/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["results"][0]["summary"]["prepared"], 1)
        self.assertEqual(
            response.data["results"][0]["summary"]["deliveries"],
            [{"deliveries__status": "pending", "total": 1}],
        )

    @patch("apps.notifications.tasks.wpp_request")
    def test_changed_phone_after_confirmation_is_not_contacted(self, transport):
        publish(self.campaign.pk, preview(self.campaign)["token"])
        prepare_campaign(self.campaign.pk)
        self.user.phone = "81988880000"
        self.user.save()
        dispatch_notification.run(str(self.campaign.notifications.get().pk))
        transport.assert_not_called()
        self.assertEqual(
            self.campaign.notifications.get().deliveries.get().status, "skipped"
        )

    @patch("apps.notifications.tasks.wpp_request")
    def test_active_lease_and_interrupted_lease_never_duplicate(self, transport):
        publish(self.campaign.pk, preview(self.campaign)["token"])
        prepare_campaign(self.campaign.pk)
        row = self.campaign.notifications.get()
        row.deliveries.update(processing_until=timezone.now() + timedelta(minutes=5))
        dispatch_notification.run(str(row.pk))
        self.assertEqual(row.deliveries.get().attempts, 0)
        row.deliveries.update(processing_until=timezone.now() - timedelta(minutes=5))
        dispatch_notification.run(str(row.pk))
        self.assertEqual(row.deliveries.get().status, "unknown")
        transport.assert_not_called()

    def test_whatsapp_only_does_not_create_in_app_notification(self):
        self.campaign.send_in_app = False
        self.campaign.save()
        publish(self.campaign.pk, preview(self.campaign)["token"])
        prepare_campaign(self.campaign.pk)
        self.assertFalse(self.campaign.notifications.get().show_in_app)
        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.get("/api/v1/notifications/").data["count"], 0)

    def test_image_upload_and_notification_rich_content(self):
        buffer = BytesIO()
        Image.new("RGB", (2, 2)).save(buffer, format="PNG")
        with override_settings(
            STORAGES={
                "default": {"BACKEND": "django.core.files.storage.InMemoryStorage"}
            }
        ):
            upload = SimpleUploadedFile(
                "valid.png", buffer.getvalue(), content_type="image/png"
            )
            response = self.client.post(
                "/api/v1/platform/marketing/images/",
                {"image": upload},
                format="multipart",
            )
            self.assertEqual(response.status_code, 201)
            self.campaign.images.add(response.data["id"])
            publish(self.campaign.pk, preview(self.campaign)["token"])
            prepare_campaign(self.campaign.pk)
            self.client.force_authenticate(self.user)
            promotion = self.client.get("/api/v1/notifications/").data["results"][0][
                "promotion"
            ]
            self.assertEqual(promotion["body"], self.campaign.body)
            self.assertEqual(len(promotion["images"]), 1)


class NotificationNoiseTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="noise@test.example", full_name="Teste"
        )
        self.policy = NotificationCategoryPolicy.objects.get(category="system")

    def create(self, message="Aviso", event_key="", title="Mesmo título"):
        return NotificationService.create(
            self.user, title, message, event_key=event_key, schedule=False
        )

    def test_identical_content_is_suppressed_and_read_state_preserved(self):
        first = self.create()
        Notification.objects.filter(pk=first.pk).update(is_read=True)
        second = self.create()
        self.assertEqual(first.pk, second.pk)
        self.assertEqual(second.occurrence_count, 2)
        self.assertTrue(second.is_read)
        self.assertEqual(
            NotificationDailyGuard.objects.get(user=self.user).duplicate_count, 1
        )

    def test_archived_event_is_not_recreated(self):
        row = self.create(event_key="inventory.test:1")
        row.is_archived = True
        row.save()
        self.assertEqual(self.create(event_key="inventory.test:1").pk, row.pk)
        self.assertEqual(Notification.objects.count(), 1)

    def test_similar_events_group_and_daily_cap_limits_new_records(self):
        self.policy.group_similar_minutes = 10
        self.policy.max_per_day = 1
        self.policy.save()
        first = self.create(message="Animal A", event_key="test:1")
        second = self.create(message="Animal B", event_key="test:2")
        self.assertEqual(first.pk, second.pk)
        self.assertEqual(len(second.group_items), 2)
        self.assertIsNone(self.create(title="Outro evento"))
        guard = NotificationDailyGuard.objects.get(user=self.user)
        self.assertEqual(
            (guard.created_count, guard.grouped_count, guard.limited_count), (1, 1, 1)
        )

    def test_identical_content_in_different_categories_is_not_collapsed(self):
        system = self.create()
        stock = NotificationService.create(
            self.user, "Mesmo título", "Aviso", notif_type="stock", schedule=False
        )
        self.assertNotEqual(system.pk, stock.pk)
        self.assertEqual(stock.category, "stock")
