from datetime import timedelta
from decimal import Decimal
import uuid

from django.contrib.auth import get_user_model
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.ai_assistant.ticket_services import open_ticket, add_message, transition_ticket
from apps.billing.services import create_manual_invoice
from apps.organizations.models import Organization
from apps.platform_admin.adoption import record_activity, aggregate_organization
from apps.platform_admin.models import PlatformStaffProfile

User = get_user_model()


class OrganizationOperationTests(APITestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Operação Alfa", slug="operation-alfa")
        self.other = Organization.objects.create(name="Operação Beta", slug="operation-beta")
        self.customer = User.objects.create_user(email="customer@operation.test", full_name="Responsável", organization=self.org, role="admin", organization_responsible=True)
        self.foreign = User.objects.create_user(email="foreign@operation.test", organization=self.other, role="admin")
        self.support = self.staff("platform_support")
        self.client.force_authenticate(self.support)

    def staff(self, role):
        user = User.objects.create_user(email=f"{role}@operation.test", full_name=role)
        PlatformStaffProfile.objects.create(user=user, role=role)
        return user

    def url(self, section="operation", org=None):
        return reverse(f"platform-organization-dossier-{section}", args=[(org or self.org).pk])

    def ticket(self, user=None, subject="Chamado Alfa", **values):
        return open_ticket(user=user or self.customer, values={"subject": subject, "body": "Preciso de suporte", "category": "technical", "priority": "urgent", "creation_key": uuid.uuid4(), "shared_context": "", **values})

    def invoice(self, organization, *, status="open", total=100, paid=0, currency="BRL", due=-1):
        value = create_manual_invoice(organization=organization, due_date=timezone.localdate() + timedelta(days=due), description="Contrato", amount=Decimal(total))
        value.status, value.amount_paid, value.currency = status, Decimal(paid), currency
        value.save()
        return value

    def test_operation_uses_real_quota_adoption_and_current_responsible(self):
        sub = self.org.subscription
        sub.custom_limits = {"max_users": 1}; sub.save()
        record_activity(self.customer, "login", timezone.now() - timedelta(days=10))
        adoption = aggregate_organization(self.org.pk)
        response = self.client.get(self.url())
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["responsible"]["id"], self.customer.pk)
        self.assertTrue(response.data["has_active_admin"])
        self.assertEqual(response.data["usage"]["resources"]["users"]["status"], "at_limit")
        self.assertEqual(response.data["adoption"], adoption)
        codes = {issue["code"] for issue in response.data["issues"]}
        self.assertIn("quota_limit", codes); self.assertIn("without_use", codes)
        direct = self.client.get(reverse("platform-organization-dossier-usage", args=[self.org.pk]))
        self.assertEqual(response.data["usage"], direct.data)

    def test_billing_directory_dashboard_and_dossier_share_effective_pendency(self):
        self.invoice(self.org, paid=40)
        self.invoice(self.org, currency="USD", total=30)
        self.invoice(self.org, status="void")
        self.invoice(self.org, status="draft")
        self.invoice(self.org, status="open", paid=100)
        self.invoice(self.org, due=2)
        self.invoice(self.other, status="uncollectible", total=20)
        data = self.client.get(self.url()).data
        self.assertEqual(data["billing"]["overdue_count"], 2)
        self.assertEqual(data["billing"]["unpaid_count"], 3)
        self.assertEqual({row["currency"]: Decimal(row["outstanding"]) for row in data["billing"]["overdue_amounts"]}, {"BRL": Decimal("60"), "USD": Decimal("30")})
        dashboard = self.client.get(reverse("platform-dashboard")).data
        self.assertEqual(dashboard["finance"]["overdue_invoices"], 3)
        directory = self.client.get(reverse("platform-organization-list"), {"financial_pending": "true"}).data
        self.assertEqual(directory["count"], 2)

    def test_ticket_scope_filters_and_inline_data_never_include_private_body(self):
        ticket = self.ticket()
        foreign = self.ticket(self.foreign, "Chamado Beta")
        add_message(user=self.support, ticket_id=ticket.pk, staff=True, values={"body": "PRIVATE NOTE BODY", "is_internal": True, "request_key": uuid.uuid4(), "expected_version": ticket.version})
        response = self.client.get(self.url("tickets"), {"organization_id": str(self.other.pk), "page_size": 1})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual([row["id"] for row in response.data["results"]], [str(ticket.pk)])
        self.assertNotIn(str(foreign.pk), str(response.data))
        self.assertNotIn("PRIVATE NOTE BODY", str(response.data))
        self.assertEqual(self.client.get(self.url("tickets"), {"search": "Beta"}).data["count"], 0)
        self.assertEqual(self.client.get(self.url("tickets"), {"status": "resolved"}).data["count"], 0)
        self.assertEqual(self.client.get(self.url("tickets"), {"priority": "invalid"}).status_code, 400)
        self.assertEqual(self.client.post(self.url("tickets"), {}).status_code, 405)

    def test_support_metrics_match_dashboard_with_waiting_and_closed_excluded(self):
        first = self.ticket()
        waiting = self.ticket(subject="Aguardando cliente")
        transition_ticket(user=self.support, ticket_id=waiting.pk, staff=True, values={"status": "waiting_customer", "expected_version": waiting.version})
        closed = self.ticket(subject="Finalizado")
        transition_ticket(user=self.support, ticket_id=closed.pk, staff=True, values={"status": "resolved", "expected_version": closed.version})
        foreign = self.ticket(self.foreign, "Outro cliente")
        local = self.client.get(self.url()).data["support"]
        self.assertEqual(local["total"], 3)
        self.assertEqual(local["active"], 2)
        self.assertEqual(local["awaiting_team"], 1)
        self.assertEqual(local["waiting_customer"], 1)
        self.assertEqual(local["urgent"], 2)
        self.assertEqual(local["without_first_response"], 2)
        dashboard = self.client.get(reverse("platform-dashboard")).data["support"]
        other = self.client.get(self.url(org=self.other)).data["support"]
        for key in local:
            self.assertEqual(dashboard[key], local[key] + other[key])

    def test_roles_hide_ticket_capability_and_metrics_and_block_scoped_endpoint(self):
        self.ticket()
        for role in ["platform_owner", "platform_admin", "platform_finance", "platform_auditor", "platform_developer"]:
            user = self.staff(role)
            self.client.force_authenticate(user)
            allowed = role in {"platform_owner", "platform_admin"}
            detail = self.client.get(reverse("platform-organization-detail", args=[self.org.pk])).data
            self.assertEqual("tickets" in detail["available_sections"], allowed)
            self.assertIn("operation", detail["available_sections"])
            operation = self.client.get(self.url())
            self.assertEqual(operation.status_code, 200)
            self.assertEqual(operation.data["support"] is not None, allowed)
            self.assertEqual(self.client.get(self.url("tickets")).status_code, 200 if allowed else 403)
            self.assertEqual(self.client.get(reverse("platform-dashboard")).data["support"] is not None, allowed)
            if not allowed:
                self.assertFalse(any(item["section"] == "tickets" for item in operation.data["issues"]))
        self.client.force_authenticate(self.customer)
        self.assertEqual(self.client.get(self.url()).status_code, 403)
        self.assertEqual(self.client.get(self.url("tickets")).status_code, 403)

    def test_assisted_and_inactive_staff_cannot_access_ticket_integration(self):
        self.support.organization = self.org
        self.support.support_access_grant = object()
        self.client.force_authenticate(self.support)
        self.assertEqual(self.client.get(self.url("tickets")).status_code, 403)
        self.assertIsNone(self.client.get(self.url()).data["support"])
        self.assertNotIn("tickets", self.client.get(reverse("platform-organization-detail", args=[self.org.pk])).data["available_sections"])
        del self.support.support_access_grant
        PlatformStaffProfile.objects.filter(user=self.support).update(is_active=False)
        self.support.refresh_from_db()
        self.client.force_authenticate(self.support)
        self.assertEqual(self.client.get(self.url()).status_code, 403)

    def test_empty_unknown_history_and_internal_responsible_are_explicit(self):
        self.org.subscription.delete()
        self.customer.organization_responsible = False
        self.customer.save(update_fields=["organization_responsible"])
        self.support.organization = self.org
        self.support.organization_responsible = True
        self.support.save()
        response = self.client.get(self.url())
        self.assertEqual(response.status_code, 200, response.data)
        self.assertIsNone(response.data["adoption"])
        self.assertIsNone(response.data["responsible"])
        self.assertEqual(response.data["support"]["total"], 0)
        codes = {item["code"] for item in response.data["issues"]}
        self.assertIn("adoption_pending", codes); self.assertIn("without_subscription", codes)
        self.assertIn("without_responsible", codes)
        self.assertNotIn("without_use", codes)
        detail = self.client.get(reverse("platform-organization-detail", args=[self.org.pk])).data
        self.assertIsNone(detail["responsible"])

    def test_read_only_missing_org_and_query_count_with_many_tickets(self):
        self.ticket()
        with CaptureQueriesContext(connection) as first:
            self.client.get(self.url("tickets"))
        for index in range(10):
            self.ticket(subject=f"Ticket {index}")
        with CaptureQueriesContext(connection) as second:
            response = self.client.get(self.url("tickets"))
        self.assertEqual(response.data["count"], 11)
        self.assertEqual(len(first), len(second))
        self.assertEqual(self.client.post(self.url(), {}).status_code, 405)
        self.assertEqual(self.client.get(reverse("platform-organization-dossier-operation", args=[uuid.uuid4()])).status_code, 404)


