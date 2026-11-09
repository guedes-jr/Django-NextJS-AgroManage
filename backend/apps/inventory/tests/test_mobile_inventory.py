from datetime import date
from decimal import Decimal
from unittest.mock import PropertyMock, patch

from django.contrib.auth import get_user_model
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from rest_framework.test import APITestCase

from apps.organizations.models import Organization
from apps.inventory.models import ItemEstoque, LoteEstoque, Fornecedor, AlertaEstoque, MovimentacaoEstoque


class MobileInventoryTests(APITestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Mobile estoque", slug="mobile-stock")
        self.other = Organization.objects.create(name="Outra", slug="other-stock")
        self.user = get_user_model().objects.create_user(email="stock@example.invalid", password="test", role="manager", organization=self.org)
        self.client.force_authenticate(self.user)
        self.empty = self.item("Sem lotes", minimum="2")
        self.stocked = self.item("Com saldo", minimum="5")
        self.lot = LoteEstoque.objects.create(item=self.stocked, numero_lote="0009", quantidade_inicial="7.25", quantidade_atual="7.25", custo_unitario=None, data_entrada=date.today())
        self.zero = self.item("Sem mínimo", minimum="0")
        self.foreign = self.item("Estrangeiro", minimum="10", org=self.other)

    def item(self, name, minimum, org=None):
        return ItemEstoque.objects.create(organization=org or self.org, nome=name, categoria="racao", unidade_medida="kg", estoque_minimo=minimum)

    def test_operational_projection_is_exact_and_does_not_compute_financial_properties(self):
        with patch.object(ItemEstoque, "custo_medio", new_callable=PropertyMock, side_effect=AssertionError("financial property requested")):
            response = self.client.get(reverse("inventory-items-list"), {"view": "operational"})
        self.assertEqual(response.status_code, 200, response.data)
        rows = {str(row["id"]): row for row in response.data["results"]}
        self.assertEqual(rows[str(self.stocked.pk)]["estoque_atual"], "7.25")
        self.assertEqual(rows[str(self.empty.pk)]["estoque_atual"], "0.00")
        self.assertTrue(rows[str(self.empty.pk)]["estoque_baixo"])
        self.assertFalse(rows[str(self.zero.pk)]["estoque_baixo"])
        self.assertNotIn(str(self.foreign.pk), rows)
        for row in rows.values():
            self.assertNotIn("custo_medio", row)
            self.assertNotIn("organization", row)
        legacy = self.client.get(reverse("inventory-items-detail", args=[self.stocked.pk]))
        self.assertIn("custo_medio", legacy.data)
        lot = self.client.get(reverse("inventory-lotes-list"), {"view": "operational", "item": str(self.stocked.pk)})
        self.assertEqual(lot.status_code, 200, lot.data)
        self.assertEqual(lot.data["results"][0]["quantidade_atual"], "7.25")
        self.assertNotIn("custo_unitario", lot.data["results"][0])
        self.assertNotIn("nota_fiscal", lot.data["results"][0])

    def test_operational_summary_and_low_filter_include_empty_items_and_exclude_inactive_lots(self):
        LoteEstoque.objects.create(item=self.empty, numero_lote="INATIVO", quantidade_inicial="99", quantidade_atual="99", data_entrada=date.today(), ativo=False)
        stats = self.client.get(reverse("inventory-items-stats"), {"view": "operational"})
        self.assertEqual(stats.data, {"total_items": 3, "estoque_baixo": 1})
        low = self.client.get(reverse("inventory-items-list"), {"view": "operational", "status": "baixo"})
        self.assertEqual([str(row["id"]) for row in low.data["results"]], [str(self.empty.pk)])
        normal = self.client.get(reverse("inventory-items-list"), {"view": "operational", "status": "normal"})
        self.assertEqual(normal.data["count"], 2)
        legacy = self.client.get(reverse("inventory-items-stats"))
        self.assertIn("total_value", legacy.data)

    def test_pagination_search_and_tenant_scope_of_details_suppliers_alerts_and_lots(self):
        for name in ["A", "B", "C"]:
            self.item(name, minimum="0")
        first = self.client.get(reverse("inventory-items-list"), {"view": "operational", "page_size": 2})
        self.assertEqual(len(first.data["results"]), 2)
        self.assertIsNotNone(first.data["next"])
        detail = self.client.get(reverse("inventory-items-detail", args=[self.foreign.pk]), {"view": "operational"})
        self.assertEqual(detail.status_code, 404)
        a = Fornecedor.objects.create(organization=self.org, nome="Fornecedor alvo", cnpj="123456")
        b = Fornecedor.objects.create(organization=self.other, nome="Fornecedor alvo")
        result = self.client.get(reverse("inventory-fornecedores-list"), {"search": "1234"})
        self.assertEqual([row["id"] for row in result.data["results"]], [str(a.pk)])
        self.assertEqual(self.client.get(reverse("inventory-fornecedores-detail", args=[b.pk])).status_code, 404)
        before = MovimentacaoEstoque.objects.count()
        alert = AlertaEstoque.objects.create(organization=self.org, item=None, titulo="Geral", descricao="Confira")
        AlertaEstoque.objects.create(organization=self.other, item=self.foreign, titulo="Outra")
        result = self.client.get(reverse("inventory-alertas-list"))
        self.assertEqual(result.data["count"], 1)
        self.assertIsNone(result.data["results"][0]["item"])
        alert.refresh_from_db()
        self.assertFalse(alert.lido)
        self.assertFalse(alert.resolvido)
        self.lot.refresh_from_db()
        self.assertEqual(self.lot.quantidade_atual, Decimal("7.25"))
        self.assertEqual(MovimentacaoEstoque.objects.count(), before)
        foreign_lot = LoteEstoque.objects.create(item=self.foreign, numero_lote="OUTRO", quantidade_inicial="1", quantidade_atual="1", data_entrada=date.today())
        self.assertEqual(self.client.get(reverse("inventory-lotes-detail", args=[foreign_lot.pk]), {"view": "operational"}).status_code, 404)

    def test_operational_item_list_has_bounded_queries(self):
        for i in range(15):
            self.item(f"Item {i}", minimum="1")
        with CaptureQueriesContext(connection) as queries:
            response = self.client.get(reverse("inventory-items-list"), {"view": "operational", "page_size": 20})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertLessEqual(len(queries), 6)

    def test_feeder_cannot_use_inventory_read_routes(self):
        self.user.role = "feeder"
        self.user.save(update_fields=["role"])
        for route in ["inventory-items-list", "inventory-items-stats", "inventory-lotes-list", "inventory-fornecedores-list", "inventory-alertas-list"]:
            self.assertEqual(self.client.get(reverse(route), {"view": "operational"}).status_code, 403)
