from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.crops.models import Field, Harvest, HarvestBuyer, PlantingCycle
from apps.farms.models import Farm
from apps.finance.models import FinancialCategory, Transaction
from apps.organizations.models import Organization

User = get_user_model()


class HarvestAPITestCase(APITestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Harvest Org", slug="harvest-org")
        self.other_org = Organization.objects.create(name="Other Harvest Org", slug="other-harvest-org")
        self.user = User.objects.create_user(
            email="harvest@test.com",
            password="password123",
            full_name="Harvest User",
            role=User.Role.OWNER,
            organization=self.org,
        )
        self.client.force_authenticate(user=self.user)

        self.farm = Farm.objects.create(
            organization=self.org,
            name="Harvest Farm",
            total_area_ha=Decimal("20.00"),
        )
        self.field = Field.objects.create(
            farm=self.farm,
            name="Harvest Field",
            area_ha=Decimal("10.00"),
        )
        self.plantation = PlantingCycle.objects.create(
            organization=self.org,
            farm=self.farm,
            field=self.field,
            name="Harvest Plantation",
            crop_name="Milho",
            planting_date=date.today(),
        )
        self.buyer = HarvestBuyer.objects.create(
            organization=self.org,
            name="CEASA",
            document="12345678000199",
        )

        other_farm = Farm.objects.create(
            organization=self.other_org,
            name="Other Harvest Farm",
            total_area_ha=Decimal("20.00"),
        )
        other_field = Field.objects.create(
            farm=other_farm,
            name="Other Harvest Field",
            area_ha=Decimal("10.00"),
        )
        self.other_plantation = PlantingCycle.objects.create(
            organization=self.other_org,
            farm=other_farm,
            field=other_field,
            name="Other Harvest Plantation",
            crop_name="Soja",
            planting_date=date.today(),
        )
        self.other_buyer = HarvestBuyer.objects.create(
            organization=self.other_org,
            name="Other Buyer",
        )

    def test_create_harvest_buyer_assigns_user_organization(self):
        response = self.client.post(
            reverse("crops-harvest-buyers-list"),
            {
                "name": "Mercado Central",
                "document": "12345678900",
                "phone": "81999999999",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        buyer = HarvestBuyer.objects.get(id=response.data["id"])
        self.assertEqual(buyer.organization, self.org)
        self.assertEqual(buyer.name, "Mercado Central")

    def test_create_sale_harvest_calculates_revenue_and_creates_financial_transaction(self):
        response = self.client.post(
            reverse("crops-harvests-list"),
            {
                "planting_cycle": str(self.plantation.id),
                "harvest_type": Harvest.HarvestType.PARTIAL,
                "harvest_date": str(date.today()),
                "yield_kg": "25000.00",
                "destination": Harvest.Destination.SALE,
                "buyer": str(self.buyer.id),
                "unit_price": "1.20",
                "notes": "Primeira colheita.",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Decimal(response.data["revenue_amount"]), Decimal("30000.00"))

        harvest = Harvest.objects.get(id=response.data["id"])
        transaction = Transaction.objects.get(reference=f"HARVEST-{harvest.id}")
        self.assertEqual(transaction.amount, Decimal("30000.00"))
        self.assertEqual(transaction.category.name, "Colheita")
        self.assertEqual(transaction.category.category_type, "revenue")
        self.assertEqual(transaction.planting_cycle, self.plantation)
        self.assertEqual(transaction.created_by, self.user)

    def test_create_stock_harvest_does_not_create_financial_transaction(self):
        response = self.client.post(
            reverse("crops-harvests-list"),
            {
                "planting_cycle": str(self.plantation.id),
                "harvest_type": Harvest.HarvestType.TOTAL,
                "harvest_date": str(date.today()),
                "yield_kg": "10000.00",
                "destination": Harvest.Destination.STOCK,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Decimal(response.data["revenue_amount"]), Decimal("0.00"))
        harvest = Harvest.objects.get(id=response.data["id"])
        self.assertFalse(Transaction.objects.filter(reference=f"HARVEST-{harvest.id}").exists())

    def test_sale_harvest_rejects_buyer_from_another_organization(self):
        response = self.client.post(
            reverse("crops-harvests-list"),
            {
                "planting_cycle": str(self.plantation.id),
                "harvest_type": Harvest.HarvestType.PARTIAL,
                "harvest_date": str(date.today()),
                "yield_kg": "10000.00",
                "destination": Harvest.Destination.SALE,
                "buyer": str(self.other_buyer.id),
                "unit_price": "1.00",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("buyer", response.data["error"]["detail"])

    def test_harvest_rejects_non_positive_quantity(self):
        response = self.client.post(
            reverse("crops-harvests-list"),
            {
                "planting_cycle": str(self.plantation.id),
                "harvest_type": Harvest.HarvestType.PARTIAL,
                "harvest_date": str(date.today()),
                "yield_kg": "0",
                "destination": Harvest.Destination.STOCK,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("yield_kg", response.data["error"]["detail"])

    def test_sale_harvest_requires_positive_unit_price(self):
        response = self.client.post(
            reverse("crops-harvests-list"),
            {
                "planting_cycle": str(self.plantation.id),
                "harvest_type": Harvest.HarvestType.PARTIAL,
                "harvest_date": str(date.today()),
                "yield_kg": "10000.00",
                "destination": Harvest.Destination.SALE,
                "buyer": str(self.buyer.id),
                "unit_price": "0",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("unit_price", response.data["error"]["detail"])

    def test_update_sale_harvest_updates_financial_transaction(self):
        harvest = Harvest.objects.create(
            planting_cycle=self.plantation,
            harvest_type=Harvest.HarvestType.PARTIAL,
            harvest_date=date.today(),
            yield_kg=Decimal("1000.00"),
            destination=Harvest.Destination.SALE,
            buyer=self.buyer,
            unit_price=Decimal("1.00"),
            created_by=self.user,
        )
        category = FinancialCategory.objects.create(
            organization=self.org,
            name="Colheita",
            category_type="revenue",
        )
        Transaction.objects.create(
            organization=self.org,
            farm=self.farm,
            category=category,
            description="Colheita antiga",
            amount=Decimal("1000.00"),
            due_date=date.today(),
            status="paid",
            planting_cycle=self.plantation,
            reference=f"HARVEST-{harvest.id}",
            created_by=self.user,
        )

        response = self.client.patch(
            reverse("crops-harvests-detail", args=[harvest.id]),
            {
                "yield_kg": "2000.00",
                "unit_price": "1.50",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(Decimal(response.data["revenue_amount"]), Decimal("3000.00"))

        transaction = Transaction.objects.get(reference=f"HARVEST-{harvest.id}")
        self.assertEqual(transaction.amount, Decimal("3000.00"))
        self.assertIn("CEASA", transaction.description)

    def test_delete_harvest_removes_financial_transaction(self):
        harvest = Harvest.objects.create(
            planting_cycle=self.plantation,
            harvest_type=Harvest.HarvestType.PARTIAL,
            harvest_date=date.today(),
            yield_kg=Decimal("1000.00"),
            destination=Harvest.Destination.SALE,
            buyer=self.buyer,
            unit_price=Decimal("1.00"),
            created_by=self.user,
        )
        category = FinancialCategory.objects.create(
            organization=self.org,
            name="Colheita",
            category_type="revenue",
        )
        Transaction.objects.create(
            organization=self.org,
            farm=self.farm,
            category=category,
            description="Colheita",
            amount=Decimal("1000.00"),
            due_date=date.today(),
            status="paid",
            planting_cycle=self.plantation,
            reference=f"HARVEST-{harvest.id}",
            created_by=self.user,
        )

        response = self.client.delete(reverse("crops-harvests-detail", args=[harvest.id]))

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Harvest.objects.filter(id=harvest.id).exists())
        self.assertFalse(Transaction.objects.filter(reference=f"HARVEST-{harvest.id}").exists())
