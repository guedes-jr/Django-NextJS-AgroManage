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
        self.user = get_user_model().objects.create_user(role="admin",
            email="lots@example.com", password="test", organization=self.org
        )
        self.client.force_authenticate(self.user)
        self.start = date(2026, 1, 1)
        self.feed = ItemEstoque.objects.create(
            organization=self.org, nome="Ração", categoria="racao", unidade_medida="kg"
        )
        self.batch = self.new_batch("L001", purchase_value=Decimal(100))

    def new_batch(self, code, **kwargs):
        values = dict(
            farm=self.farm,
            species=self.species,
            batch_code=code,
            quantity=10,
            category="Leitão",
            origin="purchased",
            entry_date=self.start,
            phase="engorda",
        )
        values.update(kwargs)
        return AnimalBatch.objects.create(**values)

    def transaction(self, name, amount, batch=None, kind="expense", **kwargs):
        category, _ = FinancialCategory.objects.get_or_create(
            organization=self.org, name=name, category_type=kind
        )
        return Transaction.objects.create(
            organization=self.org,
            category=category,
            animal_batch=batch,
            amount=amount,
            **{"due_date": self.start, "payment_date": self.start, "status": "paid", **kwargs},
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

    def test_total_lot_size_stays_after_sales_and_current_goes_to_zero(self):
        lot = self.new_batch("L010", quantity=10)
        HistoricoEvento.objects.create(farm=self.farm, lote=lot, tipo_evento="Entrada de Lote",
            data_evento=self.start, metadata={"quantidade": 10})
        lot.quantity = 5  # first sale: 5 animals
        lot.save()
        HistoricoEvento.objects.create(farm=self.farm, lote=lot, tipo_evento="Venda de Animais",
            data_evento=self.start, metadata={"quantity": 5})
        row = self.report()[str(lot.pk)]
        self.assertEqual((row["total_quantity"], row["current_quantity"]), (10, 5))
        lot.status = "sold"  # closing sale keeps quantity=5 on the model
        lot.save()
        row = self.report()[str(lot.pk)]
        self.assertEqual((row["total_quantity"], row["current_quantity"]), (10, 0))

    def test_total_lot_size_without_entry_record_uses_sales_and_deaths(self):
        lot = self.new_batch("L011", quantity=6, origin="born", purchase_value=None)
        HistoricoEvento.objects.create(farm=self.farm, lote=lot, tipo_evento="Venda de Animais",
            data_evento=self.start, metadata={"quantity": 3})
        HistoricoEvento.objects.create(farm=self.farm, lote=lot, tipo_evento="Mortalidade de Lote",
            data_evento=self.start, metadata={"quantidade_mortes": 1})
        self.assertEqual(self.report()[str(lot.pk)]["total_quantity"], 10)

    def test_recorded_sale_counts_before_it_is_received(self):
        sold = self.new_batch("L009")
        self.transaction("Venda de Animais", 500, sold, kind="revenue", status="pending", payment_date=None,
            reference=f"SALE-BATCH-{sold.pk}")
        self.transaction("Venda de Animais", 70, sold, kind="revenue", status="cancelled")
        row = self.report()[str(sold.pk)]
        self.assertEqual(Decimal(row["sales"]), 500)
        self.assertEqual(Decimal(row["profit"]), 500 - Decimal(row["total_cost"]))

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

    def test_general_labor_is_allocated_to_active_lots_and_other_tenant_costs_are_ignored(self):
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
        self.assertEqual(Decimal(row["labor"]), 999)
        self.assertEqual(Decimal(row["total_cost"]), 1099)

    def test_swine_labor_is_shared_between_active_lots_by_quantity(self):
        other = self.new_batch("L002")
        other.quantity = 30
        other.save()
        breeding = self.new_batch("MATRIZ", category="Matriz")
        breeding.species = self.species
        breeding.save()
        self.transaction("Mão de Obra - Suinocultura", Decimal("100.00"), reference="LABOR-SWINE-1")

        rows = self.report()
        self.assertEqual(Decimal(rows[str(self.batch.pk)]["labor"]), Decimal("25.00"))
        self.assertEqual(Decimal(rows[str(other.pk)]["labor"]), Decimal("75.00"))
        self.assertIsNone(rows[str(breeding.pk)]["labor"])
        self.assertEqual(
            sum(Decimal(row["labor"]) for row in rows.values() if row["labor"]),
            Decimal("100.00"),
        )

    def test_labor_before_phase_transfer_keeps_its_share_in_full_and_filtered_reports(self):
        from apps.livestock.services import transfer_batch_phase

        self.batch.phase = "creche"
        self.batch.save(update_fields=["phase"])
        other = self.new_batch("L002", quantity=30)
        self.transaction("Mão de Obra - Suinocultura", Decimal("100.00"), reference="LABOR-SWINE-TRANSFER")
        transfer_batch_phase(self.batch, "crescimento", self.start + timedelta(days=10))
        rows = self.report()
        self.assertEqual(Decimal(rows[str(self.batch.pk)]["labor"]), Decimal("25.00"))
        self.assertEqual(Decimal(rows[str(other.pk)]["labor"]), Decimal("75.00"))

        response = self.client.get(reverse("livestock-inventory-report"), {
            "species": "suinos", "include_costs": "true", "search": self.batch.batch_code,
        })
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(len(response.data["items"]), 1)
        self.assertEqual(Decimal(response.data["items"][0]["labor"]), Decimal("25.00"))

    def test_labor_before_balance_closing_is_retained(self):
        from apps.livestock.services import close_batch_balance

        self.transaction("Mão de Obra - Suinocultura", Decimal("100.00"), reference="LABOR-SWINE-BEFORE-CLOSE")
        close_batch_balance(self.batch, self.start + timedelta(days=1))
        self.assertEqual(Decimal(self.report()[str(self.batch.pk)]["labor"]), Decimal("100.00"))

    def test_sold_lot_keeps_labor_and_later_labor_goes_to_available_lots(self):
        other = self.new_batch("L002", quantity=30)
        self.transaction("Mão de Obra - Suinocultura", Decimal("100.00"), reference="LABOR-SWINE-1")
        sale_day = self.start + timedelta(days=30)
        HistoricoEvento.objects.create(farm=self.farm, lote=self.batch, tipo_evento="Venda de Animais",
            data_evento=sale_day, metadata={"quantity": 10})
        self.batch.status, self.batch.exit_date = "sold", sale_day
        self.batch.save()
        self.transaction("Mão de Obra - Suinocultura", Decimal("80.00"), reference="LABOR-SWINE-2",
            due_date=sale_day + timedelta(days=1))
        self.transaction("Mão de Obra", Decimal("40.00"), self.batch, due_date=sale_day + timedelta(days=2))

        rows = self.report()
        # Before the sale: 10 of 40 animals -> 25.00 stays with the sold lot.
        self.assertEqual(Decimal(rows[str(self.batch.pk)]["labor"]), Decimal("25.00"))
        # After the sale: everything (80 general + 40 linked after closing) goes to the available lot.
        self.assertEqual(Decimal(rows[str(other.pk)]["labor"]), Decimal("75.00") + 80 + 40)

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

    def test_cost_per_animal_uses_total_lot_size(self):
        # 10 animals entered, 4 died: the lot cost is still spread over the 10.
        lot = self.new_batch("L020", quantity=10)
        HistoricoEvento.objects.create(farm=self.farm, lote=lot, tipo_evento="Entrada de Lote", descricao="Entrada",
                                       data_evento=self.start, metadata={"quantidade": 10})
        self.transaction("Mão de Obra", 200, lot)
        lot.quantity = 6
        lot.save()
        row = self.report()[str(lot.pk)]
        self.assertEqual(row["total_quantity"], 10)
        self.assertEqual(Decimal(row["cost_per_animal"]), 20)

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

    def test_swine_labor_requires_production_animals_on_the_launch_date(self):
        from apps.livestock.services import close_batch_balance, transfer_batch_phase

        category = FinancialCategory.objects.create(
            organization=self.org, name="Mão de Obra - Suinocultura", category_type="expense",
        )
        url = "/api/v1/finance/transactions/"

        def post(day, label):
            return self.client.post(url, {
                "category": str(category.pk), "description": "Mão de obra", "amount": "100.00",
                "due_date": day.isoformat(), "payment_date": day.isoformat(), "status": "paid",
                "reference": f"LABOR-SWINE-{label}",
            }, format="json")

        self.new_batch("Matriz", phase="reproducao", category="Matriz", entry_date=self.start - timedelta(days=2))
        self.assertEqual(post(self.start - timedelta(days=1), "before").status_code, 400)
        transfer_batch_phase(self.batch, "crescimento", self.start + timedelta(days=2))
        close_batch_balance(self.batch, self.start + timedelta(days=4))
        recorded = post(self.start + timedelta(days=1), "historical")
        self.assertEqual(recorded.status_code, 201, recorded.data)
        rejected = post(self.start + timedelta(days=4), "closed")
        self.assertEqual(rejected.status_code, 400, rejected.data)
        self.assertIn("due_date", rejected.data["error"]["detail"])
        self.assertEqual(Transaction.objects.filter(reference__startswith="LABOR-SWINE-").count(), 1)

    def test_edit_and_cancel_swine_labor_preserve_history_and_update_lot_costs(self):
        from uuid import uuid4

        from apps.finance.models import PaymentEvent

        original = self.transaction("Mão de Obra - Suinocultura", 100, reference="LABOR-SWINE-CORRECT")
        url = f"/api/v1/finance/transactions/{original.pk}/swine-labor-edit/"
        payload = {
            "request_key": str(uuid4()), "date": self.start.isoformat(),
            "sector": "Engorda", "worker": "Equipe", "activity": "Limpeza",
            "type": "daily", "people": 2, "quantity": "1.00", "rate": "75.00", "observations": "",
        }
        invalid = self.client.post(url, payload | {"date": (self.start - timedelta(days=1)).isoformat()}, format="json")
        self.assertEqual(invalid.status_code, 400, invalid.data)
        original.refresh_from_db()
        self.assertEqual(original.status, "paid")
        updated = self.client.post(url, payload, format="json")
        self.assertEqual(updated.status_code, 200, updated.data)
        original.refresh_from_db()
        self.assertEqual(original.status, "cancelled")
        self.assertEqual(PaymentEvent.objects.filter(transaction=original, kind="reversal").count(), 1)
        self.assertEqual(self.client.post(url, payload, format="json").data["id"], updated.data["id"])
        self.assertEqual(Decimal(self.report()[str(self.batch.pk)]["labor"]), Decimal("150.00"))

        cancel = f"/api/v1/finance/transactions/{updated.data['id']}/swine-labor-cancel/"
        self.assertEqual(self.client.post(cancel, {}, format="json").status_code, 200)
        self.assertEqual(self.client.post(cancel, {}, format="json").status_code, 200)
        self.assertIsNone(self.report()[str(self.batch.pk)]["labor"])
        self.assertEqual(PaymentEvent.objects.filter(transaction_id=updated.data["id"], kind="reversal").count(), 1)
