from datetime import date
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
    Birth,
    HealthRecord,
    HistoricoEvento,
    Mating,
    Pregnancy,
    Species,
    VaccinationRecord,
)
from apps.livestock.services import (
    batch_financial_details,
    ensure_birth_batch,
    wean_birth,
)
from apps.organizations.models import Organization
from apps.reports.sire_costs import allocate_sire_costs, split_money


class SireCostsTests(APITestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Rateio", slug="sire-costs")
        self.farm = Farm.objects.create(organization=self.org, name="Granja")
        self.species = Species.objects.create(name="Suínos", code="suinos")
        self.user = get_user_model().objects.create_user(
            email="sire-costs@example.com",
            password="test",
            organization=self.org,
            role="owner",
        )
        self.client.force_authenticate(self.user)
        self.sire_batch = AnimalBatch.objects.create(
            farm=self.farm,
            species=self.species,
            batch_code="R001",
            category="Reprodutor",
            quantity=1,
            gender="M",
            entry_date=date(2026, 1, 1),
            origin="purchased",
            purchase_value=2000,
        )
        self.sire = Animal.objects.create(
            farm=self.farm,
            species=self.species,
            batch=self.sire_batch,
            identifier="R001",
            category="Reprodutor",
            gender="M",
        )
        self.feed_item = ItemEstoque.objects.create(
            organization=self.org, nome="Ração", categoria="racao", unidade_medida="kg"
        )
        self.start = date(2026, 1, 10)

    def cover(
        self, identifier, sire=None, mating_date=None, status="confirmed", born=True
    ):
        female = Animal.objects.create(
            farm=self.farm,
            species=self.species,
            identifier=identifier,
            category="Matriz",
            gender="F",
        )
        mating = Mating.objects.create(
            female=female,
            sire=sire or self.sire,
            mating_date=mating_date or self.start,
            mating_type="natural",
            status=status,
        )
        if not born:
            return mating, None
        pregnancy = Pregnancy.objects.create(
            mating=mating,
            female=female,
            start_date=mating.mating_date,
            expected_birth_date=date(2026, 5, 5),
            status="completed",
        )
        birth = Birth.objects.create(
            pregnancy=pregnancy,
            female=female,
            birth_date=date(2026, 5, 5),
            live_born=10,
        )
        ensure_birth_batch(birth)
        return mating, birth

    def feed(self, amount, day=None, animals=None):
        feed = ConsumoRacao.objects.create(
            organization=self.org,
            farm=self.farm,
            lote_animal=None if animals else self.sire_batch,
            item_estoque=self.feed_item,
            data_inicio=day or self.start,
            data_fim=day or self.start,
            quantidade=10,
            custo_total=amount,
        )
        if animals:
            feed.animais.set(animals)
        return feed

    def amount(self, result, batch):
        return sum(
            (Decimal(e["amount"]) for e in result["entries"].get(str(batch.pk), [])),
            Decimal(0),
        )

    def test_300_upkeep_three_matings_partial_transfer_60_40(self):
        births = [self.cover(f"M{index}")[1] for index in range(3)]
        self.feed(180)
        VaccinationRecord.objects.create(
            farm=self.farm,
            species=self.species,
            animal=self.sire,
            vaccine_name="Vacina",
            application_date=self.start,
            inventory_cost_snapshot=60,
        )
        HealthRecord.objects.create(
            farm=self.farm,
            animal=self.sire,
            application_date=self.start,
            cost=60,
            description="Cuidado",
        )
        _, nursery = wean_birth(
            births[0],
            weaning_date=date(2026, 5, 26),
            weaned_quantity=6,
            weaning_type="parcial",
            batch_code="L001",
        )
        result = allocate_sire_costs(self.org)
        self.assertEqual(self.amount(result, nursery), 60)
        self.assertEqual(self.amount(result, births[0].batch), 40)
        self.assertEqual(self.amount(result, births[1].batch), 100)
        self.assertEqual(self.amount(result, births[2].batch), 100)
        self.assertEqual(
            sum(
                Decimal(e["amount"])
                for entries in result["entries"].values()
                for e in entries
            ),
            300,
        )
        event = HistoricoEvento.objects.get(
            lote=nursery, tipo_evento="Transferência de Leitões"
        )
        self.assertEqual(
            event.metadata["source_available_quantities"][str(births[0].batch_id)], 10
        )
        response = self.client.get(
            reverse("livestock-inventory-report"),
            {"species": "suinos", "include_costs": "true"},
        )
        row = next(
            row for row in response.data["items"] if row["id"] == str(nursery.pk)
        )
        self.assertEqual(Decimal(row["reproduction"]), 60)
        self.assertEqual(Decimal(row["total_cost"]), 60)
        self.assertEqual(Decimal(row["cost_per_animal"]), 10)
        detail = batch_financial_details(nursery)
        self.assertEqual(Decimal(detail["totals"]["Reprodutor — rateio mensal"]), 60)

    def test_remaining_transfer_and_merge_keep_total_once(self):
        _, birth = self.cover("M001")
        self.feed(100)
        _, first = wean_birth(
            birth,
            weaning_date=date(2026, 5, 26),
            weaned_quantity=6,
            weaning_type="parcial",
            batch_code="P1",
        )
        _, remainder = wean_birth(
            birth, weaning_date=date(2026, 5, 27), weaned_quantity=4
        )
        response = self.client.post(
            reverse("animalbatch-merge-batches"),
            {
                "batch_ids": [str(first.pk), str(remainder.pk)],
                "new_batch_code": "MERGED",
                "entry_date": "2026-06-01",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        merged = AnimalBatch.objects.get(batch_code="MERGED")
        result = allocate_sire_costs(self.org)
        self.assertEqual(self.amount(result, merged), 100)
        self.assertEqual(self.amount(result, first), 0)
        self.assertEqual(self.amount(result, remainder), 0)
        self.assertEqual(
            sum(
                Decimal(e["amount"])
                for entries in result["entries"].values()
                for e in entries
            ),
            100,
        )
        event = HistoricoEvento.objects.get(lote=merged, tipo_evento="Junção de Lotes")
        self.assertEqual(
            event.metadata["source_quantities"],
            {str(first.pk): 6, str(remainder.pk): 4},
        )

    def test_months_sires_and_failed_or_pending_matings_have_separate_shares(self):
        _, january = self.cover("M1")
        self.cover("Mfailed", status="failed", born=False)
        self.cover("Mpending", status="pending_dg", born=False)
        _, february = self.cover("M2", mating_date=date(2026, 2, 10))
        other_sire = Animal.objects.create(
            farm=self.farm,
            species=self.species,
            identifier="R2",
            category="Reprodutor",
            gender="M",
        )
        _, other_birth = self.cover("M3", sire=other_sire)
        self.feed(300)
        self.feed(50, day=date(2026, 2, 10))
        result = allocate_sire_costs(self.org)
        self.assertEqual(self.amount(result, january.batch), 100)
        self.assertEqual(self.amount(result, february.batch), 50)
        self.assertEqual(self.amount(result, other_birth.batch), 0)

    def test_shared_individual_feed_is_split_once_and_purchase_is_excluded(self):
        _, birth = self.cover("M1")
        female = Animal.objects.create(
            farm=self.farm, species=self.species, identifier="F2", gender="F"
        )
        self.feed(200, animals=[self.sire, female])
        category = FinancialCategory.objects.create(
            organization=self.org, name="Manutenção", category_type="expense"
        )
        Transaction.objects.create(
            organization=self.org,
            animal_batch=self.sire_batch,
            category=category,
            amount=50,
            due_date=self.start,
            status="paid",
        )
        Transaction.objects.create(
            organization=self.org,
            animal_batch=self.sire_batch,
            category=category,
            amount=999,
            due_date=self.start,
            status="cancelled",
        )
        self.assertEqual(self.amount(allocate_sire_costs(self.org), birth.batch), 150)

    def test_unrecorded_transfer_does_not_guess_and_unknown_prices_are_flagged(self):
        _, birth = self.cover("M1")
        self.feed(100)
        VaccinationRecord.objects.create(
            farm=self.farm,
            species=self.species,
            animal=self.sire,
            vaccine_name="Sem preço",
            application_date=self.start,
        )
        target = AnimalBatch.objects.create(
            farm=self.farm,
            species=self.species,
            batch_code="LEGACY",
            category="Leitão",
            quantity=6,
            entry_date=date(2026, 5, 26),
            phase="creche",
            origin="born",
        )
        target.source_batches.add(birth.batch)
        result = allocate_sire_costs(self.org)
        self.assertEqual(self.amount(result, target), 0)
        self.assertEqual(self.amount(result, birth.batch), 0)
        self.assertIn(str(target.pk), result["pending_batches"])
        self.assertIn(str(birth.batch_id), result["pending_batches"])

    def test_cent_rounding_conserves_cost_and_query_count_is_constant(self):
        self.cover("M1")
        self.feed(100)
        with CaptureQueriesContext(connection) as queries:
            allocate_sire_costs(self.org)
        initial = len(queries)
        self.cover("M2")
        self.cover("M3")
        with CaptureQueriesContext(connection) as queries:
            result = allocate_sire_costs(self.org)
        self.assertEqual(len(queries), initial)
        values = [
            Decimal(e["amount"])
            for entries in result["entries"].values()
            for e in entries
        ]
        self.assertEqual(sum(values), 100)
        self.assertEqual(
            sorted(values), [Decimal("33.33"), Decimal("33.33"), Decimal("33.34")]
        )
        self.assertEqual(
            sum(split_money(Decimal("0.01"), {"a": 1, "b": 1}).values()),
            Decimal("0.01"),
        )

    def test_batch_upkeep_is_shared_between_sires_without_multiplying_the_pool(self):
        _, first_birth = self.cover("M1")
        second_sire = Animal.objects.create(
            farm=self.farm,
            species=self.species,
            batch=self.sire_batch,
            identifier="R002",
            category="Reprodutor",
            gender="M",
        )
        _, second_birth = self.cover("M2", sire=second_sire)
        self.feed(200)
        result = allocate_sire_costs(self.org)
        self.assertEqual(self.amount(result, first_birth.batch), 100)
        self.assertEqual(self.amount(result, second_birth.batch), 100)

    def test_unknown_earlier_split_blocks_later_remaining_balance_allocation(self):
        _, birth = self.cover("M1")
        self.feed(100)
        unknown = AnimalBatch.objects.create(
            farm=self.farm,
            species=self.species,
            batch_code="UNKNOWN",
            category="Leitão",
            quantity=6,
            entry_date=date(2026, 5, 26),
            phase="creche",
            origin="born",
        )
        unknown.source_batches.add(birth.batch)
        known = AnimalBatch.objects.create(
            farm=self.farm,
            species=self.species,
            batch_code="KNOWN",
            category="Leitão",
            quantity=4,
            entry_date=date(2026, 5, 27),
            phase="creche",
            origin="born",
        )
        known.source_batches.add(birth.batch)
        HistoricoEvento.objects.create(
            farm=self.farm,
            lote=known,
            tipo_evento="Junção de Lotes",
            descricao="Junção posterior",
            data_evento=date(2026, 5, 27),
            metadata={"source_batch_ids": [str(birth.batch_id)]},
        )
        result = allocate_sire_costs(self.org)
        self.assertEqual(self.amount(result, known), 0)
        self.assertIn(str(known.pk), result["pending_batches"])

    def test_other_tenant_records_never_enter_the_sire_pool(self):
        _, birth = self.cover("M1")
        self.feed(100)
        other = Organization.objects.create(name="Outra", slug="sire-costs-other")
        other_farm = Farm.objects.create(organization=other, name="Outra")
        VaccinationRecord.objects.create(
            farm=other_farm,
            species=self.species,
            animal=self.sire,
            vaccine_name="Outra",
            application_date=self.start,
            inventory_cost_snapshot=900,
        )
        category = FinancialCategory.objects.create(
            organization=other, name="Manutenção", category_type="expense"
        )
        Transaction.objects.create(
            organization=other,
            category=category,
            animal_batch=self.sire_batch,
            amount=900,
            due_date=self.start,
            status="paid",
        )
        self.assertEqual(self.amount(allocate_sire_costs(self.org), birth.batch), 100)
        self.assertEqual(allocate_sire_costs(other)["entries"], {})
