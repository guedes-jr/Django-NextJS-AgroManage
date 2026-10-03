import json
from datetime import date

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.farms.models import Farm
from apps.finance.models import BankAccount, FinancialCategory, Transaction
from apps.organizations.models import Organization

User = get_user_model()


class FinanceTenantIsolationTestCase(APITestCase):
    def setUp(self):
        self.org_a = Organization.objects.create(name="Financeiro A", slug="finance-a-isolation")
        self.org_b = Organization.objects.create(name="Financeiro B", slug="finance-b-isolation")
        self.user_a = User.objects.create_user(
            email="finance-a@example.com", password="Password-8472", full_name="Finance A",
            organization=self.org_a, role=User.Role.MANAGER,
        )
        self.category_a = FinancialCategory.objects.create(
            organization=self.org_a, name="Receitas A", category_type=FinancialCategory.CategoryType.REVENUE
        )
        self.category_b = FinancialCategory.objects.create(
            organization=self.org_b, name="Receitas B", category_type=FinancialCategory.CategoryType.REVENUE
        )
        self.account_b = BankAccount.objects.create(organization=self.org_b, name="Conta B")
        self.farm_b = Farm.objects.create(organization=self.org_b, name="Fazenda B")
        self.transaction_b = Transaction.objects.create(
            organization=self.org_b,
            category=self.category_b,
            description="Transação B",
            amount="100.00",
            due_date=date.today(),
        )
        self.client.force_authenticate(self.user_a)

    def transaction_payload(self, **changes):
        payload = {
            "category": str(self.category_a.id),
            "description": "Compra local",
            "amount": "25.00",
            "due_date": date.today().isoformat(),
            "status": "pending",
        }
        payload.update(changes)
        return payload

    def test_swine_labor_saves_by_sector_without_a_batch_and_updates_dashboard(self):
        category = self.client.post(
            reverse("financial-category-list"),
            {"name": "Mão de Obra - Suinocultura", "category_type": "expense", "is_active": True},
            format="json",
        )
        self.assertEqual(category.status_code, status.HTTP_201_CREATED)
        labor = {"sector": "Geral", "worker": "João", "activity": "Manejo",
                 "type": "daily", "people": 15, "quantity": 10, "rate": 120,
                 "observations": ""}
        response = self.client.post(
            reverse("transaction-list"),
            self.transaction_payload(
                category=category.data["id"], amount="18000.00", status="paid",
                payment_date=date.today().isoformat(), reference="LABOR-SWINE-test",
                description="Mão de obra (Diária): Geral — Manejo — João",
                notes=json.dumps({"version": 1, "labor": labor}),
            ), format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        transaction = Transaction.objects.get(pk=response.data["id"])
        self.assertIsNone(transaction.animal_batch_id)
        self.assertEqual(transaction.organization_id, self.org_a.id)
        self.assertEqual(json.loads(transaction.notes)["labor"]["sector"], "Geral")
        dashboard = self.client.get(reverse("dashboard-summary"))
        self.assertEqual(dashboard.status_code, status.HTTP_200_OK)
        self.assertEqual(dashboard.data["kpis"]["month_expense"], 18000.0)
        self.assertEqual(dashboard.data["segments"]["livestock"]["cost"], 18000.0)

    def test_lists_and_details_do_not_expose_foreign_transactions(self):
        response = self.client.get(reverse("transaction-list"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn(str(self.transaction_b.id), {str(item["id"]) for item in response.data["results"]})
        detail = self.client.get(reverse("transaction-detail", args=[self.transaction_b.id]))
        self.assertEqual(detail.status_code, status.HTTP_404_NOT_FOUND)

    def test_rejects_foreign_category_farm_and_bank_account(self):
        cases = [
            {"category": str(self.category_b.id)},
            {"farm": str(self.farm_b.id)},
            {"bank_account": str(self.account_b.id)},
        ]
        for changes in cases:
            with self.subTest(changes=changes):
                response = self.client.post(
                    reverse("transaction-list"), self.transaction_payload(**changes), format="json"
                )
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_rejects_foreign_parent_category(self):
        response = self.client.post(
            reverse("financial-category-list"),
            {"name": "Subcategoria", "category_type": "expense", "parent": self.category_b.id},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_viewer_cannot_write_financial_data(self):
        viewer = User.objects.create_user(
            email="finance-viewer@example.com", password="Password-8472", full_name="Viewer",
            organization=self.org_a, role=User.Role.VIEWER,
        )
        self.client.force_authenticate(viewer)
        self.assertEqual(self.client.get(reverse("transaction-list")).status_code, status.HTTP_200_OK)
        response = self.client.post(reverse("transaction-list"), self.transaction_payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_operator_creates_categories_but_only_higher_roles_edit_and_delete(self):
        operator = User.objects.create_user(email="category-operator@example.com", password="Password-8472", full_name="Operador", organization=self.org_a, role=User.Role.OPERATOR)
        self.client.force_authenticate(operator)
        create = self.client.post(reverse("financial-category-list"), {"name": "Mão de Obra", "category_type": "expense"}, format="json")
        self.assertEqual(create.status_code, status.HTTP_201_CREATED)
        url = reverse("financial-category-detail", args=[create.data["id"]])
        self.assertEqual(self.client.patch(url, {"name": "Editada"}, format="json").status_code, 403)
        self.assertEqual(self.client.delete(url).status_code, 403)
        self.client.force_authenticate(self.user_a)
        self.assertEqual(self.client.patch(url, {"name": "Editada"}, format="json").status_code, 200)
        self.assertEqual(self.client.delete(url).status_code, 204)

    def test_operator_creates_but_cannot_edit_transactions(self):
        operator = User.objects.create_user(
            email="finance-operator@example.com", password="Password-8472", full_name="Operator",
            organization=self.org_a, role=User.Role.OPERATOR,
        )
        other = Transaction.objects.create(
            organization=self.org_a, category=self.category_a, description="Outro usuário",
            amount="50.00", due_date=date.today(), created_by=self.user_a,
        )
        self.client.force_authenticate(operator)

        create = self.client.post(reverse("transaction-list"), self.transaction_payload(), format="json")
        self.assertEqual(create.status_code, status.HTTP_201_CREATED)
        own_id = create.data["id"]
        self.assertEqual(Transaction.objects.get(id=own_id).created_by, operator)
        self.assertEqual(
            self.client.patch(
                reverse("transaction-detail", args=[own_id]), {"description": "Editada"}, format="json"
            ).status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            self.client.patch(
                reverse("transaction-detail", args=[other.id]), {"description": "Negada"}, format="json"
            ).status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            self.client.delete(reverse("transaction-detail", args=[own_id])).status_code,
            status.HTTP_403_FORBIDDEN,
        )
