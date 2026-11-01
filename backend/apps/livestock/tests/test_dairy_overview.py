from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.organizations.models import Organization
from apps.farms.models import Farm
from apps.livestock.models import Animal, Species, CattleMilkRecord


class DairyOverviewTests(APITestCase):
    url = "/api/v1/livestock/cattle/dairy-overview/"

    def setUp(self):
        self.day = timezone.localdate()
        self.org = Organization.objects.create(name="Leite", slug="dairy-home")
        self.farm = Farm.objects.create(organization=self.org, name="Fazenda")
        self.species, _ = Species.objects.get_or_create(code="bovinos", defaults={"name": "Bovinos"})
        self.user = get_user_model().objects.create_user(email="dairy@example.invalid", password="test", organization=self.org, role="admin")
        self.client.force_authenticate(self.user)
        self.cow = self.animal("V1", reproductive_status="lactante")

    def animal(self, identifier, **changes):
        return Animal.objects.create(**dict(dict(farm=self.farm, species=self.species, identifier=identifier, cattle_purpose="dairy", gender="F", category="Vaca", entry_date=self.day-timedelta(days=100)), **changes))

    def milk(self, cow, liters, session="morning", **changes):
        return CattleMilkRecord.objects.create(**dict(dict(animal=cow, date=self.day, session=session, liters=liters, discarded_liters=0), **changes))

    def test_daily_volume_discard_and_average_use_unique_milked_cows(self):
        second = self.animal("V2")
        self.milk(self.cow, 10, discarded_liters=2)
        self.milk(self.cow, 6, session="afternoon")
        self.milk(second, 8)
        self.milk(self.cow, 50, date=self.day-timedelta(days=1))
        self.animal("B1", category="Bezerro")
        self.animal("N1", category="Novilha")
        self.animal("T1", category="Touro", gender="M")
        self.animal("Inactive", status="sold")
        result = self.client.get(self.url)
        self.assertEqual(result.status_code, 200, result.data)
        for key, expected in {"lactating_cows": 1, "total_cows": 2, "non_lactating_cows": 1, "young_females": 2, "bulls": 1, "produced_liters": Decimal(24), "usable_liters": Decimal(22), "milked_cows": 2, "average_per_milked_cow": Decimal(12)}.items():
            self.assertEqual(result.data[key], expected, key)

    def test_date_and_farm_are_scoped_without_inventing_an_average(self):
        self.milk(self.cow, 15)
        other_org = Organization.objects.create(name="Outra", slug="dairy-foreign")
        other_farm = Farm.objects.create(organization=other_org, name="Outra")
        foreign = self.animal("Other", farm=other_farm)
        self.milk(foreign, 100)
        self.assertEqual(self.client.get(self.url).data["produced_liters"], 15)
        empty = self.client.get(self.url, {"farm": str(other_farm.pk)})
        self.assertEqual(empty.data["produced_liters"], 0)
        self.assertEqual(empty.data["total_cows"], 0)
        self.assertIsNone(empty.data["average_per_milked_cow"])
        past = self.client.get(self.url, {"date": str(self.day-timedelta(days=1))})
        self.assertEqual(past.data["produced_liters"], 0)
        self.assertEqual(past.data["total_cows"], 1)
        self.assertEqual(self.client.get(self.url, {"date": str(self.day+timedelta(days=1))}).status_code, 400)
        self.assertEqual(self.client.get(self.url, {"farm": "invalid"}).status_code, 400)

    def test_young_female_shortcut_filters_sex_and_category(self):
        calf = self.animal("Calf", category="Bezerro")
        heifer = self.animal("Heifer", category="Novilha")
        self.animal("Male calf", category="Bezerro", gender="M")
        result = self.client.get("/api/v1/livestock/cattle/animals/", {"young_females": "true"})
        self.assertEqual({row["id"] for row in result.data["results"]}, {str(calf.pk), str(heifer.pk)})

    def test_operator_needs_bovine_scope_and_sees_no_prices(self):
        self.user.role = "operator"
        self.user.save(update_fields=["role"])
        self.assertEqual(self.client.get(self.url).status_code, 403)
        self.user.allowed_livestock.add(self.species)
        result = self.client.get(self.url)
        self.assertEqual(result.status_code, 200)
        self.assertNotIn("revenue", result.data)
        self.assertNotIn("price", result.data)
