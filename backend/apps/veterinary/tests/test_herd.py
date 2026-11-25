from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.farms.models import Farm
from apps.livestock.models import Animal, HealthRecord, Species, VaccinationRecord
from apps.organizations.models import Organization

from .test_veterinary import PASSWORD, VeterinaryBase, contract

User = get_user_model()
HERD = "/api/v1/veterinary/herd/"


class HerdTests(VeterinaryBase):
    def setUp(self):
        super().setUp()
        self.farm_obj = Farm.objects.create(organization=self.org, name="Fazenda A")
        self.cattle, _ = Species.objects.get_or_create(code="bovinos", defaults={"name": "Bovinos"})
        self.swine, _ = Species.objects.get_or_create(code="suinos", defaults={"name": "Suínos"})
        self.cow = Animal.objects.create(farm=self.farm_obj, species=self.cattle, identifier="V-01")
        self.sow = Animal.objects.create(farm=self.farm_obj, species=self.swine, identifier="M-01")
        today = timezone.localdate()
        VaccinationRecord.objects.create(farm=self.farm_obj, species=self.cattle, animal=self.cow, vaccine_name="Aftosa", application_date=today)
        HealthRecord.objects.create(farm=self.farm_obj, animal=self.cow, application_date=today, description="Exame", cost="300")
        self.vet = User.objects.create_user(role="veterinarian", email="vet-herd@example.com", password=PASSWORD, full_name="Vet", organization=self.org)

    def test_admin_sees_all_species_with_last_records(self):
        data = self.client.get(HERD).data
        self.assertEqual({row["code"] for row in data["species"]}, {"bovinos", "suinos"})
        cow = next(row for row in data["results"] if row["identifier"] == "V-01")
        self.assertEqual(cow["last_vaccine"]["name"], "Aftosa")
        self.assertIsNotNone(cow["last_health"])

    def test_veterinarian_sees_only_species_granted_by_admin(self):
        self.client.force_authenticate(self.vet)
        self.assertEqual(self.client.get(HERD).data["count"], 0)
        self.client.force_authenticate(self.admin)
        response = self.client.patch(f"/api/v1/auth/members/{self.vet.pk}/", {"allowed_livestock": [self.cattle.pk]}, format="json")
        self.assertIn(response.status_code, (200, 204), getattr(response, "data", None))
        self.client.force_authenticate(self.vet)
        data = self.client.get(HERD).data
        self.assertEqual([row["identifier"] for row in data["results"]], ["V-01"])
        self.assertEqual(self.client.get(f"{HERD}{self.sow.pk}/").status_code, 404)
        history = self.client.get(f"{HERD}{self.cow.pk}/").data
        self.assertEqual({event["kind"] for event in history["events"]}, {"vaccination", "health"})
        self.assertNotIn("300", str(history))  # no costs
        # An enabled segment opens to the veterinarian like an operator, scoped to that species.
        animals = self.client.get("/api/v1/livestock/animals/")
        self.assertEqual(animals.status_code, 200)
        self.assertNotIn(str(self.sow.pk), str(animals.data))

    def test_other_organization_herd_is_not_visible(self):
        other = Organization.objects.create(name="Vet B", slug="vet-b-herd")
        contract(other)
        outsider = User.objects.create_user(role="admin", email="vet-b-herd@example.com", password=PASSWORD, full_name="B", organization=other)
        self.client.force_authenticate(outsider)
        self.assertEqual(self.client.get(HERD).data["count"], 0)
        self.assertEqual(self.client.get(f"{HERD}{self.cow.pk}/").status_code, 404)


class DashboardCardTests(VeterinaryBase):
    def test_segment_card_shows_area_billing_only_when_contracted(self):
        self.assertEqual(self.register(diagnosis="open", conduct="observe_heat").status_code, 201)
        card = self.client.get("/api/v1/reports/dashboard/").data["segments"]["veterinary"]
        self.assertGreater(card["revenue"], 0)
        self.assertEqual(card["cost"], 0.0)
        self.assertTrue(card["revenue_breakdown"])

        other = Organization.objects.create(name="Sem vet", slug="vet-card-none")
        admin = User.objects.create_user(role="admin", email="vet-card-none@example.com", password=PASSWORD, full_name="N", organization=other)
        self.client.force_authenticate(admin)
        self.assertIsNone(self.client.get("/api/v1/reports/dashboard/").data["segments"]["veterinary"])
