from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.inventory.models import Fornecedor, FormulaRacao, ItemEstoque, LoteEstoque, MovimentacaoEstoque
from apps.organizations.models import Organization

User = get_user_model()


class InventoryTenantIsolationTestCase(APITestCase):
    def setUp(self):
        self.org_a = Organization.objects.create(name="Organização A", slug="org-a-isolation")
        self.org_b = Organization.objects.create(name="Organização B", slug="org-b-isolation")
        self.user_a = User.objects.create_user(
            email="inventory-a@example.com", password="Password-8472", full_name="Usuário A", organization=self.org_a
        )
        self.item_a = ItemEstoque.objects.create(
            organization=self.org_a, nome="Ração A", categoria="racao", unidade_medida="kg"
        )
        self.item_b = ItemEstoque.objects.create(
            organization=self.org_b, nome="Ração B", categoria="racao", unidade_medida="kg"
        )
        self.supplier_b = Fornecedor.objects.create(organization=self.org_b, nome="Fornecedor B")
        self.lot_a = self.make_lot(self.item_a, "A-001")
        self.lot_b = self.make_lot(self.item_b, "B-001")
        self.client.force_authenticate(self.user_a)

    @staticmethod
    def make_lot(item, number):
        return LoteEstoque.objects.create(
            item=item,
            numero_lote=number,
            quantidade_inicial="10.00",
            quantidade_atual="10.00",
            data_entrada=date.today(),
        )

    def test_lot_list_and_detail_never_expose_another_tenant(self):
        response = self.client.get(reverse("inventory-lotes-list"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = {str(item["id"]) for item in response.data["results"]}
        self.assertIn(str(self.lot_a.id), ids)
        self.assertNotIn(str(self.lot_b.id), ids)

        detail = self.client.get(reverse("inventory-lotes-detail", args=[self.lot_b.id]))
        self.assertEqual(detail.status_code, status.HTTP_404_NOT_FOUND)

    def test_cannot_create_lot_for_foreign_item_or_supplier(self):
        payload = {
            "item": str(self.item_b.id),
            "numero_lote": "ATTACK",
            "quantidade_inicial": "5.00",
            "quantidade_atual": "5.00",
            "data_entrada": date.today().isoformat(),
        }
        foreign_item = self.client.post(reverse("inventory-lotes-list"), payload, format="json")
        self.assertEqual(foreign_item.status_code, status.HTTP_400_BAD_REQUEST)

        payload["item"] = str(self.item_a.id)
        payload["fornecedor"] = str(self.supplier_b.id)
        foreign_supplier = self.client.post(reverse("inventory-lotes-list"), payload, format="json")
        self.assertEqual(foreign_supplier.status_code, status.HTTP_400_BAD_REQUEST)

    def test_cannot_create_movement_for_foreign_item_or_lot(self):
        foreign_item = self.client.post(
            reverse("inventory-movimentacoes-list"),
            {"item": self.item_b.id, "tipo": "entrada", "quantidade": "1.00"},
            format="json",
        )
        self.assertEqual(foreign_item.status_code, status.HTTP_400_BAD_REQUEST)

        foreign_lot = self.client.post(
            reverse("inventory-movimentacoes-list"),
            {"item": self.item_a.id, "lote": self.lot_b.id, "tipo": "saida", "quantidade": "1.00"},
            format="json",
        )
        self.assertEqual(foreign_lot.status_code, status.HTTP_400_BAD_REQUEST)

    def test_operator_creates_and_edits_only_own_movements(self):
        other_user = User.objects.create_user(
            email="inventory-other@example.com", password="Password-8472", full_name="Outro",
            organization=self.org_a, role=User.Role.OPERATOR,
        )
        other_movement = MovimentacaoEstoque.objects.create(
            item=self.item_a, lote=self.lot_a, tipo="entrada", quantidade="1.00", responsavel=other_user,
        )

        create = self.client.post(
            reverse("inventory-movimentacoes-list"),
            {"item": self.item_a.id, "lote": self.lot_a.id, "tipo": "entrada", "quantidade": "1.00"},
            format="json",
        )
        self.assertEqual(create.status_code, status.HTTP_201_CREATED)
        own = MovimentacaoEstoque.objects.get(id=create.data["id"])
        self.assertEqual(own.responsavel, self.user_a)
        self.assertEqual(
            self.client.patch(
                reverse("inventory-movimentacoes-detail", args=[own.id]),
                {"observacao": "Ajustada"}, format="json",
            ).status_code,
            status.HTTP_200_OK,
        )
        self.assertEqual(
            self.client.patch(
                reverse("inventory-movimentacoes-detail", args=[other_movement.id]),
                {"observacao": "Negada"}, format="json",
            ).status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            self.client.delete(reverse("inventory-movimentacoes-detail", args=[own.id])).status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_movement_category_filter_exposes_semen_quantity_and_cost(self):
        semen = ItemEstoque.objects.create(
            organization=self.org_a,
            nome="Sêmen suíno",
            categoria="semen",
            unidade_medida="dose",
        )
        lot = LoteEstoque.objects.create(
            item=semen,
            numero_lote="SEM-001",
            quantidade_inicial=Decimal("10.00"),
            quantidade_atual=Decimal("9.00"),
            custo_unitario=Decimal("25.00"),
            data_entrada=date.today(),
        )
        movement = MovimentacaoEstoque.objects.create(
            item=semen,
            lote=lot,
            tipo="consumo",
            quantidade=Decimal("1.00"),
            responsavel=self.user_a,
            observacao="Consumo automático por inseminação artificial.",
        )

        response = self.client.get(
            reverse("inventory-movimentacoes-list"),
            {"tipo": "consumo", "categoria": "semen"},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([row["id"] for row in response.data["results"]], [str(movement.id)])
        self.assertEqual(response.data["results"][0]["item_categoria"], "semen")
        self.assertEqual(response.data["results"][0]["item_unidade"], "dose")
        self.assertEqual(response.data["results"][0]["quantidade"], "1.00")
        self.assertEqual(response.data["results"][0]["custo_total"], "25.0000")

    def test_feed_filter_includes_product_generated_by_active_formula(self):
        produced_feed = ItemEstoque.objects.create(
            organization=self.org_a,
            nome="Ração produzida na fábrica",
            categoria="outro",
            unidade_medida="kg",
        )
        FormulaRacao.objects.create(
            organization=self.org_a,
            nome="Ração crescimento",
            especie_animal="suino",
            item_final=produced_feed,
            ativa=True,
        )
        self.make_lot(produced_feed, "PROD-FABRICA-001")

        response = self.client.get(
            reverse("inventory-items-all-items"), {"categoria": "racao"}
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = {str(item["id"]) for item in response.data}
        self.assertIn(str(produced_feed.id), ids)
        self.assertIn(str(self.item_a.id), ids)
        self.assertNotIn(str(self.item_b.id), ids)

    def test_production_without_final_item_materializes_consumable_feed(self):
        formula = FormulaRacao.objects.create(
            organization=self.org_a,
            nome="Ração automática de gestação",
            especie_animal="suino",
            ativa=True,
        )

        response = self.client.post(
            reverse("inventory-producoes-produzir"),
            {
                "formula_id": str(formula.id),
                "quantidade_teorica": "120.00",
                "quantidade_real": "120.00",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

        formula.refresh_from_db()
        self.assertIsNotNone(formula.item_final_id)
        self.assertEqual(formula.item_final.categoria, "racao")
        self.assertEqual(formula.item_final.especie_animal, "suino")
        self.assertEqual(formula.item_final.estoque_atual, Decimal("120.00"))

        feeds = self.client.get(
            reverse("inventory-items-all-items"), {"categoria": "racao"}
        )
        self.assertIn(str(formula.item_final_id), {str(item["id"]) for item in feeds.data})

    def test_vaccine_filter_includes_combined_medicine_vaccine_category(self):
        combined = ItemEstoque.objects.create(
            organization=self.org_a,
            nome="Vacina reprodutiva",
            categoria="medicamento_vacina",
            categorias=["medicamento_vacina"],
            unidade_medida="ml",
        )
        foreign = ItemEstoque.objects.create(
            organization=self.org_b,
            nome="Vacina externa",
            categoria="medicamento_vacina",
            categorias=["medicamento_vacina"],
            unidade_medida="ml",
        )

        response = self.client.get(
            reverse("inventory-items-all-items"), {"categoria": "vacina"}
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = {str(item["id"]) for item in response.data}
        self.assertIn(str(combined.id), ids)
        self.assertNotIn(str(foreign.id), ids)
