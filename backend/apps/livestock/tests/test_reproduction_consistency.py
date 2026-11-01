from datetime import date, timedelta

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
        self.user = User.objects.create_user(role="admin",
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

    def test_all_alerts_includes_future_dates_but_keeps_tenant_and_acknowledgements(self):
        from django.utils import timezone
        from apps.livestock.models import AcknowledgedOperationalAlert

        today = timezone.localdate()
        female = Animal.objects.create(
            farm=self.farm, species=self.swine, identifier="FUTURE-01",
            gender="F", category="Matriz", reproductive_status="coberta",
            entry_date=today,
        )
        Mating.objects.create(female=female, mating_date=today,
                              expected_diagnosis_date=today + timedelta(days=21))
        other_org = Organization.objects.create(name="Outra", slug="outra-alertas")
        other_farm = Farm.objects.create(organization=other_org, name="Outra fazenda")
        other = Animal.objects.create(farm=other_farm, species=self.swine,
                                      identifier="SECRET-OTHER", gender="F", category="Matriz",
                                      reproductive_status="coberta", entry_date=today)
        Mating.objects.create(female=other, mating_date=today,
                              expected_diagnosis_date=today + timedelta(days=21))
        url = reverse("reproduction_dashboard")
        normal = self.client.get(url, {"species": "suinos"})
        self.assertFalse(any("FUTURE-01" in item["text"] for item in normal.data["alerts"]))
        full = self.client.get(url, {"species": "suinos", "include_all_alerts": "true"})
        self.assertEqual(full.status_code, 200)
        future = next(item for item in full.data["alerts"] if "FUTURE-01" in item["text"])
        self.assertFalse(any("SECRET-OTHER" in item["text"] for item in full.data["alerts"]))
        AcknowledgedOperationalAlert.objects.create(user=self.user, organization=self.organization,
                                                     alert_key=future["alert_key"], alert_text=future["text"])
        full = self.client.get(url, {"species": "suinos", "include_all_alerts": "true"})
        self.assertFalse(any(item["alert_key"] == future["alert_key"] for item in full.data["alerts"]))

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

    def test_pending_diagnosis_dates_are_calendar_dates_for_both_schedules(self):
        from django.utils import timezone
        from apps.livestock.operational_alerts import pending_diagnoses, _scheduled_reproductive_alerts
        today = timezone.localdate()
        sow = Animal.objects.create(farm=self.farm, species=self.swine, identifier="DATE-REGRESSION", gender="F", category=AnimalBatch.Category.MATRIZ, entry_date=today)
        mating = Mating.objects.create(female=sow, mating_date=today, status=Mating.Status.PENDING_DG)
        for explicit in (None, today + timedelta(days=30)):
            with self.subTest(explicit=explicit):
                Mating.objects.filter(pk=mating.pk).update(expected_diagnosis_date=explicit)
                due = pending_diagnoses(self.organization,"suinos").get(pk=mating.pk).diagnosis_due_date
                self.assertIs(type(due), date)
                self.assertEqual(due, explicit or today + timedelta(days=21))
                alerts = _scheduled_reproductive_alerts(self.organization,"suinos")
                diagnosis = next(alert for alert in alerts if "Diagnóstico de prenhez" in alert["text"])
                self.assertEqual(diagnosis["due_date"], due.isoformat())
                response = self.client.get(reverse("reproduction_dashboard"), {"species":"suinos"})
                self.assertEqual(response.status_code,200,response.data)
