from datetime import date
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APITestCase
from apps.organizations.models import Organization
from apps.inventory.models import ItemEstoque, LoteEstoque, MovimentacaoEstoque


class StockLedgerTests(APITestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Ledger", slug="stock-ledger")
        self.user = get_user_model().objects.create_user(email="ledger@example.com", password="test-pass", role="admin", organization=self.org)
        self.client.force_authenticate(self.user)
        self.item = ItemEstoque.objects.create(organization=self.org, nome="Ração", categoria="racao", unidade_medida="kg")
        self.lot = LoteEstoque.objects.create(item=self.item, numero_lote="L1", quantidade_inicial=10, quantidade_atual=10, data_entrada=date.today())
        self.detail = reverse("inventory-lotes-detail", args=[self.lot.pk])
        self.count_url = reverse("inventory-lotes-adjust-stock", args=[self.lot.pk])

    def count(self, target="7.00", expected="10.00", reason="Conferência física"):
        return self.client.post(self.count_url, {"quantidade_contada": target, "saldo_esperado": expected, "motivo": reason}, format="json")

    def test_direct_balance_and_initial_quantity_edits_are_rejected(self):
        for field in ["quantidade_atual", "quantidade_inicial"]:
            self.assertEqual(self.client.patch(self.detail, {field: "99"}, format="json").status_code, 400)
        self.lot.refresh_from_db()
        self.assertEqual(self.lot.quantidade_atual, Decimal("10"))
        self.assertFalse(MovimentacaoEstoque.objects.exists())

    def test_new_lot_initial_balance_has_entry(self):
        response = self.client.post(reverse("inventory-lotes-list"), {"item": str(self.item.pk), "numero_lote": "L2", "quantidade_inicial": "5.00", "data_entrada": date.today().isoformat()}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        movement = MovimentacaoEstoque.objects.get(lote_id=response.data["id"])
        self.assertEqual((movement.tipo, movement.quantidade, movement.responsavel), ("entrada", Decimal("5"), self.user))

    def test_counts_record_signed_differences_and_can_zero_balance(self):
        for target, expected, difference in [("12", "10", "2"), ("7", "12", "-5"), ("0", "7", "-7")]:
            response = self.count(target, expected)
            self.assertEqual(response.status_code, 201, response.data)
            movement = MovimentacaoEstoque.objects.get(pk=response.data["id"])
            self.assertEqual(movement.quantidade, Decimal(difference))
            self.assertEqual(movement.responsavel, self.user)
            self.assertIn("Conferência física", movement.observacao)
            self.lot.refresh_from_db()
            self.assertEqual(self.lot.quantidade_atual, Decimal(target))

    def test_stale_count_and_duplicate_submission_do_not_change_balance(self):
        self.assertEqual(self.count(expected="9").status_code, 409)
        self.assertEqual(self.count().status_code, 201)
        self.assertEqual(self.count().status_code, 409)
        self.assertEqual(MovimentacaoEstoque.objects.count(), 1)

    def test_count_requires_reason_positive_count_and_actual_difference(self):
        for target, reason in [("-1", "Erro"), ("10", "Conferência"), ("7", " ")]:
            self.assertEqual(self.count(target=target, reason=reason).status_code, 400)
        self.assertFalse(MovimentacaoEstoque.objects.exists())

    def test_adjustment_history_is_immutable_including_bulk_delete(self):
        response = self.count()
        movement_id = response.data["id"]
        url = reverse("inventory-movimentacoes-detail", args=[movement_id])
        self.assertEqual(self.client.patch(url, {"observacao": "Apagar motivo"}, format="json").status_code, 400)
        self.assertEqual(self.client.delete(url).status_code, 400)
        self.assertEqual(self.client.post(reverse("inventory-movimentacoes-bulk-delete"), {"ids": [movement_id]}, format="json").status_code, 400)
        self.assertTrue(MovimentacaoEstoque.objects.filter(pk=movement_id).exists())

    def test_generic_adjustment_cannot_bypass_count(self):
        response = self.client.post(reverse("inventory-movimentacoes-list"), {"item": str(self.item.pk), "lote": str(self.lot.pk), "tipo": "ajuste", "quantidade": "3"}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_lot_cannot_be_hidden_or_deleted_with_balance(self):
        self.assertEqual(self.client.patch(self.detail, {"ativo": False}, format="json").status_code, 400)
        self.assertEqual(self.client.delete(self.detail).status_code, 400)
        self.assertEqual(self.client.patch(self.detail, {"observacao": "Local conferido"}, format="json").status_code, 200)

    def test_foreign_tenant_cannot_count_lot(self):
        other = Organization.objects.create(name="Other", slug="ledger-other")
        other_user = get_user_model().objects.create_user(email="other-ledger@example.com", password="test-pass", role="admin", organization=other)
        self.client.force_authenticate(other_user)
        self.assertEqual(self.count().status_code, 404)

    def test_ordinary_entry_correction_and_deletion_preserve_balance(self):
        response = self.client.post(reverse("inventory-movimentacoes-list"), {"item": str(self.item.pk), "lote": str(self.lot.pk), "tipo": "entrada", "quantidade": "2"}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        url = reverse("inventory-movimentacoes-detail", args=[response.data["id"]])
        self.assertEqual(self.client.patch(url, {"quantidade": "3"}, format="json").status_code, 200)
        self.lot.refresh_from_db()
        self.assertEqual(self.lot.quantidade_atual, Decimal("13"))
        self.assertEqual(self.client.delete(url).status_code, 204)
        self.lot.refresh_from_db()
        self.assertEqual(self.lot.quantidade_atual, Decimal("10"))

    def test_operator_cannot_adjust_inventory(self):
        operator = get_user_model().objects.create_user(email="operator-ledger@example.com", password="test-pass", role="operator", organization=self.org)
        self.client.force_authenticate(operator)
        self.assertEqual(self.count().status_code, 403)
