from datetime import timedelta
from decimal import Decimal
from uuid import uuid4

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.tokens import issue_tokens_for_user
from apps.farms.models import Farm
from apps.inventory.models import ItemEstoque, LoteEstoque, MovimentacaoEstoque
from apps.livestock.models import AnimalBatch, Species, CattleFeedPlan, CattleFeedDelivery
from apps.organizations.models import Organization


class DailyFeedingTests(APITestCase):
    url = "/api/v1/livestock/cattle/daily-feeding/"

    def setUp(self):
        self.today = timezone.localdate()
        self.org = Organization.objects.create(name="Tratos", slug="daily-feed")
        self.farm = Farm.objects.create(organization=self.org, name="Fazenda")
        self.species, _ = Species.objects.get_or_create(code="bovinos", defaults={"name": "Bovinos"})
        self.user = get_user_model().objects.create_user(email="feeder@example.invalid", password="test", role="feeder", organization=self.org)
        self.user.allowed_livestock.add(self.species)
        self.batch = AnimalBatch.objects.create(farm=self.farm, species=self.species, batch_code="B1", quantity=10, entry_date=self.today)
        self.item = ItemEstoque.objects.create(organization=self.org, nome="Ração", categoria="racao", especie_animal="bovino", unidade_medida="kg")
        self.lot = LoteEstoque.objects.create(item=self.item, numero_lote="F1", quantidade_inicial=100, quantidade_atual=100, custo_unitario=2, data_entrada=self.today)
        self.plan = CattleFeedPlan.objects.create(batch=self.batch, item=self.item, kg_per_head_day=Decimal("0.5"), start_date=self.today)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {issue_tokens_for_user(self.user).access_token}")

    def values(self, **changes):
        return dict(dict(plan=str(self.plan.pk), date=str(self.today), quantity_kg="5", remaining_before_kg="1", request_key=str(uuid4())), **changes)

    def test_feeder_scope_and_operational_projection(self):
        result = self.client.get(self.url)
        self.assertEqual(result.status_code, 200, result.data)
        row = result.data["results"][0]
        self.assertEqual(row["daily_requirement_kg"], Decimal("5"))
        self.assertNotIn("cost", str(result.data))
        for path in ("reports/dashboard", "finance/transactions", "auth/members", "inventory/items", "livestock/cattle/feed-plans", "tasks/agenda", "livestock/cattle/overview", "affiliates/me"):
            with self.subTest(path=path):
                self.assertEqual(self.client.get(f"/api/v1/{path}/").status_code, 403)
        me = self.client.get("/api/v1/auth/me/").data["access"]
        self.assertFalse(me["can_view_financial"])
        self.assertFalse(me["can_operate_crops"])

    def test_delivery_is_audited_idempotent_and_moves_stock(self):
        values = self.values()
        for _ in range(2):
            response = self.client.post(self.url, values, format="json")
            self.assertEqual(response.status_code, 201, response.data)
            self.assertNotIn("cost", response.data)
        self.assertEqual(CattleFeedDelivery.objects.count(), 1)
        self.assertEqual(MovimentacaoEstoque.objects.filter(cattle_delivery__isnull=False).count(), 1)
        self.lot.refresh_from_db()
        self.assertEqual(self.lot.quantidade_atual, 95)
        delivery = CattleFeedDelivery.objects.get()
        self.assertEqual(delivery.created_by, self.user)
        self.assertEqual(delivery.cost, 10)
        row = self.client.get(self.url).data["results"][0]
        self.assertEqual(row["supplied_kg"], 5)
        self.assertNotIn("cost", str(row))

    def test_requires_authorized_species_and_honors_read_only(self):
        self.user.allowed_livestock.clear()
        self.assertEqual(self.client.get(self.url).status_code, 403)
        self.user.allowed_livestock.add(self.species)
        self.user.operator_read_only = True
        self.user.save(update_fields=["operator_read_only"])
        self.assertEqual(self.client.get(self.url).status_code, 200)
        self.assertEqual(self.client.post(self.url, self.values(), format="json").status_code, 403)
        self.assertFalse(CattleFeedDelivery.objects.exists())

    def test_foreign_tenant_and_stock_failure_do_not_change_ledger(self):
        other = Organization.objects.create(name="Outra", slug="daily-other")
        farm = Farm.objects.create(organization=other, name="Outra")
        batch = AnimalBatch.objects.create(farm=farm, species=self.species, batch_code="Other", quantity=10, entry_date=self.today)
        plan = CattleFeedPlan.objects.create(batch=batch, item=self.item, kg_per_head_day=1, start_date=self.today)
        self.assertEqual(len(self.client.get(self.url).data["results"]), 1)
        self.assertEqual(self.client.post(self.url, self.values(plan=str(plan.pk)), format="json").status_code, 404)
        for changes in ({"quantity_kg": "101"}, {"date": str(self.today - timedelta(days=1))}):
            self.assertEqual(self.client.post(self.url, self.values(**changes), format="json").status_code, 400)
        self.assertFalse(CattleFeedDelivery.objects.exists())
        self.lot.refresh_from_db()
        self.assertEqual(self.lot.quantidade_atual, 100)

    def test_only_current_plans_are_shown(self):
        self.plan.start_date = self.today + timedelta(days=1)
        self.plan.save()
        self.assertEqual(self.client.get(self.url).data["results"], [])
