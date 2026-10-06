from datetime import date

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.farms.models import Farm
from apps.livestock.models import Animal, AnimalBatch, Birth, Mating, Pregnancy, Species
from apps.organizations.models import Organization


User = get_user_model()


class ReproductionConsistencyTestCase(APITestCase):
    def setUp(self):
        self.organization = Organization.objects.create(
            name="Ciclo Reprodutivo", slug="ciclo-reprodutivo"
        )
        self.user = User.objects.create_user(
            email="reproducao@example.com",
            password="Password-8472",
            full_name="Gestor Reprodução",
            organization=self.organization,
        )
        self.farm = Farm.objects.create(
            organization=self.organization, name="Fazenda Reprodução"
        )
        self.swine = Species.objects.create(name="Suínos Consistência", code="suinos")
        self.client.force_authenticate(self.user)

    def test_covered_gilt_belongs_only_to_coverage_gestation_phase(self):
        gilt = Animal.objects.create(
            farm=self.farm,
            species=self.swine,
            identifier="M-001",
            gender=Animal.Gender.FEMALE,
            category=AnimalBatch.Category.MARRA,
            reproductive_status=Animal.ReproductiveStatus.COBERTA,
            entry_date=date.today(),
        )
        Mating.objects.create(female=gilt, mating_date=date.today())

        dashboard = self.client.get(
            reverse("reproduction_dashboard"), {"species": "suinos"}
        )
        marras = self.client.get(reverse("marras"), {"species": "suinos"})
        gestations = self.client.get(reverse("gestacoes"), {"species": "suinos"})

        self.assertEqual(dashboard.status_code, status.HTTP_200_OK)
        self.assertEqual(marras.status_code, status.HTTP_200_OK)
        self.assertEqual(gestations.status_code, status.HTTP_200_OK)
        self.assertEqual(dashboard.data["kpis"]["marras"], 0)
        self.assertEqual(marras.data["kpis"]["total"], 0)
        self.assertEqual(gestations.data["kpis"]["total"], 1)
        self.assertEqual(gestations.data["kpis"]["aguardando_dg"], 1)

    def test_birth_completes_pregnancy_and_removes_it_from_gestation_phase(self):
        sow = Animal.objects.create(
            farm=self.farm,
            species=self.swine,
            identifier="M-002",
            gender=Animal.Gender.FEMALE,
            category=AnimalBatch.Category.MATRIZ,
            reproductive_status=Animal.ReproductiveStatus.GESTANTE,
        )
        mating = Mating.objects.create(
            female=sow,
            mating_date=date.today(),
            status=Mating.Status.CONFIRMED,
        )
        pregnancy = Pregnancy.objects.create(
            mating=mating,
            female=sow,
            start_date=date.today(),
            expected_birth_date=date.today(),
        )

        Birth.objects.create(
            pregnancy=pregnancy,
            female=sow,
            birth_date=date.today(),
            live_born=10,
        )

        pregnancy.refresh_from_db()
        gestations = self.client.get(reverse("gestacoes"), {"species": "suinos"})

        self.assertEqual(pregnancy.status, Pregnancy.Status.COMPLETED)
        self.assertEqual(gestations.status_code, status.HTTP_200_OK)
        self.assertEqual(gestations.data["kpis"]["total"], 0)
