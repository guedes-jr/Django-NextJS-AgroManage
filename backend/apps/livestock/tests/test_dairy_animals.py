from datetime import timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.farms.models import Farm
from apps.organizations.models import Organization
from apps.livestock.models import Animal, AnimalBatch, CattleAnimalProfile, Species


class DairyAnimalsTests(APITestCase):
    url = "/api/v1/livestock/cattle/animals/"

    def setUp(self):
        self.today = timezone.localdate()
        self.org = Organization.objects.create(name="Dairy animals", slug="dairy-animals")
        self.other = Organization.objects.create(name="Other", slug="dairy-animals-other")
        self.farm = Farm.objects.create(organization=self.org, name="Farm")
        self.foreign = Farm.objects.create(organization=self.other, name="Other")
        self.species, _ = Species.objects.get_or_create(code="bovinos", defaults={"name": "Bovinos"})
        self.user = get_user_model().objects.create_user(email="dairy-animals@example.invalid", password="test", role="admin", organization=self.org)
        self.client.force_authenticate(self.user)

    def animal(self, identifier, **changes):
        return Animal.objects.create(**dict(dict(farm=self.farm, species=self.species, identifier=identifier, gender="F", category="Vaca", birth_date=self.today-timedelta(days=1000), entry_date=self.today), **changes))

    def test_name_is_separate_from_identifier_and_survives_other_edits(self):
        animal = self.animal("001", reproductive_status="lactante")
        response = self.client.patch(f"{self.url}{animal.pk}/", {"name": "Bella"}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["name"], "Bella")
        animal.refresh_from_db()
        self.assertEqual(animal.identifier, "001")
        self.assertTrue(animal.cattle_profile.is_lactating)
        self.assertEqual(self.client.patch(f"{self.url}{animal.pk}/", {"notes": "Updated"}, format="json").data["name"], "Bella")
        self.assertEqual(self.client.get(self.url, {"search": "bell"}).data["count"], 1)
        self.assertEqual(self.client.patch(f"{self.url}{animal.pk}/", {"name": "Bela"}, format="json").data["name"], "Bela")
        self.assertEqual(self.client.patch(f"{self.url}{animal.pk}/", {"name": "x"*101}, format="json").status_code, 400)

    def test_creation_stores_optional_name_and_legacy_rows_are_empty(self):
        response = self.client.post(self.url, {"farm_id": str(self.farm.pk), "species_code_input": "bovinos", "identifier": "002", "name": "Estrela", "gender": "F", "category": "Novilha", "entry_date": str(self.today)}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["name"], "Estrela")
        legacy = self.animal("Legacy")
        self.assertEqual(self.client.get(f"{self.url}{legacy.pk}/").data["name"], "")

    def test_counts_are_scoped_and_independent_of_page_and_selected_tab(self):
        self.animal("Cow")
        self.animal("Matrix", category="Matriz")
        self.animal("Heifer", category="Novilha")
        self.animal("Female calf", category="Bezerro")
        self.animal("Male calf", category="Bezerro", gender="M")
        self.animal("Bull", category="Touro", gender="M")
        self.animal("Sire", category="Reprodutor", gender="M")
        self.animal("Sold", status="sold")
        self.animal("Foreign", farm=self.foreign)
        response = self.client.get(f"{self.url}category-counts/", {"status": "active", "page_size": 1, "dairy_category": "cows"})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data, {"all": 7, "cows": 2, "heifers": 1, "calves": 1, "bulls": 2})
        for group, expected in [("cows", 2), ("heifers", 1), ("calves", 1), ("bulls", 2)]:
            self.assertEqual(self.client.get(self.url, {"status": "active", "dairy_category": group}).data["count"], expected)
        self.assertEqual(self.client.get(self.url, {"dairy_category": "invalid"}).status_code, 400)
        self.assertEqual(self.client.get(f"{self.url}category-counts/", {"farm": str(self.foreign.pk)}).data["all"], 0)

    def test_search_uses_name_identifier_and_batch_without_tenant_leaks(self):
        batch = AnimalBatch.objects.create(farm=self.farm, species=self.species, batch_code="LEITE-01", name="Primavera", quantity=1, entry_date=self.today)
        cow = self.animal("003", batch=batch)
        CattleAnimalProfile.objects.create(animal=cow, name="Morena")
        foreign = self.animal("Other", farm=self.foreign)
        CattleAnimalProfile.objects.create(animal=foreign, name="Morena")
        for term in ["003", "morena", "LEITE-01", "primavera"]:
            result = self.client.get(self.url, {"search": term})
            self.assertEqual([row["id"] for row in result.data["results"]], [str(cow.pk)])
            self.assertEqual(self.client.get(f"{self.url}category-counts/", {"search": term}).data["all"], 1)

    def test_operator_scope_and_foreign_edit_remain_protected(self):
        cow = self.animal("Cow")
        foreign = self.animal("Other", farm=self.foreign)
        self.assertEqual(self.client.patch(f"{self.url}{foreign.pk}/", {"name": "Other"}, format="json").status_code, 404)
        self.user.role = "operator"
        self.user.save(update_fields=["role"])
        self.assertEqual(self.client.get(f"{self.url}category-counts/").status_code, 403)
        self.user.allowed_livestock.add(self.species)
        self.assertEqual(self.client.get(f"{self.url}category-counts/").data["all"], 1)
