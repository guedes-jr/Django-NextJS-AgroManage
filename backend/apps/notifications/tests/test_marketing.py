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
from apps.organizations.models import Organization, OrganizationAddress
from apps.platform_admin.models import PlatformStaffProfile


class MarketingTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(role="admin",
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

    @patch("apps.notifications.tasks.process_marketing_outbox.delay")
    def test_publication_starts_outbox_after_commit(self, enqueue):
        with self.captureOnCommitCallbacks(execute=True):
            publish(self.campaign.pk, preview(self.campaign)["token"])
            enqueue.assert_not_called()
        enqueue.assert_called_once_with()

    @patch("apps.notifications.tasks.process_marketing_outbox.delay", side_effect=RuntimeError("broker unavailable"))
    def test_publication_keeps_durable_queue_when_broker_is_unavailable(self, enqueue):
        with self.captureOnCommitCallbacks(execute=True):
            publish(self.campaign.pk, preview(self.campaign)["token"])
        self.campaign.refresh_from_db()
        self.assertEqual(self.campaign.status, "queued")
        self.assertEqual(self.campaign.recipients.count(), 1)

    def test_user_sees_published_system_campaign_without_running_worker(self):
        self.campaign.category = "system"
        self.campaign.send_whatsapp = False
        self.campaign.save()
        self.pref.marketing_alerts = False
        self.pref.save()
        publish(self.campaign.pk, preview(self.campaign)["token"])
        self.assertEqual(self.campaign.notifications.count(), 0)
        self.client.force_authenticate(self.user)
        response = self.client.get("/api/v1/notifications/")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["count"], 1)
        row = response.data["results"][0]
        self.assertEqual(row["promotion"]["body"], self.campaign.body)
        self.assertFalse(row["is_read"])
        self.assertEqual(self.client.get("/api/v1/notifications/unread-count/").data["unread_count"], 1)
        self.client.get("/api/v1/notifications/")
        self.assertEqual(self.campaign.notifications.count(), 1)

    def test_unread_count_prepares_only_authenticated_users_pending_campaign(self):
        other = User.objects.create_user(
            email="second-inbox@marketing.test", full_name="Outro",
            organization=self.org, role="manager",
        )
        self.campaign.category = "system"
        self.campaign.send_whatsapp = False
        self.campaign.save()
        publish(self.campaign.pk, preview(self.campaign)["token"])
        self.client.force_authenticate(other)
        response = self.client.get("/api/v1/notifications/unread-count/")
        self.assertEqual(response.data["unread_count"], 1)
        self.assertEqual(self.campaign.notifications.get().user_id, other.pk)
        self.assertTrue(self.campaign.recipients.filter(user=self.user, prepared_at__isnull=True).exists())

    def test_inbox_does_not_deliver_draft_cancelled_or_whatsapp_only_campaigns(self):
        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.get("/api/v1/notifications/").data["count"], 0)
        self.campaign.send_in_app = False
        self.campaign.save()
        publish(self.campaign.pk, preview(self.campaign)["token"])
        self.assertEqual(self.client.get("/api/v1/notifications/").data["count"], 0)
        self.campaign.status = "cancelled"
        self.campaign.save()
        self.assertEqual(self.client.get("/api/v1/notifications/unread-count/").data["unread_count"], 0)
        self.assertEqual(self.campaign.notifications.count(), 0)

    def test_inbox_rechecks_marketing_consent_before_delivery(self):
        publish(self.campaign.pk, preview(self.campaign)["token"])
        self.pref.marketing_alerts = False
        self.pref.save()
        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.get("/api/v1/notifications/").data["count"], 0)
        self.assertEqual(self.campaign.notifications.count(), 0)

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

    def test_system_campaign_does_not_require_marketing_consent_or_policy(self):
        self.pref.marketing_alerts = False
        self.pref.financial_alerts = False
        self.pref.save()
        NotificationCategoryPolicy.objects.filter(category="marketing").update(enabled=False)
        self.user.role = "operator"
        self.user.save()
        self.audience.filters = {"roles": ["admin", "manager", "operator"], "organizations": [str(self.org.pk)]}
        self.audience.save()
        self.campaign.category = "system"
        self.campaign.send_whatsapp = False
        self.campaign.save()
        result = preview(self.campaign)
        self.assertEqual(result["in_app"], 1)
        self.assertEqual(result["blockers"], [])
        self.assertEqual(result["eligibility"]["marketing_not_authorized"], 0)
        publish(self.campaign.pk, result["token"])
        prepare_campaign(self.campaign.pk)
        notification = self.campaign.notifications.get()
        self.assertEqual(notification.category, "system")
        self.assertEqual(notification.type, "system")
        self.assertTrue(notification.show_in_app)
        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.get("/api/v1/notifications/").data["count"], 1)

    def test_system_campaign_still_respects_master_opt_out_and_selected_roles(self):
        self.campaign.category = "system"
        self.campaign.save()
        self.user.receive_system_alerts = False
        self.user.save()
        self.assertEqual(preview(self.campaign)["in_app"], 0)
        self.user.receive_system_alerts = True
        self.user.role = "operator"
        self.user.save()
        self.assertEqual(preview(self.campaign)["in_app"], 0)

    def test_system_campaign_reaches_users_without_notification_preferences(self):
        self.pref.delete()
        self.campaign.category = "system"
        self.campaign.send_whatsapp = False
        self.campaign.save()
        result = preview(self.campaign)
        self.assertEqual(result["in_app"], 1)
        publish(self.campaign.pk, result["token"])
        prepare_campaign(self.campaign.pk)
        self.assertEqual(self.campaign.notifications.count(), 1)
        self.assertFalse(NotificationPreference.objects.get(user=self.user).marketing_alerts)

    def test_system_campaign_rechecks_whatsapp_contact_authorization(self):
        NotificationCategoryPolicy.objects.filter(category="system").update(whatsapp_enabled=True)
        self.campaign.category = "system"
        self.campaign.save()
        publish(self.campaign.pk, preview(self.campaign)["token"])
        prepare_campaign(self.campaign.pk)
        self.user.phone_is_whatsapp = False
        self.user.save()
        notification = self.campaign.notifications.get()
        with patch("apps.notifications.tasks.wpp_request") as transport:
            dispatch_notification.run(str(notification.pk))
        transport.assert_not_called()
        self.assertEqual(notification.deliveries.get().status, "skipped")

    @override_settings(
        WPP_CONNECT_URL="http://wpp.test", WPP_CONNECT_TOKEN="test",
        WPP_CONNECT_SESSION="test",
    )
    @patch("apps.notifications.tasks.wpp_request", return_value=({"status": "success"}, None))
    def test_system_campaign_whatsapp_does_not_require_marketing_opt_in(self, transport):
        self.pref.marketing_alerts = False
        self.pref.save()
        NotificationCategoryPolicy.objects.filter(category="system").update(whatsapp_enabled=True)
        self.campaign.category = "system"
        self.campaign.save()
        result = preview(self.campaign)
        self.assertEqual(result["whatsapp"], 1)
        publish(self.campaign.pk, result["token"])
        prepare_campaign(self.campaign.pk)
        notification = self.campaign.notifications.get()
        dispatch_notification.run(str(notification.pk))
        self.assertEqual(notification.deliveries.get().status, "sent")
        transport.assert_called_once()

    def test_campaign_category_is_validated_and_changes_invalidate_preview(self):
        path = f"/api/v1/platform/marketing/campaigns/{self.campaign.pk}/"
        self.assertEqual(self.client.patch(path, {"category": "finance"}, format="json").status_code, 400)
        token = preview(self.campaign)["token"]
        response = self.client.patch(path, {"category": "system", "send_whatsapp": False}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        with self.assertRaises(ValidationError):
            publish(self.campaign.pk, token)

    def test_selected_organization_has_in_app_recipient_when_user_authorized(self):
        self.audience.filters = {"roles": ["manager"], "organizations": [str(self.org.pk)]}
        self.audience.save()
        self.campaign.send_whatsapp = False
        self.campaign.save()
        result = preview(self.campaign)
        self.assertEqual(result["organizations"], 1)
        self.assertEqual(result["in_app"], 1)
        self.assertEqual(result["eligibility"]["eligible_users"], 1)
        self.assertEqual(result["sample"][0]["eligible_users"], 1)
        publish(self.campaign.pk, result["token"])
        prepare_campaign(self.campaign.pk)
        notification = self.campaign.notifications.get()
        self.assertEqual(notification.user_id, self.user.pk)
        self.assertTrue(notification.show_in_app)

    def test_preview_explains_user_exclusions_without_including_other_organizations(self):
        self.audience.filters = {"roles": ["manager"], "organizations": [str(self.org.pk)]}
        self.audience.save()
        for name, fields in (
            ("inactive", {"is_active": False}),
            ("wrong-role", {"role": "operator"}),
            ("staff", {}),
            ("notifications-off", {"receive_system_alerts": False}),
            ("marketing-off", {}),
            ("missing-preferences", {}),
        ):
            user = User.objects.create_user(
                email=f"{name}@marketing.test", full_name=name,
                organization=self.org, **{"role": "manager", **fields},
            )
            if name != "missing-preferences":
                NotificationPreference.objects.create(user=user, marketing_alerts=name != "marketing-off")
            if name == "staff":
                PlatformStaffProfile.objects.create(user=user, role="platform_admin")
        other_org = Organization.objects.create(name="Fazenda externa", slug="external-preview")
        User.objects.create_user(
            email="outside@marketing.test", full_name="Outro", role="manager",
            organization=other_org,
        )
        result = preview(self.campaign)
        self.assertEqual(result["in_app"], 1)
        self.assertEqual(result["eligibility"], {
            "total_users": 7, "eligible_users": 1, "inactive_users": 1,
            "roles_excluded": 1, "platform_staff_excluded": 1,
            "notifications_disabled": 1, "marketing_not_authorized": 2,
        })

    def test_selected_organization_without_marketing_consent_explains_zero(self):
        self.pref.marketing_alerts = False
        self.pref.save()
        result = preview(self.campaign)
        self.assertEqual(result["organizations"], 1)
        self.assertEqual(result["in_app"], 0)
        self.assertEqual(result["eligibility"]["marketing_not_authorized"], 1)
        self.assertTrue(any("ainda não autorizaram" in blocker for blocker in result["blockers"]))

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

    def test_preview_explains_channel_and_recipient_blockers(self):
        policy = NotificationCategoryPolicy.objects.get(category="marketing")
        policy.enabled = False
        policy.in_app_enabled = False
        policy.whatsapp_enabled = False
        policy.save()
        result = preview(self.campaign)
        self.assertEqual(len(result["blockers"]), 3)
        self.assertTrue(any("categoria Propagandas" in item for item in result["blockers"]))
        self.assertTrue(any("No sistema" in item for item in result["blockers"]))
        self.assertTrue(any("WhatsApp" in item for item in result["blockers"]))
        policy.enabled = True
        policy.in_app_enabled = True
        policy.whatsapp_enabled = True
        policy.save()
        self.assertEqual(preview(self.campaign)["blockers"], [])
        self.pref.marketing_alerts = False
        self.pref.save()
        self.assertTrue(any("Nenhum destinatário" in item for item in preview(self.campaign)["blockers"]))

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

    def test_organization_query_accepts_independent_filters_without_saving(self):
        path = "/api/v1/platform/marketing/audiences/query/"
        original_count = MarketingAudience.objects.count()
        for filters in ({}, {"search": "Fazenda"}, {"organizations": [str(self.org.pk)]}):
            with self.subTest(filters=filters):
                response = self.client.post(path, filters, format="json")
                self.assertEqual(response.status_code, 200, response.data)
                self.assertEqual(response.data["count"], 1)
        response = self.client.post(path, {"search": "Inexistente"}, format="json")
        self.assertEqual(response.data["count"], 0)
        self.assertEqual(MarketingAudience.objects.count(), original_count)
        self.assertEqual(
            self.client.post(path, {"unknown": "value"}, format="json").status_code,
            400,
        )
        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.post(path, {}, format="json").status_code, 403)

    def test_organization_query_returns_paginated_details(self):
        self.org.document = "12345678000190"
        self.org.email = "contato@example.com"
        self.org.phone = "81999990000"
        self.org.save()
        OrganizationAddress.objects.create(
            organization=self.org, street="Rua Principal", city="Recife",
            state="PE", is_main=True,
        )
        for index in range(25):
            Organization.objects.create(name=f"Outra {index:02}", slug=f"query-{index}")
        Organization.objects.create(name="Inativa", slug="inactive-query", is_active=False)
        path = "/api/v1/platform/marketing/audiences/query/"
        response = self.client.post(path, {}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["count"], 26)
        self.assertEqual(len(response.data["results"]), 25)
        self.assertTrue(response.data["has_next"])
        row = response.data["results"][0]
        self.assertEqual(row["document"], self.org.document)
        self.assertEqual(row["email"], self.org.email)
        self.assertEqual(row["phone"], self.org.phone)
        self.assertEqual(row["city"], "Recife")
        self.assertEqual(row["state"], "PE")
        self.assertEqual(row["plan"], "Free")
        self.assertEqual(row["status"], self.org.subscription.get_status_display())
        self.org.subscription.delete()
        without_subscription = self.client.post(
            path, {"search": "Fazenda"}, format="json"
        )
        self.assertEqual(without_subscription.data["results"][0]["status"], "Sem assinatura")
        self.assertEqual(without_subscription.data["results"][0]["plan"], "Free")
        second = self.client.post(f"{path}?page=2", {}, format="json")
        self.assertEqual(second.data["page"], 2)
        self.assertFalse(second.data["has_next"])
        self.assertEqual(len(second.data["results"]), 1)
        descending = self.client.post(f"{path}?ordering=-name", {}, format="json")
        self.assertEqual(descending.data["results"][0]["name"], "Outra 24")
        self.assertEqual(
            self.client.post(f"{path}?ordering=invalid", {}, format="json").status_code,
            400,
        )

    def test_campaign_list_filters_by_content_audience_and_status(self):
        MarketingCampaign.objects.create(
            title="Outra divulgação", body="Informativo", audience=self.audience,
            status="cancelled",
        )
        path = "/api/v1/platform/marketing/campaigns/"
        for search in ("Oferta", "Novidade"):
            with self.subTest(search=search):
                response = self.client.get(path, {"search": search})
                self.assertEqual(response.status_code, 200, response.data)
                self.assertEqual(response.data["count"], 1)
                self.assertEqual(str(response.data["results"][0]["id"]), str(self.campaign.pk))
        response = self.client.get(path, {"search": self.audience.name, "status": "draft"})
        self.assertEqual(response.data["count"], 1)
        response = self.client.get(path, {"status": "cancelled"})
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["title"], "Outra divulgação")
        response = self.client.get(path, {"search": "Inexistente"})
        self.assertEqual(response.data["count"], 0)
        self.assertEqual(self.client.get(path, {"status": "invalid"}).status_code, 400)

    def test_campaign_requires_any_one_content_field(self):
        image = MarketingImage.objects.create(
            image="marketing/test.png", mime_type="image/png", uploaded_by=self.admin
        )
        path = "/api/v1/platform/marketing/campaigns/"
        for content in (
            {"title": "Oferta"},
            {"body": "Novidade"},
            {"link_url": "https://example.com"},
            {"images": [str(image.pk)]},
        ):
            with self.subTest(content=content):
                response = self.client.post(
                    path, {"audience": str(self.audience.pk), **content}, format="json"
                )
                self.assertEqual(response.status_code, 201, response.data)
        for content in ({}, {"title": "  ", "body": "\t", "images": []}):
            with self.subTest(content=content):
                response = self.client.post(
                    path, {"audience": str(self.audience.pk), **content}, format="json"
                )
                self.assertEqual(response.status_code, 400, response.data)

    def test_partial_campaign_updates_validate_remaining_content(self):
        path = f"/api/v1/platform/marketing/campaigns/{self.campaign.pk}/"
        response = self.client.patch(path, {"title": ""}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        response = self.client.patch(path, {"body": ""}, format="json")
        self.assertEqual(response.status_code, 400, response.data)
        image = MarketingImage.objects.create(
            image="marketing/test.png", mime_type="image/png", uploaded_by=self.admin
        )
        self.campaign.images.add(image)
        response = self.client.patch(path, {"body": ""}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        response = self.client.patch(path, {"images": []}, format="json")
        self.assertEqual(response.status_code, 400, response.data)

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
        self.user = User.objects.create_user(role="admin",
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
