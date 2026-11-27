from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.billing import recurring
from apps.billing.models import Invoice, PlanTier, SegmentStatusEvent, Subscription
from apps.billing.segment_lifecycle import deactivate
from apps.farms.models import Farm
from apps.finance.models import BankAccount, FinancialCategory, Transaction
from apps.livestock.models import AnimalBatch, Species
from apps.organizations.models import Organization

User = get_user_model()


class SegmentRemovalTests(APITestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Fazenda Mista", slug="fazenda-mista")
        self.subscription = self.org.subscription  # default segments: plantações, corte, leite, suínos
        self.user = User.objects.create_user(email="dono@example.com", password="SenhaForte123", full_name="Dono", role="admin", organization=self.org)
        self.client.force_authenticate(self.user)
        self.farm = Farm.objects.create(name="Sede", organization=self.org)
        self.swine, _ = Species.objects.get_or_create(code="suinos", defaults={"name": "Suínos"})
        self.cattle, _ = Species.objects.get_or_create(code="bovinos", defaults={"name": "Bovinos"})
        self.pigs = AnimalBatch.objects.create(farm=self.farm, species=self.swine, batch_code="S1", quantity=50, entry_date=date(2026, 1, 1), status="active", phase="engorda")
        self.steers = AnimalBatch.objects.create(farm=self.farm, species=self.cattle, batch_code="C1", quantity=20, entry_date=date(2026, 1, 1), status="active", cattle_purpose="beef")
        self.account = BankAccount.objects.create(organization=self.org, name="Caixa", initial_balance=Decimal("0"))
        revenue = FinancialCategory.objects.create(organization=self.org, name="Venda de suínos", category_type="revenue")
        self.sale = Transaction.objects.create(
            organization=self.org, farm=self.farm, category=revenue, description="Venda S1", amount=Decimal("1000.00"),
            due_date=date(2026, 3, 1), payment_date=date(2026, 3, 1), status="paid", animal_batch=self.pigs, bank_account=self.account,
        )
        self.assertEqual(self.sale.segmento, "suinos")

    def keep_quote(self, codes):
        """Quote of the current subscription without the given segment codes (same tiers)."""
        tiers = [str(item.tier_id) for item in self.subscription.items.filter(is_active=True).exclude(segment_code__in=codes)]
        return self.client.post("/api/v1/organizations/me/subscription/change-preview/", {"tier_ids": tiers, "billing_cycle": "monthly"}, format="json")

    def remove_swine(self, confirm=True):
        preview = self.keep_quote(["suinocultura"])
        self.assertEqual(preview.status_code, 201, preview.data)
        body = {"quote_token": preview.data["quote"]["public_token"]}
        if confirm:
            body["confirm_finance_removal"] = True
        return preview, self.client.post("/api/v1/organizations/me/subscription/change/", body, format="json")

    def test_preview_shows_what_is_lost_and_kept(self):
        preview = self.keep_quote(["suinocultura"])
        removed = preview.data["removed_segments"]
        self.assertEqual([row["segment_code"] for row in removed], ["suinocultura"])
        self.assertEqual(removed[0]["finance"]["count"], 1)
        self.assertEqual(removed[0]["finance"]["revenue"], "1000.00")
        self.assertEqual(removed[0]["kept"]["batches"], 1)
        self.assertTrue(preview.data["requires_finance_confirmation"])

    def test_removal_requires_explicit_finance_confirmation(self):
        _, response = self.remove_swine(confirm=False)
        self.assertEqual(response.status_code, 400)
        self.assertIn("confirm_finance_removal", response.data)
        self.assertEqual(response.data["removed_segments"][0]["finance"]["count"], 1)
        self.assertTrue(self.subscription.items.get(segment_code="suinocultura").is_active)

    def test_removal_hides_data_archives_finance_and_keeps_rows(self):
        _, response = self.remove_swine()
        self.assertEqual(response.status_code, 200, response.data)
        item = self.subscription.items.get(segment_code="suinocultura")
        self.assertFalse(item.is_active)
        # Nothing deleted: the batch and the archived launch stay for the platform audit.
        self.assertTrue(AnimalBatch.objects.filter(pk=self.pigs.pk).exists())
        archived = Transaction.all_objects.get(pk=self.sale.pk)
        self.assertIsNotNone(archived.archived_at)
        self.assertFalse(Transaction.objects.filter(pk=self.sale.pk).exists())
        self.account.refresh_from_db()
        self.assertEqual(self.account.current_balance, Decimal("0"))
        event = SegmentStatusEvent.objects.get(organization=self.org, segment_code="suinocultura")
        self.assertEqual((event.action, event.archived_transactions, event.archived_revenue), ("deactivated", 1, Decimal("1000.00")))
        # The organization no longer sees nor feeds the segment.
        listed = self.client.get("/api/v1/livestock/batches/")
        ids = {row["id"] for row in (listed.data.get("results", listed.data) if isinstance(listed.data, dict) else listed.data)}
        self.assertNotIn(str(self.pigs.pk), ids)
        self.assertIn(str(self.steers.pk), ids)
        self.assertEqual(self.client.get("/api/v1/livestock/batches/", {"species": "suinos"}).status_code, 403)
        created = self.client.post("/api/v1/livestock/batches/?species=suinos", {
            "farm": str(self.farm.pk), "species": str(self.swine.pk), "batch_code": "S2", "quantity": 5, "entry_date": "2026-04-01", "status": "active",
        }, format="json")
        self.assertEqual(created.status_code, 403, created.data)
        self.assertFalse(AnimalBatch.objects.filter(batch_code="S2").exists())
        with self.assertRaises(Exception):
            Transaction.objects.create(organization=self.org, category=self.sale.category, description="Nova", amount=1, due_date=date(2026, 4, 1), segmento="suinos")
        dashboard = self.client.get("/api/v1/reports/dashboard/", {"period": "month", "period_value": "2026-03"})
        self.assertEqual(dashboard.status_code, 200)
        cards = [card["code"] for card in dashboard.data["segments"]["livestock_by_species"]]
        self.assertNotIn("suinos", cards)
        self.assertEqual(dashboard.data["kpis"]["month_revenue"], 0)
        self.assertEqual(self.client.get("/api/v1/auth/me/").data["access"]["segments"].count("suinocultura"), 0)

    def test_reactivation_shows_animals_again_but_not_finance(self):
        self.remove_swine()
        preview = self.client.post("/api/v1/organizations/me/subscription/change-preview/", {
            "tier_ids": [str(item.tier_id) for item in self.subscription.items.all()], "billing_cycle": "monthly",
        }, format="json")
        self.assertEqual(preview.data["added_segments"], ["suinocultura"])
        response = self.client.post("/api/v1/organizations/me/subscription/change/", {"quote_token": preview.data["quote"]["public_token"]}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(self.subscription.items.get(segment_code="suinocultura").is_active)
        listed = self.client.get("/api/v1/livestock/batches/", {"species": "suinos"})
        self.assertEqual(listed.status_code, 200)
        self.assertFalse(Transaction.objects.filter(pk=self.sale.pk).exists())
        self.assertEqual(SegmentStatusEvent.objects.filter(organization=self.org, segment_code="suinocultura", action="activated").count(), 1)

    def test_only_beef_hides_dairy_animals_of_admin(self):
        cow = AnimalBatch.objects.create(farm=self.farm, species=self.cattle, batch_code="L1", quantity=8, entry_date=date(2026, 1, 1), status="active", cattle_purpose="dairy")
        deactivate(self.subscription, "pecuaria-leiteira", actor=self.user)
        listed = self.client.get("/api/v1/livestock/batches/")
        ids = {row["id"] for row in (listed.data.get("results", listed.data) if isinstance(listed.data, dict) else listed.data)}
        self.assertIn(str(self.steers.pk), ids)
        self.assertNotIn(str(cow.pk), ids)
        self.assertEqual(self.client.get("/api/v1/livestock/cattle/milk/").status_code, 403)

    def test_last_active_segment_cannot_be_removed(self):
        for code in ("plantacoes", "gado-de-corte", "pecuaria-leiteira"):
            deactivate(self.subscription, code, actor=self.user)
        with self.assertRaises(Exception):
            deactivate(self.subscription, "suinocultura", actor=self.user, confirm_finance=True)

    @override_settings(BILLING_AUTO_INVOICING_ENABLED=True)
    def test_removal_recalculates_unpaid_invoice_of_next_period_only(self):
        crops_tier = PlanTier.objects.filter(segment__code="plantacoes", is_active=True, monthly_price__isnull=False).first()
        swine_tier = PlanTier.objects.filter(segment__code="suinocultura", is_active=True, monthly_price__isnull=False).first()
        if not crops_tier or not swine_tier:
            self.skipTest("Catálogo sem faixas com preço")
        self.subscription.items.exclude(segment_code__in=["plantacoes", "suinocultura"]).update(is_active=False)
        self.subscription.items.filter(segment_code="plantacoes").update(tier=crops_tier, final_monthly_price=crops_tier.monthly_price)
        self.subscription.items.filter(segment_code="suinocultura").update(tier=swine_tier, final_monthly_price=swine_tier.monthly_price)
        next_period = timezone.localdate() + timedelta(days=3)
        Subscription.objects.filter(pk=self.subscription.pk).update(current_period_ends_at=recurring._aware(next_period))
        self.subscription.refresh_from_db()
        invoice = recurring.issue_cycle_invoice(self.subscription)
        self.assertEqual(invoice.total, crops_tier.monthly_price + swine_tier.monthly_price)
        event = deactivate(self.subscription, "suinocultura", actor=self.user, confirm_finance=True)
        invoice.refresh_from_db()
        self.assertEqual(event.invoice_adjustment, "updated")
        self.assertEqual(invoice.total, crops_tier.monthly_price)
        self.assertEqual(invoice.status, Invoice.Status.OPEN)

    def test_scope_report_lists_hidden_rows_without_changing_anything(self):
        from io import StringIO

        from django.core.management import call_command

        deactivate(self.subscription, "suinocultura", actor=self.user, confirm_finance=True)
        out = StringIO()
        call_command("segment_scope_report", "--organization", self.org.slug, stdout=out)
        text = out.getvalue()
        self.assertIn("Suinocultura", text)
        self.assertIn("lotes ocultos: 1", text)
        self.assertIn("já arquivados: 1", text)
        self.assertIn("Nada foi alterado", text)
        self.assertTrue(AnimalBatch.objects.filter(pk=self.pigs.pk).exists())
