from datetime import timedelta
from decimal import Decimal
from uuid import uuid4
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase
from apps.accounts.tokens import issue_tokens_for_user
from apps.farms.models import Farm
from apps.inventory.models import ItemEstoque, LoteEstoque, MovimentacaoEstoque, FormulaRacao, ConsumoRacao
from apps.livestock.models import AnimalBatch, Species, HistoricoEvento
from apps.organizations.models import Organization


from .cattle_feeding_fixtures import CattleFeedingFixture


class DailyFeedingTests(CattleFeedingFixture, APITestCase):
    url = "/api/v1/livestock/cattle/daily-feeding/"

    def test_feeder_scope_and_operational_projection_without_plans(self):
        result = self.client.get(self.url)
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(result.data["results"][0]["id"], str(self.batch.pk))
        self.assertNotIn("forecast", str(result.data))
        self.assertNotIn("cost", str(result.data))
        self.assertEqual(str(result.data["formulas"][0]["id"]), str(self.formula.pk))
        for path in ("reports/dashboard", "finance/transactions", "auth/members", "inventory/items", "livestock/cattle/feed-plans", "livestock/cattle/trough-readings", "tasks/agenda", "livestock/cattle/overview", "affiliates/me"):
            self.assertEqual(self.client.get(f"/api/v1/{path}/").status_code, 403, path)

    def test_trato_uses_existing_consumption_once_and_records_only_changes(self):
        values = self.values()
        for _ in range(2):
            response = self.client.post(self.url, values, format="json")
            self.assertEqual(response.status_code, 201, response.data)
            self.assertNotIn("cost", response.data)
        self.assertEqual(ConsumoRacao.objects.count(), 1)
        self.assertEqual(MovimentacaoEstoque.objects.count(), 1)
        self.assertEqual(HistoricoEvento.objects.filter(tipo_evento="Fornecimento de ração").count(), 1)
        self.lot.refresh_from_db()
        self.assertEqual(self.lot.quantidade_atual, 95)
        record = ConsumoRacao.objects.get()
        self.assertEqual(record.usuario, self.user)
        self.assertEqual(record.custo_total, 10)
        previous = HistoricoEvento.objects.count()
        for _ in range(2):
            result = self.client.get(self.url)
            self.assertEqual(result.data["results"][0]["supplied_kg"], 5)
        self.assertEqual(HistoricoEvento.objects.count(), previous)
        self.assertEqual(self.client.post(self.url, dict(values, quantity_kg="6"), format="json").status_code, 400)

    def test_requires_authorized_species_and_honors_read_only(self):
        self.user.allowed_livestock.clear()
        self.assertEqual(self.client.get(self.url).status_code, 403)
        self.user.allowed_livestock.add(self.species)
        self.user.operator_read_only = True; self.user.save(update_fields=["operator_read_only"])
        self.assertEqual(self.client.get(self.url).status_code, 200)
        self.assertEqual(self.client.post(self.url, self.values(), format="json").status_code, 403)
        self.assertFalse(ConsumoRacao.objects.exists())

    def test_foreign_tenant_formula_and_stock_failure_are_atomic(self):
        other = Organization.objects.create(name="Outra", slug="daily-other")
        farm = Farm.objects.create(organization=other, name="Outra")
        batch = AnimalBatch.objects.create(farm=farm, species=self.species, batch_code="Other", quantity=10, entry_date=self.today)
        formula = FormulaRacao.objects.create(organization=other, nome="Outra", especie_animal="bovino")
        self.assertEqual(len(self.client.get(self.url).data["results"]), 1)
        for changes, code in [({"batch": str(batch.pk)}, 404), ({"formula": str(formula.pk)}, 404), ({"quantity_kg": "101"}, 400), ({"date": str(self.today-timedelta(days=1))}, 400)]:
            self.assertEqual(self.client.post(self.url, self.values(**changes), format="json").status_code, code)
        self.assertFalse(ConsumoRacao.objects.exists())
        self.assertFalse(MovimentacaoEstoque.objects.exists())
        self.lot.refresh_from_db(); self.assertEqual(self.lot.quantidade_atual, 100)

    def test_formula_does_not_produce_feed_on_supply(self):
        self.formula.item_final = None; self.formula.save()
        self.assertEqual(self.client.post(self.url, self.values(), format="json").status_code, 400)
        self.assertFalse(ConsumoRacao.objects.exists())
        self.formula.item_final = self.item; self.formula.ativa = False; self.formula.save()
        self.assertEqual(self.client.post(self.url, self.values(), format="json").status_code, 400)
