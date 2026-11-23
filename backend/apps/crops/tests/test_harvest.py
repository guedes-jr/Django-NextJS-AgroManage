from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.crops.models import Field, Harvest, HarvestBuyer, PlantingCycle
from apps.farms.models import Farm
from apps.finance.models import FinancialCategory, Transaction
from apps.inventory.models import ItemEstoque, LoteEstoque
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
            role=User.Role.ADMIN,
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

    def test_stock_packaging_lists_scoped_items_and_restores_all_lots_on_delete(self):
        packaging = ItemEstoque.objects.create(
            organization=self.org, nome="Sacaria", categoria="outro", unidade_medida="unidade",
        )
        outside = ItemEstoque.objects.create(
            organization=self.other_org, nome="Outro saco", categoria="material", unidade_medida="saco",
        )
        ItemEstoque.objects.create(
            organization=self.org, nome="Sementes", categoria="semente", unidade_medida="unidade",
        )
        for quantity, cost in [(3, Decimal("2.00")), (7, Decimal("4.00"))]:
            LoteEstoque.objects.create(
                item=packaging, numero_lote=f"SAC-{quantity}", quantidade_inicial=quantity, quantidade_atual=quantity,
                custo_unitario=cost, data_entrada=date.today(), data_validade=date.today() + timedelta(days=quantity),
            )
        options = self.client.get(reverse("crops-harvests-available-packaging"))
        self.assertEqual(options.status_code, 200, options.data)
        self.assertEqual([row["id"] for row in options.json()], [str(packaging.pk)])
        self.assertEqual(Decimal(options.data[0]["package_unit_cost"]), Decimal("3.40"))

        payload = {
            "planting_cycle": str(self.plantation.pk), "harvest_date": date.today().isoformat(),
            "quantity": 60, "destination": "stock", "packaged": True,
            "package_weight_kg": 10, "package_count": 6,
        }
        url = reverse("crops-harvests-list")
        outside_response = self.client.post(url, {**payload, "package_item": str(outside.pk)}, format="json")
        self.assertEqual(outside_response.status_code, 400, outside_response.data)
        saved = self.client.post(url, {**payload, "package_item": str(packaging.pk)}, format="json")
        self.assertEqual(saved.status_code, 201, saved.data)
        self.assertEqual(saved.data["package_type"], "sack")
        harvest = Harvest.objects.get(pk=saved.data["id"])
        self.assertEqual(harvest.packaging_movements.count(), 2)
        self.assertEqual(packaging.estoque_atual, Decimal("4"))
        deleted = self.client.delete(reverse("crops-harvests-detail", args=[harvest.pk]))
        self.assertEqual(deleted.status_code, 204)
        self.assertEqual(packaging.estoque_atual, Decimal("10"))

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
        harvest_date = date.today() - timedelta(days=65)
        self.plantation.planting_date = harvest_date - timedelta(days=65)
        self.plantation.save(update_fields=["planting_date", "updated_at"])
        response = self.client.post(
            reverse("crops-harvests-list"),
            {
                "planting_cycle": str(self.plantation.id),
                "harvest_type": Harvest.HarvestType.TOTAL,
                "harvest_date": str(harvest_date),
                "yield_kg": "10000.00",
                "destination": Harvest.Destination.STOCK,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Decimal(response.data["revenue_amount"]), Decimal("0.00"))
        harvest = Harvest.objects.get(id=response.data["id"])
        self.assertFalse(Transaction.objects.filter(reference=f"HARVEST-{harvest.id}").exists())
        self.plantation.refresh_from_db()
        self.assertEqual(self.plantation.actual_harvest_date, harvest_date)
        self.assertEqual(self.plantation.status, PlantingCycle.Status.FINISHED)
        self.assertEqual(self.plantation.days_in_cultivation, 65)

    def test_partial_harvest_keeps_cultivation_open(self):
        response = self.client.post(
            reverse("crops-harvests-list"),
            {
                "planting_cycle": str(self.plantation.id),
                "harvest_type": Harvest.HarvestType.PARTIAL,
                "harvest_date": str(date.today()),
                "yield_kg": "100.00",
                "destination": Harvest.Destination.STOCK,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.plantation.refresh_from_db()
        self.assertIsNone(self.plantation.actual_harvest_date)
        self.assertEqual(self.plantation.status, PlantingCycle.Status.HARVESTING)

    def test_changing_total_harvest_to_partial_reopens_cycle(self):
        harvest = Harvest.objects.create(
            planting_cycle=self.plantation,
            harvest_type=Harvest.HarvestType.TOTAL,
            harvest_date=date.today(),
            yield_kg=Decimal("100.00"),
            destination=Harvest.Destination.STOCK,
        )
        self.plantation.actual_harvest_date = harvest.harvest_date
        self.plantation.status = PlantingCycle.Status.FINISHED
        self.plantation.save()

        response = self.client.patch(
            reverse("crops-harvests-detail", args=[harvest.id]),
            {"harvest_type": Harvest.HarvestType.PARTIAL},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.plantation.refresh_from_db()
        self.assertIsNone(self.plantation.actual_harvest_date)
        self.assertEqual(self.plantation.status, PlantingCycle.Status.HARVESTING)

    def test_deleting_total_harvest_reopens_cycle(self):
        harvest = Harvest.objects.create(
            planting_cycle=self.plantation,
            harvest_type=Harvest.HarvestType.TOTAL,
            harvest_date=date.today(),
            yield_kg=Decimal("100.00"),
            destination=Harvest.Destination.STOCK,
        )
        self.plantation.actual_harvest_date = harvest.harvest_date
        self.plantation.status = PlantingCycle.Status.FINISHED
        self.plantation.save()

        response = self.client.delete(
            reverse("crops-harvests-detail", args=[harvest.id])
        )

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.plantation.refresh_from_db()
        self.assertIsNone(self.plantation.actual_harvest_date)
        self.assertEqual(self.plantation.status, PlantingCycle.Status.GROWING)

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
