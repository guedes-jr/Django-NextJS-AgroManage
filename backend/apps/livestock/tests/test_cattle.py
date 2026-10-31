from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.farms.models import Farm
from apps.livestock.models import (
    Animal,
    AnimalBatch,
    Birth,
    CattlePasture,
    Mating,
    Pregnancy,
    Species,
)
from apps.organizations.models import Organization
from apps.platform_admin.exports.capture import check_inventory


class CattleWorkspaceTests(APITestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Bovinos", slug="cattle-tests")
        other = Organization.objects.create(name="Outra", slug="cattle-other")
        self.user = get_user_model().objects.create_user(
            email="cattle@example.com",
            password="test",
            role="admin",
            organization=self.org,
        )
        self.farm = Farm.objects.create(name="Fazenda", organization=self.org)
        self.foreign = Farm.objects.create(name="Outra", organization=other)
        self.species, _ = Species.objects.get_or_create(
            code="bovinos", defaults={"name": "Bovinos"}
        )
        self.swine, _ = Species.objects.get_or_create(
            code="suinos", defaults={"name": "Suínos"}
        )
        self.cow = Animal.objects.create(
            farm=self.farm,
            species=self.species,
            identifier="V-001",
            category="Vaca",
            gender="F",
            reproductive_status="lactante",
            entry_date=date(2026, 1, 1),
        )
        self.client.force_authenticate(self.user)

    def post(self, name, data, pk=None):
        return self.client.post(
            reverse(name, args=[pk] if pk else None), data, format="json"
        )

    def test_export_inventory(self):
        check_inventory()

    def test_species_and_tenant_isolation(self):
        Animal.objects.create(
            farm=self.foreign, species=self.species, identifier="OUTRA"
        )
        pig = Animal.objects.create(
            farm=self.farm, species=self.swine, identifier="SUINO"
        )
        response = self.client.get(reverse("cattle-animal-list"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            [row["identifier"] for row in response.data["results"]], ["V-001"]
        )
        self.assertEqual(
            self.client.get(reverse("cattle-animal-detail", args=[pig.pk])).status_code,
            404,
        )
        self.assertEqual(
            self.client.get(reverse("cattle-animal-list"), {"gender": "M"}).data[
                "count"
            ],
            0,
        )

    def test_animal_creation_validates_tenant_duplicates_dates(self):
        payload = {
            "identifier": "B-001",
            "farm_id": str(self.farm.pk),
            "gender": "M",
            "category": "Bezerro",
            "entry_date": "2026-01-01",
        }
        response = self.post("cattle-animal-list", payload)
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(
            Animal.objects.get(pk=response.data["id"]).species, self.species
        )
        self.assertEqual(self.post("cattle-animal-list", payload).status_code, 400)
        self.assertEqual(
            self.post(
                "cattle-animal-list", dict(payload, farm_id=str(self.foreign.pk))
            ).status_code,
            400,
        )
        self.assertEqual(
            self.post(
                "cattle-animal-list",
                dict(payload, identifier="B-002", birth_date="2099-01-01"),
            ).status_code,
            400,
        )

    def test_overview_does_not_double_count_batch_animals(self):
        batch = AnimalBatch.objects.create(
            farm=self.farm,
            species=self.species,
            batch_code="L-1",
            quantity=10,
            category="Vaca",
            entry_date=date(2026, 1, 1),
        )
        self.cow.batch = batch
        self.cow.save(update_fields=["batch"])
        data = self.client.get(reverse("cattle-overview")).data
        self.assertEqual(data["total_head"], 10)
        self.assertEqual(data["identified_animals"], 1)

    def test_milk_volume_duplicates_and_species(self):
        payload = {
            "animal": str(self.cow.pk),
            "date": timezone.localdate().isoformat(),
            "session": "morning",
            "liters": "20",
            "discarded_liters": "2",
            "discard_reason": "Tratamento",
        }
        self.assertEqual(
            self.post(
                "cattle-milk-list", dict(payload, discarded_liters="21")
            ).status_code,
            400,
        )
        response = self.post("cattle-milk-list", payload)
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(self.post("cattle-milk-list", payload).status_code, 400)
        self.assertEqual(
            self.client.get(reverse("cattle-overview")).data["milk_usable_month"],
            Decimal(18),
        )
        self.cow.species = self.swine
        self.cow.save(update_fields=["species"])
        self.assertEqual(
            self.post("cattle-milk-list", dict(payload, session="evening")).status_code,
            400,
        )

    def test_operator_scope_and_read_only(self):
        self.user.role = "operator"
        self.user.save(update_fields=["role"])
        self.user.allowed_livestock.add(self.swine)
        self.assertEqual(self.client.get(reverse("cattle-overview")).status_code, 403)
        self.user.allowed_livestock.add(self.species)
        self.assertEqual(self.client.get(reverse("cattle-overview")).status_code, 200)
        self.assertEqual(self.client.get(reverse("cattle-milk-list")).status_code, 200)
        self.user.operator_read_only = True
        self.user.save(update_fields=["operator_read_only"])
        response = self.post(
            "cattle-animal-register-weight",
            {"weight_kg": "400", "weighing_date": timezone.localdate().isoformat()},
            self.cow.pk,
        )
        self.assertEqual(response.status_code, 403)

    def test_backdated_weight_does_not_override_current_weight(self):
        for day, weight in [("2026-03-01", "400"), ("2026-02-01", "350")]:
            response = self.post(
                "cattle-animal-register-weight",
                {"weight_kg": weight, "weighing_date": day},
                self.cow.pk,
            )
            self.assertEqual(response.status_code, 201, response.data)
        self.cow.refresh_from_db()
        self.assertEqual(self.cow.current_weight_kg, Decimal(400))
        self.assertEqual(
            self.post(
                "cattle-animal-register-weight",
                {"weight_kg": "-1", "weighing_date": "2026-04-01"},
                self.cow.pk,
            ).status_code,
            400,
        )

    def test_grazing_validates_farm_and_overlaps(self):
        pasture = CattlePasture.objects.create(farm=self.farm, name="P-1", area_ha=10)
        batch = AnimalBatch.objects.create(
            farm=self.farm,
            species=self.species,
            batch_code="L-1",
            quantity=10,
            entry_date=date(2026, 1, 1),
        )
        payload = {
            "pasture": str(pasture.pk),
            "batch": str(batch.pk),
            "entry_date": "2026-02-01",
        }
        response = self.post("cattle-grazing-list", payload)
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(self.post("cattle-grazing-list", payload).status_code, 400)
        self.assertEqual(
            self.post(
                "cattle-grazing-close", {"exit_date": "2026-01-01"}, response.data["id"]
            ).status_code,
            400,
        )
        self.assertEqual(
            self.post(
                "cattle-grazing-close", {"exit_date": "2026-03-01"}, response.data["id"]
            ).status_code,
            200,
        )
        pasture.farm = self.foreign
        pasture.save(update_fields=["farm"])
        self.assertEqual(
            self.post(
                "cattle-grazing-list", dict(payload, entry_date="2026-04-01")
            ).status_code,
            400,
        )

    def prepare_pregnancy(self):
        self.cow.reproductive_status = "gestante"
        self.cow.save(update_fields=["reproductive_status"])
        mating = Mating.objects.create(
            female=self.cow,
            mating_date=date(2026, 1, 1),
            expected_birth_date=date(2026, 10, 11),
            status="confirmed",
        )
        return Pregnancy.objects.create(
            female=self.cow,
            mating=mating,
            start_date=mating.mating_date,
            expected_birth_date=mating.expected_birth_date,
        )

    def test_birth_creates_calf_without_piglet_batch(self):
        pregnancy = self.prepare_pregnancy()
        payload = {
            "date": "2026-10-11",
            "outcome": "alive",
            "calf_identifier": "B-001",
            "calf_gender": "F",
            "weight_kg": "32",
        }
        response = self.post("cattle-animal-record-birth", payload, self.cow.pk)
        self.assertEqual(response.status_code, 201, response.data)
        calf = Animal.objects.get(identifier="B-001")
        self.assertEqual(calf.dam_ref, self.cow)
        self.assertEqual(calf.category, "Bezerro")
        self.assertFalse(AnimalBatch.objects.filter(category="Leitão").exists())
        pregnancy.refresh_from_db()
        self.assertEqual(pregnancy.status, "completed")
        self.assertEqual(
            self.post("cattle-animal-record-birth", payload, self.cow.pk).status_code,
            400,
        )

    def test_invalid_birth_rolls_back_pregnancy_and_animal(self):
        self.prepare_pregnancy()
        response = self.post(
            "cattle-animal-record-birth",
            {"date": "2026-10-11", "outcome": "alive", "calf_identifier": "V-001"},
            self.cow.pk,
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Birth.objects.exists())
        self.cow.refresh_from_db()
        self.assertEqual(self.cow.reproductive_status, "gestante")

    def test_feed_consumes_stock_and_rejects_other_species(self):
        from apps.inventory.models import ConsumoRacao, ItemEstoque, LoteEstoque, MovimentacaoEstoque

        Farm.objects.create(name="Outra propriedade da mesma organização", organization=self.org)
        item = ItemEstoque.objects.create(
            organization=self.org,
            nome="Ração bovina",
            categoria="racao",
            unidade_medida="kg",
            especie_animal="bovino",
        )
        lot = LoteEstoque.objects.create(
            item=item,
            numero_lote="RAC-1",
            quantidade_inicial=100,
            quantidade_atual=100,
            custo_unitario=2,
            data_entrada=date(2026, 1, 1),
        )
        payload = {
            "animais": [str(self.cow.pk)],
            "item_estoque": str(item.pk),
            "data_inicio": "2026-10-01",
            "data_fim": "2026-10-01",
            "quantidade": "20",
            "tipo_registro": "total_periodo",
        }
        response = self.post("cattle-feed-list", payload)
        self.assertEqual(response.status_code, 201, response.data)
        lot.refresh_from_db()
        self.assertEqual(lot.quantidade_atual, Decimal(80))
        self.assertEqual(ConsumoRacao.objects.get().farm, self.farm)
        self.assertEqual(MovimentacaoEstoque.objects.get(tipo="consumo").farm, self.farm)
        self.assertEqual(ConsumoRacao.objects.get().custo_total, Decimal(40))
        self.assertEqual(
            self.post("cattle-feed-list", dict(payload, quantidade="100")).status_code,
            400,
        )
        self.assertEqual(ConsumoRacao.objects.count(), 1)
        self.cow.species = self.swine
        self.cow.save(update_fields=["species"])
        self.assertEqual(self.post("cattle-feed-list", payload).status_code, 400)

    def test_coverage_diagnosis_and_prediction(self):
        self.cow.reproductive_status = "vazia"
        self.cow.save(update_fields=["reproductive_status"])
        response = self.post(
            "cattle-animal-register-mating",
            {
                "mating_date": "2026-01-01",
                "mating_type": "iatf",
                "sire_info": "Touro 01",
            },
            self.cow.pk,
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["expected_birth_date"], "2026-10-11")
        response = self.post(
            "cattle-animal-diagnose-pregnancy",
            {"diagnosis_date": "2026-02-01", "result": "positive"},
            self.cow.pk,
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(Mating.objects.get().status, "confirmed")
        self.assertEqual(Pregnancy.objects.count(), 1)

    def test_batch_phase_and_sale_register_cattle_revenue(self):
        from apps.finance.models import Transaction

        response = self.post(
            "cattle-batch-list",
            {
                "farm_id": str(self.farm.pk),
                "batch_code": "RECRIA-1",
                "category": "Garrote",
                "phase": "crescimento",
                "quantity": 10,
                "entry_date": "2026-01-01",
                "origin": "purchased",
                "avg_weight_kg": "200",
            },
        )
        self.assertEqual(response.status_code, 201, response.data)
        pk = response.data["id"]
        response = self.post(
            "cattle-batch-change-phase", {"phase": "engorda", "date": "2026-05-01"}, pk
        )
        self.assertEqual(response.status_code, 200, response.data)
        response = self.post(
            "cattle-batch-register-sale",
            {
                "mode": "partial",
                "quantity": 2,
                "weight_kg": "800",
                "price_per_kg": "10",
                "date": "2026-10-01",
                "buyer": "Comprador",
            },
            pk,
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Transaction.objects.get().species, self.species)
        self.assertEqual(Transaction.objects.get().amount, Decimal(8000))
        self.assertEqual(AnimalBatch.objects.get(pk=pk).quantity, 8)
        self.assertEqual(len(self.client.get(reverse("cattle-batch-sales")).data), 1)

    def test_operator_can_register_milk(self):
        self.user.role = "operator"
        self.user.save(update_fields=["role"])
        self.user.allowed_livestock.add(self.species)
        response = self.post(
            "cattle-milk-list",
            {
                "animal": str(self.cow.pk),
                "date": "2026-10-01",
                "session": "morning",
                "liters": "20",
            },
        )
        self.assertEqual(response.status_code, 201, response.data)

    def test_weaning_changes_category_and_mortality_closes_animal(self):
        self.cow.category = "Bezerro"
        self.cow.save(update_fields=["category"])
        response = self.post(
            "cattle-animal-record-event",
            {"kind": "weaning", "date": "2026-10-01"},
            self.cow.pk,
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.cow.refresh_from_db()
        self.assertEqual(self.cow.category, "Novilha")
        response = self.post(
            "cattle-animal-record-event",
            {"kind": "death", "date": "2026-10-02"},
            self.cow.pk,
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.cow.refresh_from_db()
        self.assertEqual(self.cow.status, "dead")

    def test_complete_sale_closes_open_pasture_occupancy(self):
        from apps.livestock.models import CattleGrazing

        pasture = CattlePasture.objects.create(farm=self.farm, name="Pasto", area_ha=5)
        batch = AnimalBatch.objects.create(
            farm=self.farm,
            species=self.species,
            batch_code="VENDA-1",
            quantity=2,
            entry_date=date(2026, 1, 1),
            phase="engorda",
        )
        grazing = CattleGrazing.objects.create(
            pasture=pasture, batch=batch, entry_date=date(2026, 5, 1)
        )
        response = self.post(
            "cattle-batch-register-sale",
            {
                "mode": "whole",
                "weight_kg": "800",
                "price_per_kg": "10",
                "date": "2026-10-01",
                "buyer": "Comprador",
            },
            batch.pk,
        )
        self.assertEqual(response.status_code, 201, response.data)
        grazing.refresh_from_db()
        self.assertEqual(grazing.exit_date, date(2026, 10, 1))

    def test_milk_cannot_reference_a_foreign_tenant(self):
        foreign = Animal.objects.create(
            farm=self.foreign,
            species=self.species,
            identifier="EXT-1",
            category="Vaca",
            gender="F",
        )
        response = self.post(
            "cattle-milk-list",
            {
                "animal": str(foreign.pk),
                "date": "2026-10-01",
                "session": "morning",
                "liters": "20",
            },
        )
        self.assertEqual(response.status_code, 400)

    def management(self, kind="weighing", **changes):
        payload = {
            "farm": str(self.farm.pk),
            "date": "2026-03-01",
            "kind": kind,
            "description": "Lida de teste",
            "entries": [
                {
                    "animal": str(self.cow.pk),
                    "weight_kg": "400" if kind == "weighing" else None,
                }
            ],
        }
        payload.update(changes)
        return self.post("cattle-management-list", payload)

    def test_management_confirmation_is_idempotent_and_immutable(self):
        from apps.livestock.models import WeightRecord

        response = self.management()
        self.assertEqual(response.status_code, 201, response.data)
        pk = response.data["id"]
        self.assertFalse(WeightRecord.objects.exists())
        for _ in range(2):
            response = self.post("cattle-management-confirm", {}, pk)
            self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(WeightRecord.objects.count(), 1)
        self.cow.refresh_from_db()
        self.assertEqual(self.cow.current_weight_kg, Decimal(400))
        response = self.client.patch(
            reverse("cattle-management-detail", args=[pk]),
            {"description": "Alterado"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            self.client.delete(
                reverse("cattle-management-detail", args=[pk])
            ).status_code,
            405,
        )
        self.assertEqual(
            self.post("cattle-management-cancel", {"reason": "Erro"}, pk).status_code,
            400,
        )

    def test_management_revalidates_participants_and_rolls_back(self):
        from apps.livestock.models import WeightRecord

        second = Animal.objects.create(
            farm=self.farm,
            species=self.species,
            identifier="V-002",
            entry_date=date(2026, 1, 1),
        )
        response = self.management(
            entries=[
                {"animal": str(animal.pk), "weight_kg": "410"}
                for animal in [self.cow, second]
            ]
        )
        self.assertEqual(response.status_code, 201, response.data)
        second.status = "sold"
        second.save(update_fields=["status"])
        response = self.post("cattle-management-confirm", {}, response.data["id"])
        self.assertEqual(response.status_code, 400)
        self.assertFalse(WeightRecord.objects.exists())
        self.cow.refresh_from_db()
        self.assertIsNone(self.cow.current_weight_kg)

    def test_management_backdated_weight_preserves_latest(self):
        self.post(
            "cattle-animal-register-weight",
            {"weight_kg": "480", "weighing_date": "2026-04-01"},
            self.cow.pk,
        )
        response = self.management()
        response = self.post("cattle-management-confirm", {}, response.data["id"])
        self.assertEqual(response.status_code, 200, response.data)
        self.cow.refresh_from_db()
        self.assertEqual(self.cow.current_weight_kg, Decimal(480))

    def test_management_rejects_foreign_species_farms_and_duplicates(self):
        foreign = Animal.objects.create(
            farm=self.foreign, species=self.species, identifier="EXT"
        )
        pig = Animal.objects.create(
            farm=self.farm, species=self.swine, identifier="PIG"
        )
        other_farm = Farm.objects.create(organization=self.org, name="Segunda")
        other = Animal.objects.create(
            farm=other_farm, species=self.species, identifier="OTHER"
        )
        for animal in [foreign, pig, other]:
            response = self.management(
                entries=[{"animal": str(animal.pk), "weight_kg": "300"}]
            )
            self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(self.management(farm=str(self.foreign.pk)).status_code, 400)
        self.assertEqual(
            self.management(
                entries=[{"animal": str(self.cow.pk), "weight_kg": "400"}] * 2
            ).status_code,
            400,
        )
        self.assertEqual(self.management(entries=[]).status_code, 400)

    def test_management_cancellation_and_permissions(self):
        response = self.management()
        pk = response.data["id"]
        self.assertEqual(self.post("cattle-management-cancel", {}, pk).status_code, 400)
        response = self.post(
            "cattle-management-cancel", {"reason": "Conferência incorreta"}, pk
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["cancellation_reason"], "Conferência incorreta")
        self.assertEqual(
            self.post("cattle-management-confirm", {}, pk).status_code, 400
        )
        self.user.role = "operator"
        self.user.save(update_fields=["role"])
        self.user.allowed_livestock.add(self.species)
        self.assertEqual(self.management().status_code, 403)
        self.assertEqual(
            self.client.get(reverse("cattle-management-list")).status_code, 403
        )

    def test_sanitary_withdrawal_blocks_milk_inclusive_and_filters(self):
        from apps.livestock.models import HealthRecord

        response = self.management(
            "sanitary",
            milk_withdrawal_until="2026-03-05",
            meat_withdrawal_until="2099-01-01",
            cost_per_animal="12.50",
            next_procedure_date="2026-04-01",
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertFalse(HealthRecord.objects.exists())
        response = self.post("cattle-management-confirm", {}, response.data["id"])
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(HealthRecord.objects.get().cost, Decimal("12.50"))
        payload = {
            "animal": str(self.cow.pk),
            "date": "2026-03-05",
            "session": "morning",
            "liters": "20",
            "discarded_liters": "0",
        }
        self.assertEqual(self.post("cattle-milk-list", payload).status_code, 400)
        response = self.post(
            "cattle-milk-list",
            dict(payload, discarded_liters="20", discard_reason="Carência"),
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(
            self.post("cattle-milk-list", dict(payload, date="2026-03-06")).status_code,
            201,
        )
        self.assertEqual(
            self.client.get(reverse("cattle-animal-list"), {"withdrawal": "meat"}).data[
                "count"
            ],
            1,
        )
        self.assertEqual(
            self.client.get(reverse("cattle-animal-list"), {"withdrawal": "milk"}).data[
                "count"
            ],
            0,
        )
        self.assertEqual(
            self.client.get(reverse("cattle-overview")).data["agenda"][0]["date"],
            "2026-04-01",
        )

    def test_sanitary_cannot_silently_restrict_previously_usable_milk(self):
        self.post(
            "cattle-milk-list",
            {
                "animal": str(self.cow.pk),
                "date": "2026-03-02",
                "session": "morning",
                "liters": "20",
            },
        )
        response = self.management("sanitary", milk_withdrawal_until="2026-03-05")
        pk = response.data["id"]
        self.assertEqual(
            self.post("cattle-management-confirm", {}, pk).status_code, 400
        )
        self.assertEqual(
            self.client.get(reverse("cattle-management-detail", args=[pk])).data[
                "status"
            ],
            "draft",
        )

    def test_milk_requires_discard_reason_and_preserves_restriction_on_patch(self):
        payload = {
            "animal": str(self.cow.pk),
            "date": "2026-03-02",
            "session": "morning",
            "liters": "20",
            "discarded_liters": "20",
        }
        self.assertEqual(self.post("cattle-milk-list", payload).status_code, 400)
        response = self.post(
            "cattle-milk-list", dict(payload, discard_reason="Carência")
        )
        self.assertEqual(response.status_code, 201, response.data)
        milk_pk = response.data["id"]
        response = self.management("sanitary", milk_withdrawal_until="2026-03-05")
        self.assertEqual(
            self.post("cattle-management-confirm", {}, response.data["id"]).status_code,
            200,
        )
        response = self.client.patch(
            reverse("cattle-milk-detail", args=[milk_pk]),
            {"discarded_liters": "0"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_castration_persists_state_and_rejects_repeat(self):
        self.cow.gender = "M"
        self.cow.category = "Garrote"
        self.cow.save(update_fields=["gender", "category"])
        response = self.management("castration")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(
            self.post("cattle-management-confirm", {}, response.data["id"]).status_code,
            200,
        )
        self.assertTrue(
            self.client.get(reverse("cattle-animal-detail", args=[self.cow.pk])).data[
                "is_castrated"
            ]
        )
        self.assertEqual(
            self.post(
                "cattle-animal-record-event",
                {"kind": "castration", "date": "2026-04-01"},
                self.cow.pk,
            ).status_code,
            400,
        )

    def test_lactation_survives_coverage_and_dry_off_preserves_pregnancy(self):
        response = self.post(
            "cattle-animal-register-mating",
            {"mating_date": "2026-03-01", "mating_type": "ai", "sire_info": "Touro"},
            self.cow.pk,
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.post(
            "cattle-animal-diagnose-pregnancy",
            {"diagnosis_date": "2026-04-01", "result": "positive"},
            self.cow.pk,
        )
        detail = self.client.get(reverse("cattle-animal-detail", args=[self.cow.pk]))
        self.assertTrue(detail.data["is_lactating"])
        self.assertEqual(detail.data["reproductive_status"], "gestante")
        self.assertEqual(
            self.client.get(reverse("cattle-overview")).data["lactating_females"], 1
        )
        response = self.post(
            "cattle-animal-record-event",
            {"kind": "dry_off", "date": "2026-10-01"},
            self.cow.pk,
        )
        self.assertEqual(response.status_code, 200, response.data)
        detail = self.client.get(reverse("cattle-animal-detail", args=[self.cow.pk]))
        self.assertFalse(detail.data["is_lactating"])
        self.assertEqual(detail.data["reproductive_status"], "gestante")
        self.assertEqual(Pregnancy.objects.get().status, "ongoing")

    def test_weaning_records_weight_group_and_preserves_dam_lactation(self):
        calf = Animal.objects.create(
            farm=self.farm,
            species=self.species,
            identifier="CALF",
            category="Bezerro",
            gender="M",
            entry_date=date(2026, 1, 1),
            dam_ref=self.cow,
        )
        response = self.post(
            "cattle-animal-record-event",
            {
                "kind": "weaning",
                "date": "2026-05-01",
                "weight_kg": "190",
                "destination_group": "Recria 2026",
            },
            calf.pk,
        )
        self.assertEqual(response.status_code, 200, response.data)
        detail = self.client.get(reverse("cattle-animal-detail", args=[calf.pk]))
        self.assertEqual(detail.data["weaning_date"], "2026-05-01")
        self.assertEqual(detail.data["management_group"], "Recria 2026")
        self.assertEqual(Decimal(detail.data["current_weight_kg"]), Decimal(190))
        self.assertTrue(
            self.client.get(reverse("cattle-animal-detail", args=[self.cow.pk])).data[
                "is_lactating"
            ]
        )
        self.assertEqual(
            self.post(
                "cattle-animal-record-event",
                {"kind": "weaning", "date": "2026-05-02"},
                calf.pk,
            ).status_code,
            400,
        )

    def test_pasture_capacity_and_missing_weights(self):
        from apps.livestock.models import CattleGrazing

        response = self.post(
            "cattle-pasture-list",
            {
                "farm": str(self.farm.pk),
                "name": "Capacidade",
                "area_ha": "10",
                "max_stocking_ua_ha": "1",
            },
        )
        self.assertEqual(response.status_code, 201, response.data)
        pk = response.data["id"]
        batch = AnimalBatch.objects.create(
            farm=self.farm,
            species=self.species,
            batch_code="OCC",
            quantity=20,
            avg_weight_kg=450,
            entry_date=date(2026, 1, 1),
        )
        CattleGrazing.objects.create(
            pasture_id=pk, batch=batch, entry_date=date(2026, 1, 1)
        )
        detail = self.client.get(reverse("cattle-pasture-detail", args=[pk]))
        self.assertEqual(detail.data["occupancy"]["heads"], 20)
        self.assertEqual(detail.data["occupancy"]["stocking_ua_ha"], Decimal(2))
        self.assertEqual(detail.data["occupancy"]["capacity_percent"], Decimal(200))
        batch.avg_weight_kg = None
        batch.save(update_fields=["avg_weight_kg"])
        detail = self.client.get(reverse("cattle-pasture-detail", args=[pk]))
        self.assertIsNone(detail.data["occupancy"]["capacity_percent"])
        self.assertEqual(detail.data["occupancy"]["missing_weight_heads"], 20)

    def test_overview_filters_remain_tenant_scoped(self):
        self.assertEqual(
            self.client.get(
                reverse("cattle-overview"), {"farm": str(self.foreign.pk)}
            ).data["total_head"],
            0,
        )
        self.assertEqual(
            self.client.get(
                reverse("cattle-animal-list"), {"farm": str(self.foreign.pk)}
            ).data["count"],
            0,
        )
        self.assertEqual(
            self.client.get(
                reverse("cattle-overview"), {"farm": "invalid"}
            ).status_code,
            400,
        )
