from datetime import date

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.farms.models import Farm
from apps.inventory.models import ConsumoRacao, ItemEstoque, LoteEstoque
from apps.livestock.models import (
    Animal, AnimalBatch, ClinicalRecord, HistoricoEvento, Mating, Pregnancy, Species,
)
from apps.organizations.models import Organization

User = get_user_model()


class LivestockTenantIsolationTestCase(APITestCase):
    def setUp(self):
        self.org_a = Organization.objects.create(name="Rebanho A", slug="livestock-a-isolation")
        self.org_b = Organization.objects.create(name="Rebanho B", slug="livestock-b-isolation")
        self.user_a = User.objects.create_user(
            email="livestock-a@example.com", password="Password-8472", full_name="Rebanho A", organization=self.org_a
        )
        self.farm_a = Farm.objects.create(organization=self.org_a, name="Fazenda A")
        self.farm_b = Farm.objects.create(organization=self.org_b, name="Fazenda B")
        self.species = Species.objects.create(code="bovinos-isolation", name="Bovinos Isolamento")
        self.animal_a = Animal.objects.create(
            farm=self.farm_a, species=self.species, identifier="A-001", gender=Animal.Gender.FEMALE
        )
        self.animal_b = Animal.objects.create(
            farm=self.farm_b, species=self.species, identifier="B-001", gender=Animal.Gender.FEMALE
        )
        self.vaccine_b = ItemEstoque.objects.create(
            organization=self.org_b, nome="Vacina B", categoria="vacina", unidade_medida="dose"
        )
        self.clinical_b = ClinicalRecord.objects.create(
            farm=self.farm_b,
            animal=self.animal_b,
            record_type="consultation",
            record_date=date.today(),
            clinical_notes="Registro externo",
        )
        self.client.force_authenticate(self.user_a)

    def test_clinical_list_and_detail_hide_foreign_tenant(self):
        response = self.client.get(reverse("clinicalrecord-list"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn(str(self.clinical_b.id), {str(item["id"]) for item in response.data["results"]})
        detail = self.client.get(reverse("clinicalrecord-detail", args=[self.clinical_b.id]))
        self.assertEqual(detail.status_code, status.HTTP_404_NOT_FOUND)

    def test_rejects_clinical_record_with_foreign_farm_and_animal(self):
        response = self.client.post(
            reverse("clinicalrecord-list"),
            {
                "farm": self.farm_b.id,
                "animal": self.animal_b.id,
                "record_type": "consultation",
                "record_date": date.today().isoformat(),
                "clinical_notes": "Tentativa externa",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_rejects_foreign_vaccine_item(self):
        response = self.client.post(
            reverse("vaccination-list"),
            {
                "farm": self.farm_a.id,
                "species": self.species.id,
                "animal": self.animal_a.id,
                "vaccine_name": "Vacina externa",
                "vaccine_item_id": self.vaccine_b.id,
                "application_date": date.today().isoformat(),
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_accepts_combined_medicine_vaccine_item_with_uuid(self):
        vaccine = ItemEstoque.objects.create(
            organization=self.org_a,
            nome="Vacina reprodutiva",
            categoria="medicamento_vacina",
            categorias=["medicamento_vacina"],
            unidade_medida="dose",
        )
        LoteEstoque.objects.create(
            item=vaccine,
            numero_lote="VAC-001",
            quantidade_inicial="10.00",
            quantidade_atual="10.00",
            data_entrada=date.today(),
        )

        response = self.client.post(
            reverse("vaccination-list"),
            {
                "farm": self.farm_a.id,
                "species": self.species.id,
                "animal": self.animal_a.id,
                "vaccine_item_id": vaccine.id,
                "vaccine_name": vaccine.nome,
                "application_date": date.today().isoformat(),
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(str(response.data["vaccine_item"]), str(vaccine.id))
        vaccine.lotes.get().refresh_from_db()
        self.assertEqual(vaccine.estoque_atual, 9)
        self.assertTrue(
            HistoricoEvento.objects.filter(
                matriz=self.animal_a,
                tipo_evento="Vacinação",
                metadata__vacina=vaccine.nome,
            ).exists()
        )
        from apps.livestock.views import build_animal_history
        self.assertTrue(
            any(event["type"] == "vaccination" for event in build_animal_history(self.animal_a))
        )

    def test_species_summary_aggregates_only_authenticated_organization(self):
        AnimalBatch.objects.create(
            farm=self.farm_a,
            species=self.species,
            batch_code="A-LOTE",
            quantity=10,
            entry_date=date.today(),
            status=AnimalBatch.Status.ACTIVE,
            category=AnimalBatch.Category.MATRIZ,
        )
        AnimalBatch.objects.create(
            farm=self.farm_b,
            species=self.species,
            batch_code="B-LOTE",
            quantity=99,
            entry_date=date.today(),
            status=AnimalBatch.Status.ACTIVE,
            category=AnimalBatch.Category.MATRIZ,
        )
        self.animal_a.category = AnimalBatch.Category.MATRIZ
        self.animal_a.save(update_fields=["category"])

        response = self.client.get(reverse("species_summary"), {"species": self.species.code})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["total_animals"], 11)
        self.assertEqual(response.data["active_females"], 11)

    def test_birth_accepts_scheduled_combined_category_vaccine_uuid(self):
        vaccine = ItemEstoque.objects.create(
            organization=self.org_a,
            nome="Vacina reprodutiva combinada",
            categoria="medicamento_vacina",
            categorias=["medicamento_vacina"],
            unidade_medida="dose",
        )
        mating = Mating.objects.create(
            female=self.animal_a,
            mating_date=date(2026, 1, 1),
        )
        pregnancy = Pregnancy.objects.create(
            mating=mating,
            female=self.animal_a,
            start_date=date(2026, 1, 1),
            expected_birth_date=date(2026, 4, 25),
        )

        response = self.client.post(
            reverse("birth-list"),
            {
                "pregnancy": pregnancy.id,
                "female": self.animal_a.id,
                "birth_date": "2026-04-25",
                "live_born": 10,
                "stillborn": 1,
                "mummified": 0,
                "expected_weaning_days": 21,
                "reproductive_vaccine_item": vaccine.id,
                "reproductive_vaccine_days": 70,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(str(response.data["reproductive_vaccine_item"]), str(vaccine.id))
        self.assertEqual(response.data["reproductive_vaccine_due_date"], "2026-07-04")

    def test_batch_history_includes_current_feed_consumption(self):
        batch = AnimalBatch.objects.create(
            farm=self.farm_a,
            species=self.species,
            batch_code="MAT-01-2",
            quantity=10,
            entry_date=date.today(),
            category=AnimalBatch.Category.LEITAO,
            phase=AnimalBatch.Phase.CRECHE,
        )
        feed = ItemEstoque.objects.create(
            organization=self.org_a,
            nome="Pré-máster",
            categoria="racao",
            unidade_medida="kg",
        )
        ConsumoRacao.objects.create(
            organization=self.org_a,
            farm=self.farm_a,
            lote_animal=batch,
            categoria_destino="lotes",
            fase_destino="maternidade",
            item_estoque=feed,
            data_inicio=date.today(),
            data_fim=date.today(),
            quantidade="1.00",
            custo_unitario="10.00",
            custo_total="10.00",
        )

        response = self.client.get(reverse("animalbatch-history", args=[batch.id]))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        feed_event = next(event for event in response.data if event["type"] == "feed")
        self.assertEqual(feed_event["title"], "Pré-máster")
        self.assertEqual(feed_event["total_kg"], 1.0)
        self.assertEqual(feed_event["cost"], 10.0)
        self.assertEqual(feed_event["avg_per_animal"], 0.1)

    def test_maternity_technical_batch_is_only_listed_when_explicitly_requested(self):
        batch = AnimalBatch.objects.create(
            farm=self.farm_a,
            species=self.species,
            batch_code="MAT-TECNICO-01",
            quantity=12,
            entry_date=date.today(),
            category=AnimalBatch.Category.LEITAO,
            phase=AnimalBatch.Phase.GESTACAO_MATERNIDADE,
            origin=AnimalBatch.Origin.BORN,
        )

        regular_response = self.client.get(reverse("animalbatch-list"))
        feeding_response = self.client.get(
            reverse("animalbatch-list"), {"include_maternity": "true"}
        )

        regular_ids = {str(item["id"]) for item in regular_response.data["results"]}
        feeding_ids = {str(item["id"]) for item in feeding_response.data["results"]}
        self.assertNotIn(str(batch.id), regular_ids)
        self.assertIn(str(batch.id), feeding_ids)
