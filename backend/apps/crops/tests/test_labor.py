from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.crops.models import Field, LaborRecord, LaborWorker, PlantingCycle
from apps.farms.models import Farm
from apps.finance.models import Transaction
from apps.organizations.models import Organization

User = get_user_model()


class LaborAPITestCase(APITestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Labor Org", slug="labor-org")
        self.other_org = Organization.objects.create(name="Other Org", slug="other-labor-org")
        self.user = User.objects.create_user(
            email="labor@test.com",
            password="password123",
            full_name="Labor User",
            role=User.Role.OWNER,
            organization=self.org,
        )
        self.client.force_authenticate(user=self.user)

        self.farm = Farm.objects.create(
            organization=self.org,
            name="Labor Farm",
            total_area_ha=Decimal("20.00"),
        )
        self.field = Field.objects.create(
            farm=self.farm,
            name="Labor Field",
            area_ha=Decimal("10.00"),
        )
        self.plantation = PlantingCycle.objects.create(
            organization=self.org,
            farm=self.farm,
            field=self.field,
            name="Labor Plantation",
            crop_name="Milho",
            planting_date=date.today(),
        )
        self.worker = LaborWorker.objects.create(
            organization=self.org,
            name="João Labor",
            worker_type=LaborWorker.WorkerType.EMPLOYEE,
        )

        other_farm = Farm.objects.create(
            organization=self.other_org,
            name="Other Farm",
            total_area_ha=Decimal("20.00"),
        )
        other_field = Field.objects.create(
            farm=other_farm,
            name="Other Field",
            area_ha=Decimal("10.00"),
        )
        self.other_plantation = PlantingCycle.objects.create(
            organization=self.other_org,
            farm=other_farm,
            field=other_field,
            name="Other Plantation",
            crop_name="Soja",
            planting_date=date.today(),
        )
        self.other_worker = LaborWorker.objects.create(
            organization=self.other_org,
            name="Other Worker",
            worker_type=LaborWorker.WorkerType.PROVIDER,
        )

    def test_create_labor_worker_assigns_user_organization(self):
        response = self.client.post(
            reverse("crops-labor-workers-list"),
            {
                "name": "Maria Prestadora",
                "worker_type": LaborWorker.WorkerType.PROVIDER,
                "document": "12345678900",
                "phone": "81999999999",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        worker = LaborWorker.objects.get(id=response.data["id"])
        self.assertEqual(worker.organization, self.org)
        self.assertEqual(worker.name, "Maria Prestadora")

    def test_create_labor_record_calculates_total_and_creates_financial_transaction(self):
        response = self.client.post(
            reverse("crops-labor-records-list"),
            {
                "plantation": str(self.plantation.id),
                "worker": str(self.worker.id),
                "activity_type": LaborRecord.ActivityType.PESTICIDE_APPLICATION,
                "payment_method": LaborRecord.PaymentMethod.DAILY,
                "activity_date": str(date.today()),
                "daily_quantity": "3",
                "daily_rate": "150.00",
                "notes": "Aplicação no talhão principal.",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Decimal(response.data["total_amount"]), Decimal("450.00"))

        record = LaborRecord.objects.get(id=response.data["id"])
        transaction = Transaction.objects.get(reference=f"LABOR-{record.id}")
        self.assertEqual(transaction.amount, Decimal("450.00"))
        self.assertEqual(transaction.category.name, "Mão de Obra")
        self.assertEqual(transaction.planting_cycle, self.plantation)
        self.assertEqual(transaction.created_by, self.user)

    def test_labor_record_rejects_worker_from_another_organization(self):
        response = self.client.post(
            reverse("crops-labor-records-list"),
            {
                "plantation": str(self.plantation.id),
                "worker": str(self.other_worker.id),
                "activity_type": LaborRecord.ActivityType.PLANTING,
                "payment_method": LaborRecord.PaymentMethod.DAILY,
                "activity_date": str(date.today()),
                "daily_quantity": "1",
                "daily_rate": "100.00",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("worker", response.data["error"]["detail"])

    def test_labor_record_rejects_non_positive_daily_values(self):
        response = self.client.post(
            reverse("crops-labor-records-list"),
            {
                "plantation": str(self.plantation.id),
                "worker": str(self.worker.id),
                "activity_type": LaborRecord.ActivityType.IRRIGATION,
                "payment_method": LaborRecord.PaymentMethod.DAILY,
                "activity_date": str(date.today()),
                "daily_quantity": "0",
                "daily_rate": "100.00",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("daily_quantity", response.data["error"]["detail"])
