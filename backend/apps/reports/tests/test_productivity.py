from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APITestCase

from apps.farms.models import Farm
from apps.finance.models import FinancialCategory, Transaction
from apps.inventory.models import ConsumoRacao, ItemEstoque
from apps.livestock.models import Animal, AnimalBatch, BatchPhaseHistory, HistoricoEvento, Mating, Pregnancy, Birth, Species, WeightRecord
from apps.organizations.models import Organization


class SwineProductivityTests(APITestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Produtividade", slug="productivity")
        self.other = Organization.objects.create(name="Outra", slug="other-productivity")
        self.farm = Farm.objects.create(organization=self.org, name="Granja")
        self.other_farm = Farm.objects.create(organization=self.other, name="Outra")
        self.species = Species.objects.create(code="suinos", name="Suínos")
        self.user = get_user_model().objects.create_user(email="productive@example.com", password="test", organization=self.org)
        self.client.force_authenticate(self.user)
        self.year = date.today().year - 1
        self.start = date(self.year, 1, 1)
        self.feed = ItemEstoque.objects.create(organization=self.org, nome="Ração", categoria="racao", especie_animal="suino", unidade_medida="kg")

    def batch(self, code="C001", farm=None, phase="creche", quantity=90):
        batch = AnimalBatch.objects.create(farm=farm or self.farm, species=self.species, batch_code=code,
            phase=phase, category="Leitão", quantity=quantity, entry_date=self.start, avg_weight_kg=30)
        BatchPhaseHistory.objects.create(batch=batch, phase=phase, quantity=100, avg_weight_kg=20, entry_date=self.start)
        return batch

    def consumption(self, batch, quantity=900, phase="", offset=0):
        return ConsumoRacao.objects.create(organization=self.org, farm=batch.farm, lote_animal=batch,
            item_estoque=self.feed, data_inicio=self.start+timedelta(days=offset), data_fim=self.start+timedelta(days=10+offset),
            fase_destino=phase, quantidade=quantity, custo_total=100)

    def report(self, **params):
        response = self.client.get(reverse("livestock-productivity-report"), {"year": self.year, **params})
        self.assertEqual(response.status_code, 200, response.data)
        return response.data

    def test_weights_feed_and_deaths_populate_phase_indicators(self):
        batch = self.batch()
        WeightRecord.objects.create(batch=batch, farm=self.farm, species=self.species, weighing_date=self.start+timedelta(days=10), weight_kg=30)
        self.consumption(batch)
        HistoricoEvento.objects.create(farm=self.farm, lote=batch, tipo_evento="Mortalidade de Lote", data_evento=self.start+timedelta(days=5), metadata={"quantidade_mortes": 10})
        data = self.report()
        phase = data["phases"]["creche"]
        self.assertEqual(phase["quantity"], 100)
        self.assertEqual(phase["weight_kg"], 30)
        self.assertEqual(phase["daily_gain_kg"], 1)
        self.assertEqual(phase["feed_kg"], 900)
        self.assertEqual(phase["mortality_pct"], 10)
        self.assertEqual(phase["feed_conversion"], 1)
        self.assertEqual(data["feed_conversion"], 1)

    def test_phase_overrides_category_and_farm_filters_exclude_other_records(self):
        farm2 = Farm.objects.create(organization=self.org, name="Granja 2")
        growth = self.batch("GROW", phase="crescimento", quantity=80)
        self.consumption(growth, 200)
        self.consumption(self.batch("OTHER", farm=farm2), 999)
        self.batch("FOREIGN", farm=self.other_farm, quantity=9999)
        data = self.report(farm=str(self.farm.pk))
        self.assertEqual(data["phases"]["crescimento"]["feed_kg"], 200)
        self.assertEqual(data["phases"]["creche"]["quantity"], 0)
        self.assertEqual(data["distribution"]["crescimento"], 80)
        self.assertEqual({item["id"] for item in data["farms"]}, {str(self.farm.pk), str(farm2.pk)})
        self.assertEqual(self.client.get(reverse("livestock-productivity-report"), {"year": self.year, "farm": str(self.other_farm.pk)}).status_code, 404)

    def test_missing_records_are_null_and_outside_year_is_not_counted(self):
        batch = self.batch()
        self.consumption(batch, offset=-370)
        data = self.report()
        self.assertIsNone(data["phases"]["creche"]["feed_kg"])
        self.assertIsNone(data["phases"]["creche"]["daily_gain_kg"])
        self.assertIsNone(data["feed_conversion"])
        self.assertEqual(data["phases"]["creche"]["mortality_pct"], 0)

    def test_sale_closure_preserves_sold_quantity_even_when_current_balance_is_zero(self):
        batch = self.batch(phase="engorda", quantity=0)
        batch.status = "sold"
        batch.exit_date = self.start+timedelta(days=10)
        batch.save()
        history = batch.phase_histories.get()
        history.exit_date = batch.exit_date
        history.quantity = 0
        history.avg_weight_kg = 100
        history.save()
        HistoricoEvento.objects.create(farm=self.farm, lote=batch, tipo_evento="Fechamento de Venda do Lote", data_evento=batch.exit_date,
            metadata={"phase": "engorda", "entry_quantity": 100, "entry_weight_kg": "80", "quantity": 90, "exit_date": str(batch.exit_date)})
        self.consumption(batch)
        phase = self.report()["phases"]["engorda"]
        self.assertEqual(phase["sold"], 90)
        self.assertEqual(phase["weight_kg"], 100)
        self.assertEqual(phase["days_to_sale"], 10)
        self.assertEqual(phase["daily_gain_kg"], 2)
        self.assertEqual(phase["feed_conversion"], .5)

    def test_profit_uses_selected_year_and_farm(self):
        mother = Animal.objects.create(farm=self.farm, species=self.species, identifier="M001", category="Matriz")
        category = FinancialCategory.objects.create(organization=self.org, name="Mão de Obra - Suinocultura", category_type="expense")
        Transaction.objects.create(organization=self.org, farm=self.farm, category=category, amount=250, due_date=self.start, payment_date=self.start, status="paid")
        Transaction.objects.create(organization=self.org, farm=self.farm, category=category, amount=9000, due_date=self.start.replace(year=self.year-1), payment_date=self.start.replace(year=self.year-1), status="paid")
        self.assertEqual(self.report(farm=str(self.farm.pk))["profit_per_matrix"], -250)
        feed = ConsumoRacao.objects.create(organization=self.org, farm=self.farm, item_estoque=self.feed,
            data_inicio=self.start, data_fim=self.start, quantidade=10, custo_total=100,
            categoria_destino="matrizes", fase_destino="gestacao")
        feed.animais.add(mother)
        self.assertEqual(self.report(farm=str(self.farm.pk))["profit_per_matrix"], -350)

    def test_crushing_mortality_uses_recorded_cause_and_does_not_assume_unknown_causes(self):
        female = Animal.objects.create(farm=self.farm, species=self.species, identifier="M002", category="Matriz")
        mating = Mating.objects.create(female=female, mating_date=self.start)
        pregnancy = Pregnancy.objects.create(female=female, mating=mating, start_date=self.start, expected_birth_date=self.start+timedelta(days=114))
        Birth.objects.create(female=female, pregnancy=pregnancy, birth_date=self.start, live_born=10, mortality=2)
        self.assertIsNone(self.report()["crushing_mortality_pct"])
        HistoricoEvento.objects.create(farm=self.farm, matriz=female, tipo_evento="Mortalidade Maternidade",
            data_evento=self.start+timedelta(days=1), metadata={"quantidade": 2, "causa": "ESMAGAMENTO"})
        self.assertEqual(self.report()["crushing_mortality_pct"], 20)

    def test_invalid_filters_are_rejected(self):
        for params in [{"year": "bad"}, {"year": 190}, {"farm": "bad"}]:
            self.assertEqual(self.client.get(reverse("livestock-productivity-report"), params).status_code, 400)
