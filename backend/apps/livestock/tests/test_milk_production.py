from datetime import timedelta
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase
from apps.organizations.models import Organization
from apps.farms.models import Farm
from apps.livestock.models import Animal, Species, CattleMilkRecord, CattleMilkDailyTotal, CattleAnimalProfile


class MilkProductionTests(APITestCase):
    base = "/api/v1/livestock/cattle/"

    def setUp(self):
        self.day = timezone.localdate()
        self.org = Organization.objects.create(name="Leite", slug="milk-flow")
        self.farm = Farm.objects.create(organization=self.org, name="Leiteira")
        other = Organization.objects.create(name="Outra", slug="milk-foreign")
        self.foreign_farm = Farm.objects.create(organization=other, name="Outra")
        self.species, _ = Species.objects.get_or_create(code="bovinos", defaults={"name": "Bovinos"})
        self.user = get_user_model().objects.create_user(email="milk-flow@example.invalid", password="test", role="admin", organization=self.org)
        self.client.force_authenticate(self.user)
        self.cow = self.animal("V001")
        self.second = self.animal("V002")

    def animal(self, identifier, **changes):
        return Animal.objects.create(**{**dict(identifier=identifier, farm=self.farm, species=self.species, cattle_purpose="dairy", category="Vaca", gender="F", status="active", reproductive_status="lactante", entry_date=self.day - timedelta(days=100)), **changes})

    def individual(self, **changes):
        return self.client.post(self.base + "milk/", {"animal": str(self.cow.pk), "date": str(self.day), "session": "morning", "liters": "12.00", **changes}, format="json")

    def total(self, **changes):
        return self.client.post(self.base + "milk-totals/", {"farm": str(self.farm.pk), "date": str(self.day), "liters": "950.00", **changes}, format="json")

    def test_day_summary_and_paginated_cow_status_use_distinct_animals(self):
        self.assertEqual(self.individual().status_code, 201)
        self.assertEqual(self.individual(session="afternoon", liters="8.00").status_code, 201)
        summary = self.client.get(self.base + "milk/day-summary/").data
        self.assertEqual(summary["produced_liters"], Decimal("20"))
        self.assertEqual(summary["milked_cows"], 1)
        self.assertEqual(summary["expected_cows"], 2)
        self.assertEqual(summary["pending_cows"], 1)
        self.assertEqual(summary["average_per_milked_cow"], Decimal("20"))
        result = self.client.get(self.base + "milk/cows/", {"page_size": 1})
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(result.data["count"], 2)
        self.assertEqual(result.data["results"][0]["liters"], Decimal("20"))
        self.assertIsNotNone(result.data["next"])
        pending = self.client.get(self.base + "milk/cows/", {"entry_status": "pending"})
        self.assertEqual([row["identifier"] for row in pending.data["results"]], ["V002"])

    def test_individual_duplicate_session_is_rejected_and_correction_is_not_added_again(self):
        created = self.individual()
        self.assertEqual(self.individual().status_code, 400)
        corrected = self.client.patch(self.base + f"milk/{created.data['id']}/", {"liters": "15.00"}, format="json")
        self.assertEqual(corrected.status_code, 200, corrected.data)
        self.assertEqual(CattleMilkRecord.objects.count(), 1)
        self.assertEqual(self.client.get(self.base + "milk/day-summary/").data["produced_liters"], 15)

    def test_total_cannot_follow_individual_and_individual_cannot_follow_total(self):
        self.individual()
        self.assertEqual(self.total().status_code, 400)
        tomorrow = str(self.day - timedelta(days=1))
        self.assertEqual(self.total(date=tomorrow).status_code, 201)
        self.assertEqual(self.individual(date=tomorrow).status_code, 400)
        record = CattleMilkRecord.objects.get()
        moved = self.client.patch(self.base + f"milk/{record.pk}/", {"date": tomorrow}, format="json")
        self.assertEqual(moved.status_code, 400)

    def test_aggregate_volume_is_in_daily_and_monthly_summary_without_fake_cow_counts(self):
        created = self.total(discarded_liters="50.00", discard_reason="Qualidade")
        self.assertEqual(created.status_code, 201, created.data)
        summary = self.client.get(self.base + "milk/day-summary/").data
        self.assertEqual(summary["produced_liters"], 950)
        self.assertEqual(summary["usable_liters"], 900)
        for field in ["milked_cows", "pending_cows", "average_per_milked_cow"]:
            self.assertIsNone(summary[field])
        self.assertEqual(self.total().status_code, 400)
        overview = self.client.get(self.base + "overview/").data
        self.assertEqual(overview["milk_produced_month"], 950)
        self.assertEqual(overview["milk_usable_month"], 900)
        self.assertEqual(self.client.get(self.base + "milk/cows/").data["results"][0]["entry_status"], "total")

    def test_tenant_scope_and_foreign_total_protection(self):
        self.assertEqual(self.total(farm=str(self.foreign_farm.pk)).status_code, 400)
        foreign = CattleMilkDailyTotal.objects.create(farm=self.foreign_farm, date=self.day, liters=999)
        self.assertEqual(self.client.get(self.base + f"milk-totals/{foreign.pk}/").status_code, 404)
        foreign_cow = self.animal("SECRET", farm=self.foreign_farm)
        CattleMilkRecord.objects.create(animal=foreign_cow, date=self.day, session="morning", liters=100)
        self.assertEqual(self.client.get(self.base + "milk/day-summary/").data["produced_liters"], 0)
        self.assertEqual(self.client.get(self.base + "milk/cows/").data["count"], 2)

    def test_operator_requires_bovine_scope_and_read_only_protects_writes(self):
        self.user.role = "operator"
        self.user.save(update_fields=["role"])
        self.assertEqual(self.client.get(self.base + "milk/cows/").status_code, 403)
        self.user.allowed_livestock.add(self.species)
        self.assertEqual(self.client.get(self.base + "milk/cows/").status_code, 200)
        created = self.total()
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(self.client.get(self.base + "milk-totals/").data["count"], 1)
        self.user.operator_read_only = True
        self.user.save(update_fields=["operator_read_only"])
        self.assertEqual(self.total(date=str(self.day-timedelta(days=1))).status_code, 403)

    def test_future_invalid_dates_and_discard_validation(self):
        self.assertEqual(self.total(date=str(self.day+timedelta(days=1))).status_code, 400)
        self.assertEqual(self.total(liters="-1").status_code, 400)
        self.assertEqual(self.total(discarded_liters="951", discard_reason="Qualidade").status_code, 400)
        self.assertEqual(self.total(discarded_liters="1").status_code, 400)
        self.assertEqual(self.client.get(self.base + "milk/cows/", {"date": "invalid"}).status_code, 400)
        self.assertEqual(self.client.get(self.base + "milk/day-summary/", {"farm": "invalid"}).status_code, 400)

    def test_search_and_existing_records_remain_visible_after_dry_off(self):
        CattleAnimalProfile.objects.create(animal=self.cow, name="Estrela", is_lactating=True)
        self.individual()
        profile = self.cow.cattle_profile
        profile.is_lactating = False
        profile.save()
        results = self.client.get(self.base + "milk/cows/", {"search": "Estrela"})
        self.assertEqual(results.data["count"], 1)
        self.assertEqual(results.data["results"][0]["entry_status"], "recorded")
