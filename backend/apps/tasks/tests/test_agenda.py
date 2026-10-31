from datetime import timedelta
from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase
from apps.organizations.models import Organization
from apps.farms.models import Farm
from apps.crops.models import Field, PlantingCycle
from apps.livestock.models import Species, VaccinationRecord, Animal, Mating, Pregnancy, Birth, Litter, HeatRecord
from apps.tasks.models import Task


class OrganizationAgendaTests(APITestCase):
    def setUp(self):
        self.today = timezone.localdate()
        self.org = Organization.objects.create(name="Agenda", slug="agenda-test")
        self.farm = Farm.objects.create(organization=self.org, name="Farm")
        self.user = get_user_model().objects.create_user(email="agenda@example.invalid", password="test", organization=self.org, role="admin")
        self.client.force_authenticate(self.user)
        self.species, _ = Species.objects.get_or_create(code="bovinos", defaults={"name":"Bovinos"})
        VaccinationRecord.objects.create(farm=self.farm, species=self.species, vaccine_name="Vacina", application_date=self.today, next_dose_date=self.today)
        field = Field.objects.create(farm=self.farm, name="Talhão", area_ha=10)
        PlantingCycle.objects.create(organization=self.org, field=field, name="Milho", crop_name="Milho", planting_date=self.today)
        Task.objects.create(organization=self.org, title="Conferir curral", due_date=self.today, created_by=self.user)

    def agenda(self, **params):
        response = self.client.get(reverse("organization-agenda"), {"start":self.today.isoformat(), "end":self.today.isoformat(), **params})
        self.assertEqual(response.status_code, 200, response.data)
        return response.data

    def test_unifies_sources_and_pages_without_losing_day_count(self):
        result = self.agenda(page_size=2)
        self.assertEqual(result["count"], 3)
        self.assertEqual(len(result["results"]), 2)
        self.assertIsNotNone(result["next"])
        all_rows = result["results"] + self.agenda(page_size=2, page=2)["results"]
        self.assertEqual({row["domain"] for row in all_rows}, {"livestock", "crops", "tasks"})
        self.assertEqual(self.agenda(include_recorded=True)["count"],4)

    def test_foreign_tenant_not_visible_and_filters_apply(self):
        org = Organization.objects.create(name="Foreign", slug="agenda-foreign")
        Task.objects.create(organization=org, title="Secret", due_date=self.today)
        self.assertEqual(self.agenda(domain="tasks")["count"],1)
        self.assertEqual(self.agenda(farm=str(self.farm.pk))["count"],2)
        self.assertEqual(self.agenda(farm="00000000-0000-0000-0000-000000000000")["count"],0)

    def test_operator_scopes_and_recorded_toggle(self):
        self.user.role="operator"; self.user.can_operate_crops=False; self.user.save()
        self.assertEqual(self.agenda()["count"],1)
        self.user.allowed_livestock.add(self.species)
        self.assertEqual(self.agenda()["count"],2)
        self.user.can_operate_crops=True; self.user.save()
        self.assertEqual(self.agenda()["count"],3)
        Task.objects.filter(organization=self.org).update(status="done")
        self.assertEqual(self.agenda()["count"],2)
        self.assertEqual(self.agenda(include_recorded=True)["count"],4)

    def test_invalid_range_rejected(self):
        for end in [self.today-timedelta(days=1),self.today+timedelta(days=42)]:
            self.assertEqual(self.client.get(reverse("organization-agenda"), {"start":self.today,"end":end}).status_code,400)

    def test_weaning_and_predicted_heat_dates(self):
        animal = Animal.objects.create(farm=self.farm, species=self.species, identifier="M1", gender="F", entry_date=self.today)
        mating = Mating.objects.create(female=animal, mating_date=self.today-timedelta(days=300))
        pregnancy = Pregnancy.objects.create(female=animal, mating=mating, start_date=mating.mating_date, expected_birth_date=self.today-timedelta(days=21), status="completed")
        birth = Birth.objects.create(female=animal, pregnancy=pregnancy, birth_date=self.today-timedelta(days=21), live_born=1, expected_weaning_days=21)
        Litter.objects.get_or_create(birth=birth)
        Animal.objects.filter(pk=animal.pk).update(reproductive_status="vazia")
        HeatRecord.objects.create(animal=animal, heat_date=self.today, is_predicted=True, heat_number=2)
        rows = self.agenda(domain="livestock")["results"]
        self.assertTrue({"weaning", "heat"}.issubset({row["kind"] for row in rows}), rows)
        self.assertTrue(all(row["date"] == self.today.isoformat() for row in rows))
