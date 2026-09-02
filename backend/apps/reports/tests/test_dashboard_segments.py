from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.inventory.models import ItemEstoque, LoteEstoque
from apps.finance.models import FinancialCategory, Transaction
from apps.farms.models import Farm
from apps.livestock.models import AnimalBatch, Species
from apps.organizations.models import Organization

User = get_user_model()


class DashboardSegmentTestCase(APITestCase):
    def setUp(self):
        self.organization = Organization.objects.create(
            name="Dashboard Agrícola", slug="dashboard-agricola"
        )
        self.user = User.objects.create_user(
            email="dashboard-agricola@example.com",
            password="Password-8472",
            full_name="Dashboard Agrícola",
            organization=self.organization,
        )
        self.client.force_authenticate(self.user)
        self.farm = Farm.objects.create(
            organization=self.organization,
            name="Fazenda Dashboard",
        )

    def test_agricultural_stock_purchase_appears_in_crop_segment(self):
        item = ItemEstoque.objects.create(
            organization=self.organization,
            nome="Abamex",
            categoria="fertirrigacao",
            categorias=["fertirrigacao", "defensivo"],
            unidade_medida="l",
        )
        LoteEstoque.objects.create(
            item=item,
            numero_lote="AGR-001",
            quantidade_inicial=Decimal("5.00"),
            quantidade_atual=Decimal("5.00"),
            custo_unitario=Decimal("95.00"),
            data_entrada=date.today(),
        )

        response = self.client.get(reverse("dashboard-summary"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["kpis"]["month_expense"], 475.0)
        self.assertEqual(response.data["segments"]["crops"]["cost"], 475.0)
        self.assertEqual(
            response.data["segments"]["crops"]["cost_breakdown"],
            [{"name": "Compra de Insumos", "value": 475.0}],
        )

    def test_animal_inventory_purchase_is_not_classified_as_crop_cost(self):
        item = ItemEstoque.objects.create(
            organization=self.organization,
            nome="Medicamento bovino",
            categoria="medicamento",
            categorias=["medicamento"],
            especie_animal="bovino",
            unidade_medida="unidade",
        )
        LoteEstoque.objects.create(
            item=item,
            numero_lote="VET-001",
            quantidade_inicial=Decimal("2.00"),
            quantidade_atual=Decimal("2.00"),
            custo_unitario=Decimal("50.00"),
            data_entrada=date.today(),
        )

        response = self.client.get(reverse("dashboard-summary"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["kpis"]["month_expense"], 100.0)
        self.assertEqual(response.data["segments"]["crops"]["cost"], 0.0)

    def test_legacy_agricultural_expense_without_cycle_is_classified_by_category(self):
        category = FinancialCategory.objects.create(
            organization=self.organization,
            name="Compra de Insumos",
            category_type=FinancialCategory.CategoryType.EXPENSE,
        )
        Transaction.objects.create(
            organization=self.organization,
            category=category,
            description="Compra agrícola antiga",
            amount=Decimal("570.00"),
            due_date=date.today(),
            payment_date=date.today(),
            status=Transaction.Status.PAID,
            reference="NF-LEGADA-001",
        )

        response = self.client.get(reverse("dashboard-summary"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["kpis"]["month_expense"], 570.0)
        self.assertEqual(response.data["segments"]["crops"]["cost"], 570.0)

    def test_swine_batch_purchase_appears_in_swine_segment(self):
        swine = Species.objects.create(name="Suínos", code="suinos")
        batch = AnimalBatch.objects.create(
            farm=self.farm,
            species=swine,
            batch_code="SU-001",
            quantity=20,
            entry_date=date.today(),
            origin=AnimalBatch.Origin.PURCHASED,
            purchase_value=Decimal("1500.00"),
        )

        transaction = Transaction.objects.get(reference=f"PURCHASE-BATCH-{batch.id}")
        self.assertEqual(transaction.animal_batch_id, batch.id)
        self.assertEqual(transaction.species_id, swine.id)

        response = self.client.get(reverse("dashboard-summary"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        swine_segment = response.data["segments"]["livestock_by_species"][0]
        self.assertEqual(swine_segment["code"], "suinos")
        self.assertEqual(swine_segment["cost"], 1500.0)
        self.assertEqual(
            swine_segment["cost_breakdown"],
            [{"name": "Compra de Animais", "value": 1500.0}],
        )

    def test_swine_inventory_purchase_appears_in_swine_segment(self):
        Species.objects.create(name="Suínos", code="suinos")
        item = ItemEstoque.objects.create(
            organization=self.organization,
            nome="Vacina reprodutiva",
            categoria="vacina",
            categorias=["vacina"],
            especie_animal="suino",
            unidade_medida="ml",
        )
        LoteEstoque.objects.create(
            item=item,
            numero_lote="VAC-SU-001",
            quantidade_inicial=Decimal("50.00"),
            quantidade_atual=Decimal("50.00"),
            custo_unitario=Decimal("3.00"),
            data_entrada=date.today(),
        )

        response = self.client.get(reverse("dashboard-summary"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        swine_segment = response.data["segments"]["livestock_by_species"][0]
        self.assertEqual(swine_segment["cost"], 150.0)
        self.assertEqual(
            swine_segment["cost_breakdown"],
            [{"name": "Compra de Insumos", "value": 150.0}],
        )
