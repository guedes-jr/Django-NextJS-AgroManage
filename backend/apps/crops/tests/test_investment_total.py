from datetime import date
from decimal import Decimal

from django.test import TestCase

from apps.finance.models import FinancialCategory, Transaction
from apps.farms.models import Farm
from apps.inventory.models import ItemEstoque
from apps.organizations.models import Organization

from ..models import Fertigation, Field, PlantingCycle


class PlantationInvestmentTotalTestCase(TestCase):
    def setUp(self):
        self.organization = Organization.objects.create(
            name="Custos da Safra", slug="custos-da-safra"
        )
        self.farm = Farm.objects.create(
            organization=self.organization, name="Fazenda Custos"
        )
        self.field = Field.objects.create(
            farm=self.farm, name="Talhão Custos", area_ha="1.00"
        )
        self.plantation = PlantingCycle.objects.create(
            organization=self.organization,
            farm=self.farm,
            field=self.field,
            name="Safra de custos",
            crop_name="Melancia",
            planting_date=date.today(),
        )
        self.item = ItemEstoque.objects.create(
            organization=self.organization,
            nome="Fertilizante teste",
            categoria="fertirrigacao",
            unidade_medida="l",
        )
        self.expense_category = FinancialCategory.objects.create(
            organization=self.organization,
            name="Despesas agrícolas",
            category_type=FinancialCategory.CategoryType.EXPENSE,
        )
        self.revenue_category = FinancialCategory.objects.create(
            organization=self.organization,
            name="Receitas agrícolas",
            category_type=FinancialCategory.CategoryType.REVENUE,
        )

    def create_transaction(self, amount, category, reference="", status="paid"):
        return Transaction.objects.create(
            organization=self.organization,
            farm=self.farm,
            category=category,
            description="Lançamento de teste",
            amount=amount,
            due_date=date.today(),
            status=status,
            planting_cycle=self.plantation,
            reference=reference,
        )

    def test_does_not_double_count_automatic_operation_transaction(self):
        operation = Fertigation.objects.create(
            plantation=self.plantation,
            item=self.item,
            quantity="1.00",
            unit="l",
            unit_price="263.50",
            total_price="263.50",
            application_date=date.today(),
        )
        self.create_transaction(
            "263.50", self.expense_category, reference=f"FERTIGATION-{operation.id}"
        )

        self.assertEqual(self.plantation.investment_total, Decimal("263.50"))

    def test_includes_manual_expenses_but_not_revenue_or_cancelled_expense(self):
        self.create_transaction("100.00", self.expense_category, reference="NOTA-001")
        self.create_transaction("500.00", self.revenue_category, reference="VENDA-001")
        self.create_transaction(
            "75.00", self.expense_category, reference="NOTA-CANCELADA", status="cancelled"
        )

        self.assertEqual(self.plantation.investment_total, Decimal("100.00"))
