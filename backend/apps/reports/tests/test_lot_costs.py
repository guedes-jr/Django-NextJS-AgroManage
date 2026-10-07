from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from rest_framework.test import APITestCase

from apps.farms.models import Farm
from apps.finance.models import FinancialCategory, Transaction
from apps.inventory.models import ConsumoRacao, ItemEstoque
from apps.livestock.models import (
    Animal,
    AnimalBatch,
    BatchPhaseHistory,
    Birth,
    HistoricoEvento,
    Mating,
    Pregnancy,
    Species,
    VaccinationRecord,
)
from apps.organizations.models import Organization
from apps.reports.lot_costs import enrich_lot_costs


class LotCostsTest(APITestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Lotes", slug="lot-costs")
        self.farm = Farm.objects.create(organization=self.org, name="Granja")
        self.species = Species.objects.create(name="Suínos", code="suinos")
        self.user = get_user_model().objects.create_user(
            email="lots@example.com", password="test", organization=self.org
        )
        self.client.force_authenticate(self.user)
        self.start = date(2026, 1, 1)
        self.feed = ItemEstoque.objects.create(
            organization=self.org, nome="Ração", categoria="racao", unidade_medida="kg"
        )
        self.batch = self.new_batch("L001", purchase_value=Decimal(100))

    def new_batch(self, code, **kwargs):
        return AnimalBatch.objects.create(
            farm=self.farm,
            species=self.species,
            batch_code=code,
            quantity=10,
            category="Leitão",
            origin="purchased",
            entry_date=self.start,
            phase="engorda",
            **kwargs,
        )

    def transaction(self, name, amount, batch=None, kind="expense", **kwargs):
        category, _ = FinancialCategory.objects.get_or_create(
            organization=self.org, name=name, category_type=kind
        )
        return Transaction.objects.create(
            organization=self.org,
            category=category,
            animal_batch=batch,
            amount=amount,
            due_date=self.start,
            payment_date=self.start,
            status="paid",
            **kwargs,
        )

    def report(self):
        response = self.client.get(
            reverse("livestock-inventory-report"),
            {"species": "suinos", "include_costs": "true"},
        )
        self.assertEqual(response.status_code, 200)
        return {row["id"]: row for row in response.data["items"]}

    def consumption(self, cost=30, **kwargs):
        return ConsumoRacao.objects.create(
            organization=self.org,
            farm=self.farm,
            lote_animal=self.batch,
            item_estoque=self.feed,
            data_inicio=self.start,
            data_fim=self.start,
            quantidade=10,
            custo_total=cost,
            **kwargs,
        )

    def test_real_cost_columns_sales_and_margin(self):
        self.consumption(fase_destino="creche")
        VaccinationRecord.objects.create(
            farm=self.farm,
            species=self.species,
            batch=self.batch,
            vaccine_name="Vacina",
            application_date=self.start,
            inventory_cost_snapshot=5,
        )
        self.transaction("Mão de Obra", 20, self.batch)
        self.transaction("Sêmen", 10, self.batch)
        self.transaction("Venda de Animais", 330, self.batch, kind="revenue")
        row = self.report()[str(self.batch.pk)]
        for key, amount in {
            "purchase": 100,
            "nursery": 30,
            "medication": 5,
            "labor": 20,
            "reproduction": 10,
            "total_cost": 165,
            "sales": 330,
            "profit": 165,
            "margin": 50,
            "cost_per_animal": Decimal("16.5"),
        }.items():
            self.assertEqual(Decimal(row[key]), amount, key)
        self.assertIsNone(row["finishing"])

    def test_phase_is_historical_not_current_and_unknown_stays_unassigned(self):
        BatchPhaseHistory.objects.create(
            batch=self.batch,
            phase="creche",
            quantity=10,
            entry_date=self.start,
            exit_date=self.start + timedelta(days=10),
        )
        self.consumption()
        self.consumption(cost=7, fase_destino="outro")
        row = self.report()[str(self.batch.pk)]
        self.assertEqual(Decimal(row["nursery"]), 30)
        self.assertIsNone(row["finishing"])
        self.assertEqual(Decimal(row["total_cost"]), 137)

    def test_general_labor_and_other_tenant_costs_are_not_allocated(self):
        self.transaction("Mão de Obra", 999)
        other = Organization.objects.create(name="Outra", slug="other-lot-costs")
        category = FinancialCategory.objects.create(
            organization=other, name="Mão de Obra", category_type="expense"
        )
        Transaction.objects.create(
            organization=other,
            category=category,
            animal_batch=self.batch,
            amount=2000,
            due_date=self.start,
            status="paid",
        )
        row = self.report()[str(self.batch.pk)]
        self.assertIsNone(row["labor"])
        self.assertEqual(Decimal(row["total_cost"]), 100)

    def test_legacy_purchase_and_cancellation_never_duplicate(self):
        tx = Transaction.objects.get(reference=f"PURCHASE-BATCH-{self.batch.pk}")
        tx.animal_batch = None
        tx.save()
        self.assertEqual(Decimal(self.report()[str(self.batch.pk)]["total_cost"]), 100)
        tx.status = "cancelled"
        tx.save()
        self.assertEqual(Decimal(self.report()[str(self.batch.pk)]["total_cost"]), 0)
        tx.delete()
        self.assertEqual(Decimal(self.report()[str(self.batch.pk)]["total_cost"]), 100)

    def test_sources_supply_mothers_without_duplicating_source_cost(self):
        mother = Animal.objects.create(
            farm=self.farm, species=self.species, identifier="M001", category="Matriz"
        )
        self.batch.mother = mother
        self.batch.save()
        target = self.new_batch("L002")
        target.source_batches.add(self.batch)
        rows = self.report()
        self.assertEqual(rows[str(target.pk)]["matrices"], ["M001"])
        self.assertEqual(Decimal(rows[str(target.pk)]["total_cost"]), 0)
        self.assertEqual(Decimal(rows[str(self.batch.pk)]["total_cost"]), 100)

    def test_maternal_gestation_and_lactation_feed_are_assigned_to_birth_batch(self):
        mother = Animal.objects.create(
            farm=self.farm, species=self.species, identifier="TN-026", category="Matriz"
        )
        mating = Mating.objects.create(
            female=mother, mating_date=self.start, mating_type="natural", status="confirmed"
        )
        pregnancy = Pregnancy.objects.create(
            mating=mating, female=mother, start_date=self.start,
            expected_birth_date=self.start + timedelta(days=114), status="completed",
        )
        birth_date = self.start + timedelta(days=114)
        Birth.objects.create(
            pregnancy=pregnancy, female=mother, batch=self.batch, birth_date=birth_date,
            live_born=10,
        )
        gestation = ConsumoRacao.objects.create(
            organization=self.org, farm=self.farm, item_estoque=self.feed,
            data_inicio=self.start + timedelta(days=30), data_fim=self.start + timedelta(days=30),
            quantidade=10, custo_total=Decimal("30"), categoria_destino="matrizes", fase_destino="gestante",
        )
        gestation.animais.add(mother)
        lactation = ConsumoRacao.objects.create(
            organization=self.org, farm=self.farm, item_estoque=self.feed,
            data_inicio=birth_date + timedelta(days=5), data_fim=birth_date + timedelta(days=5),
            quantidade=10, custo_total=Decimal("40"), categoria_destino="matrizes", fase_destino="lactante",
        )
        lactation.animais.add(mother)
        row = self.report()[str(self.batch.pk)]
        self.assertEqual(Decimal(row["gestation_feed"]), 30)
        self.assertEqual(Decimal(row["lactation_feed"]), 40)
        self.assertEqual(Decimal(row["total_cost"]), 170)

    def test_unknown_vaccine_cost_and_zero_quantity_are_not_fabricated(self):
        VaccinationRecord.objects.create(
            farm=self.farm,
            species=self.species,
            batch=self.batch,
            vaccine_name="Sem preço",
            application_date=self.start,
        )
        self.batch.quantity = 0
        self.batch.save()
        row = self.report()[str(self.batch.pk)]
        self.assertIsNone(row["medication"])
        self.assertIsNone(row["cost_per_animal"])
        self.assertIsNone(row["margin"])
        self.assertEqual(row["missing_cost_count"], 1)

    def test_sold_batch_uses_recorded_sale_quantity_for_per_animal_cost(self):
        self.batch.quantity = 0
        self.batch.status = "sold"
        self.batch.save()
        HistoricoEvento.objects.create(
            farm=self.farm,
            lote=self.batch,
            tipo_evento="Fechamento de Venda do Lote",
            descricao="Venda",
            data_evento=self.start,
            metadata={"quantity": 10},
        )
        row = self.report()[str(self.batch.pk)]
        self.assertEqual(Decimal(row["cost_per_animal"]), 10)

    def test_query_count_does_not_grow_per_batch(self):
        with CaptureQueriesContext(connection) as queries:
            enrich_lot_costs(self.org, [{"id": str(self.batch.pk)}])
        initial = len(queries)
        others = [self.new_batch(f"B{index}") for index in range(5)]
        with CaptureQueriesContext(connection) as queries:
            enrich_lot_costs(
                self.org, [{"id": str(batch.pk)} for batch in [self.batch, *others]]
            )
        self.assertEqual(len(queries), initial)
