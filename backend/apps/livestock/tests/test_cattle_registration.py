from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.farms.models import Farm
from apps.organizations.models import Organization
from apps.livestock.models import Animal, CattleAnimalProfile, Species, Mating, Pregnancy, Birth, HistoricoEvento


class CattleRegistrationTests(APITestCase):
    def setUp(self):
        self.today = timezone.localdate()
        self.org = Organization.objects.create(name="Cadastro", slug="cattle-form")
        self.farm = Farm.objects.create(organization=self.org, name="Fazenda")
        self.species, _ = Species.objects.get_or_create(code="bovinos", defaults={"name": "Bovinos"})
        self.user = get_user_model().objects.create_user(email="registration@example.invalid", password="test", role="admin", organization=self.org)
        self.client.force_authenticate(self.user)

    def animal(self, identifier, **values):
        return Animal.objects.create(**dict(dict(farm=self.farm, species=self.species, identifier=identifier, gender="F", category="Vaca", entry_date=self.today), **values))

    def test_registration_stores_optional_details_without_inventing_reproductive_events(self):
        values = dict(farm_id=str(self.farm.pk), identifier="BELLA", name="Bella", category="Vaca", gender="F", entry_date=str(self.today),
                      birth_date=str(self.today-timedelta(days=1800)), coat_color="Preta e branca", birth_weight_kg="35.50", genealogical_registration="RGD-12",
                      dairy_aptitude=True, beef_aptitude=False, embryo_role="donor", historical_birth_count=3, historical_last_birth_date=str(self.today-timedelta(days=100)), initial_weaning_date=str(self.today-timedelta(days=1600)))
        response = self.client.post(reverse("cattle-animal-list"), values, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        animal = Animal.objects.get(pk=response.data["id"])
        self.assertEqual(animal.cattle_profile.birth_weight_kg, Decimal("35.50"))
        self.assertEqual(animal.cattle_profile.historical_birth_count, 3)
        self.assertEqual(animal.cattle_profile.weaning_date, self.today-timedelta(days=1600))
        self.assertEqual(animal.birth_count, 0)
        self.assertFalse(Mating.objects.exists())
        self.assertFalse(Pregnancy.objects.exists())
        self.assertFalse(Birth.objects.exists())
        url = reverse("cattle-animal-detail", args=[animal.pk])
        self.assertEqual(self.client.get(url).data["coat_color"], "Preta e branca")
        response = self.client.patch(url, {"coat_color": "Preta", "dairy_aptitude": False}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["coat_color"], "Preta")
        self.assertFalse(response.data["dairy_aptitude"])
        self.assertEqual(response.data["name"], "Bella")
        self.assertEqual(response.data["historical_birth_count"], 3)

    def test_profile_validation_and_legacy_defaults(self):
        animal = self.animal("OLD")
        url = reverse("cattle-animal-detail", args=[animal.pk])
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["coat_color"], "")
        self.assertEqual(response.data["historical_birth_count"], 0)
        self.assertFalse(response.data["dairy_aptitude"])
        for values in ({"birth_weight_kg": "-1"}, {"historical_birth_count": -1}, {"historical_last_birth_date": str(self.today+timedelta(days=1))}, {"historical_last_birth_date": str(self.today)}, {"embryo_role": "invalid"}, {"initial_weaning_date": str(self.today)}):
            self.assertEqual(self.client.patch(url, values, format="json").status_code, 400)
        male = self.animal("MALE", gender="M", category="Touro")
        for values in ({"historical_birth_count": 1}, {"embryo_role": "donor"}):
            self.assertEqual(self.client.patch(reverse("cattle-animal-detail", args=[male.pk]), values, format="json").status_code, 400)

    def test_reproduction_phases_count_all_records_and_preserve_lactation(self):
        heifer = self.animal("HEIFER", category="Novilha")
        open_cow = self.animal("OPEN", reproductive_status="vazia")
        covered = self.animal("COVERED", reproductive_status="coberta")
        pregnant = self.animal("PREGNANT", reproductive_status="gestante")
        CattleAnimalProfile.objects.create(animal=pregnant, is_lactating=True)
        calf = self.animal("CALF", category="Bezerro", gender="M")
        weaned = self.animal("WEANED", category="Bezerro")
        CattleAnimalProfile.objects.create(animal=weaned, weaning_date=self.today)
        self.animal("SOLD", status="sold", reproductive_status="gestante")
        other = Organization.objects.create(name="Outra", slug="registration-foreign")
        foreign_farm = Farm.objects.create(name="Outra", organization=other)
        self.animal("FOREIGN", farm=foreign_farm, reproductive_status="gestante")
        url = reverse("cattle-animal-reproduction-summary")
        summary = self.client.get(url, {"page_size": 1}).data
        self.assertEqual({key: summary[key] for key in ("heifers", "open", "covered", "pregnant", "suckling", "calves")}, dict(heifers=1, open=1, covered=1, pregnant=1, suckling=1, calves=1))
        for group, animal in dict(heifers=heifer, open=open_cow, covered=covered, pregnant=pregnant, suckling=pregnant, calves=calf).items():
            response = self.client.get(reverse("cattle-animal-list"), {"reproduction_group": group, "status": "active"})
            self.assertEqual([row["id"] for row in response.data["results"]], [str(animal.pk)], group)
        self.assertEqual(self.client.get(reverse("cattle-animal-list"), {"reproduction_group": "invalid"}).status_code, 400)
        self.assertEqual(self.client.get(url, {"farm": str(foreign_farm.pk)}).data["pregnant"], 0)

    def test_reproduction_dates_and_access_scope(self):
        cow = self.animal("COW", reproductive_status="gestante")
        day = self.today-timedelta(days=40)
        mating = Mating.objects.create(female=cow, mating_date=day)
        expected = self.today+timedelta(days=240)
        Pregnancy.objects.create(female=cow, mating=mating, start_date=day, expected_birth_date=expected)
        response = self.client.get(reverse("cattle-animal-detail", args=[cow.pk]))
        self.assertEqual(response.data["last_mating_date"], str(day))
        self.assertEqual(response.data["expected_birth_date"], str(expected))
        self.assertEqual(response.data["gestation_days"], 40)
        self.user.role = "operator"; self.user.save(update_fields=["role"])
        self.assertEqual(self.client.get(reverse("cattle-animal-reproduction-summary")).status_code, 403)
        self.user.allowed_livestock.add(self.species)
        self.assertEqual(self.client.get(reverse("cattle-animal-reproduction-summary")).status_code, 200)

    def test_requested_bovine_tabs_preserve_category_pregnancy_and_lactation(self):
        heifer = self.animal("HEIFER-PREGNANT", category="Novilha", reproductive_status="gestante")
        lactating = self.animal("PREGNANT-LACTATING", reproductive_status="gestante")
        CattleAnimalProfile.objects.create(animal=lactating, is_lactating=True)
        empty = self.animal("EMPTY", reproductive_status="vazia")
        resting = self.animal("DRY", reproductive_status="descanso")
        dried_pregnant = self.animal("DRIED-PREGNANT", reproductive_status="gestante")
        CattleAnimalProfile.objects.create(animal=dried_pregnant, is_lactating=False)
        HistoricoEvento.objects.create(farm=self.farm, matriz=dried_pregnant, tipo_evento="Secagem", data_evento=self.today, descricao="Secagem registrada")
        self.animal("MALE", category="Touro", gender="M")
        response = self.client.get(reverse("cattle-animal-reproduction-summary"), {"page_size": 1})
        for key, count in {"heifers": 1, "cows": 4, "pregnant": 3, "lactating": 1, "dry": 2}.items():
            self.assertEqual(response.data[key], count, key)
        for group, identifiers in {"heifers": [heifer.pk], "cows": [lactating.pk, empty.pk, resting.pk, dried_pregnant.pk], "pregnant": [heifer.pk, lactating.pk, dried_pregnant.pk], "lactating": [lactating.pk], "dry": [resting.pk, dried_pregnant.pk]}.items():
            rows = self.client.get(reverse("cattle-animal-list"), {"reproduction_group": group, "status": "active"}).data["results"]
            self.assertEqual({row["id"] for row in rows}, {str(pk) for pk in identifiers}, group)