class UnpricedSegmentAndQuoteExpiryTests(APITestCase):
    def setUp(self):
        from apps.billing.models import Plan, PlanSegment, PlanTier, Subscription, SubscriptionItem

        self.org = Organization.objects.create(name="Sem preço", slug="sem-preco")
        self.priced = Organization.objects.create(name="Com preço", slug="com-preco")
        plan = Plan.objects.first() or Plan.objects.create(code="segmentado", name="Segmentado")
        segment = PlanSegment.objects.get_or_create(code="gado-de-corte", defaults={"name": "Gado de corte"})[0]
        tier = PlanTier.objects.get_or_create(segment=segment, label="Sob consulta", defaults={"requires_quote": True, "sort_order": 99})[0]
        for organization, price in ((self.org, None), (self.priced, Decimal("39.90"))):
            subscription = Subscription.objects.filter(organization=organization).first() or Subscription.objects.create(organization=organization, plan=plan, started_at=timezone.now())
            SubscriptionItem.objects.filter(subscription=subscription).update(final_monthly_price=Decimal("10.00"))
            SubscriptionItem.objects.filter(subscription=subscription, segment_code="gado-de-corte").delete()
            SubscriptionItem.objects.create(subscription=subscription, tier=tier, segment_code="gado-de-corte", segment_name="Gado de corte", tier_label=tier.label, monthly_price=price, discount_percent=0, final_monthly_price=price)
        staff = User.objects.create_user(email="admin@unpriced.test", full_name="Admin")
        PlatformStaffProfile.objects.create(user=staff, role="platform_admin")
        self.client.force_authenticate(staff)

    def test_unpriced_segment_is_an_issue_and_a_list_filter(self):
        data = self.client.get(reverse("platform-organization-dossier-operation", args=[self.org.pk])).data
        self.assertIn("unpriced_segments", [issue["code"] for issue in data["issues"]])
        self.assertEqual(data["billing"]["unpriced_segments"], ["Gado de corte"])
        priced = self.client.get(reverse("platform-organization-dossier-operation", args=[self.priced.pk])).data
        self.assertNotIn("unpriced_segments", [issue["code"] for issue in priced["issues"]])
        ids = {row["id"] for row in self.client.get(reverse("platform-organization-list"), {"unpriced_segments": "true"}).data["results"]}
        self.assertIn(str(self.org.pk), ids)
        self.assertNotIn(str(self.priced.pk), ids)

    def test_expired_draft_quotes_are_closed_by_task(self):
        from apps.billing.models import SubscriptionQuote
        from apps.billing.tasks import expire_subscription_quotes

        fields = {"billing_cycle": "monthly", "monthly_subtotal": 0, "monthly_discount": 0, "monthly_total": 0, "billing_total": 0}
        old = SubscriptionQuote.objects.create(expires_at=timezone.now() - timedelta(days=1), **fields)
        fresh = SubscriptionQuote.objects.create(expires_at=timezone.now() + timedelta(days=1), **fields)
        self.assertEqual(expire_subscription_quotes(), 1)
        old.refresh_from_db(); fresh.refresh_from_db()
        self.assertEqual((old.status, fresh.status), ("expired", "draft"))
