from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.organizations.models import Organization
from apps.farms.models import Farm
from apps.inventory.models import ItemEstoque, LoteEstoque, MovimentacaoEstoque, Fornecedor
from apps.finance.models import Transaction, PaymentEvent


class StockLaunchTests(APITestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Lançamentos", slug="stock-launches")
        self.other = Organization.objects.create(name="Outra", slug="other-stock-launches")
        self.user = get_user_model().objects.create_user(email="launch@example.invalid", password="test", role="manager", organization=self.org)
        self.farm = Farm.objects.create(organization=self.org, name="Fazenda A")
        self.item = ItemEstoque.objects.create(organization=self.org, nome="Produto", categoria="racao", unidade_medida="kg")
        self.supplier = Fornecedor.objects.create(organization=self.org, nome="Cooperativa")
        self.today = timezone.localdate()
        self.lot = LoteEstoque(item=self.item, numero_lote="EXISTENTE", quantidade_inicial="10", quantidade_atual="10", custo_unitario="2", data_entrada=self.today)
        self.lot._skip_finance_transaction = True
        self.lot.save()
        self.client.force_authenticate(self.user)
        self.preview_url = "/api/v1/inventory/movimentacoes/preview/"
        self.confirm_url = "/api/v1/inventory/movimentacoes/confirm/"

    def values(self, **changes):
        return dict(dict(item=str(self.item.pk), tipo="entrada", quantidade="3.25", unidade_esperada="kg", numero_lote="NOVO", data_entrada=str(self.today), motivo="Conferência de recebimento"), **changes)

    def preview(self, values):
        response = self.client.post(self.preview_url, values, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        return response.data

    def confirm(self, preview):
        return self.client.post(self.confirm_url, {"preview_token": preview["preview_token"]}, format="json")

    def test_preview_is_read_only_and_receipt_without_purchase_has_unknown_cost_no_payable(self):
        preview = self.preview(self.values())
        self.assertEqual(preview["saldo_anterior"], "0")
        self.assertEqual(preview["saldo_posterior"], "3.25")
        self.assertIsNone(preview["total_pendente"])
        self.assertEqual(MovimentacaoEstoque.objects.count(), 0)
        self.assertEqual(LoteEstoque.objects.count(), 1)
        result = self.confirm(preview)
        self.assertEqual(result.status_code, 201, result.data)
        self.assertEqual(set(result.data), {"id", "lote", "payable"})
        lot = LoteEstoque.objects.get(pk=result.data["lote"])
        self.assertEqual(lot.quantidade_atual, Decimal("3.25"))
        self.assertIsNone(lot.custo_unitario)
        self.assertEqual(MovimentacaoEstoque.objects.count(), 1)
        self.assertFalse(Transaction.objects.exists())
        self.assertNotEqual(self.confirm(preview).status_code, 201)
        self.assertEqual(MovimentacaoEstoque.objects.count(), 1)

    def test_existing_lot_entry_and_exit_preserve_metadata_and_do_not_clamp_insufficient_stock(self):
        values = self.values(lote=str(self.lot.pk))
        values.pop("numero_lote")
        values.pop("data_entrada")
        receipt = self.confirm(self.preview(values))
        self.assertEqual(receipt.status_code, 201, receipt.data)
        self.lot.refresh_from_db()
        self.assertEqual(self.lot.quantidade_atual, Decimal("13.25"))
        self.assertEqual(self.lot.custo_unitario, Decimal("2"))
        values.update(tipo="saida", destino="Depósito da operação", quantidade="13.25")
        out = self.confirm(self.preview(values))
        self.assertEqual(out.status_code, 201, out.data)
        self.lot.refresh_from_db()
        self.assertEqual(self.lot.quantidade_atual, Decimal("0"))
        self.assertEqual(self.client.post(self.preview_url, values, format="json").status_code, 400)
        self.assertEqual(MovimentacaoEstoque.objects.count(), 2)
        self.assertFalse(Transaction.objects.exists())

    def test_purchase_creates_one_pending_payable_and_no_payment_or_duplicate_lot_signal(self):
        preview = self.preview(self.values(tipo="compra", custo_unitario="2.55", quantidade="3.25", farm=str(self.farm.pk), fornecedor=str(self.supplier.pk), purchase_due_date=str(self.today + timedelta(days=30))))
        self.assertEqual(preview["total_pendente"], "8.29")
        self.assertFalse(Transaction.objects.exists())
        response = self.confirm(preview)
        self.assertEqual(response.status_code, 201, response.data)
        payable = Transaction.objects.get(pk=response.data["payable"])
        self.assertEqual(Transaction.objects.count(), 1)
        self.assertEqual(payable.amount, Decimal("8.29"))
        self.assertEqual(payable.status, "pending")
        self.assertEqual(payable.farm, self.farm)
        self.assertEqual(payable.reference, f"STOCK-MOV-{response.data['id']}")
        self.assertIsNone(payable.payment_date)
        self.assertIsNone(payable.bank_account)
        self.assertFalse(PaymentEvent.objects.exists())
        self.assertNotEqual(self.confirm(preview).status_code, 201)
        self.assertEqual(Transaction.objects.count(), 1)

    def test_stale_balance_unit_or_lot_metadata_cannot_be_confirmed(self):
        values = self.values(lote=str(self.lot.pk))
        values.pop("numero_lote")
        values.pop("data_entrada")
        snapshot = self.preview(values)
        self.lot.quantidade_atual = Decimal("9")
        self.lot.save()
        self.assertEqual(self.confirm(snapshot).status_code, 409)
        snapshot = self.preview(values)
        self.item.unidade_medida = "unidade"
        self.item.save()
        self.assertEqual(self.confirm(snapshot).status_code, 409)
        self.assertFalse(MovimentacaoEstoque.objects.exists())

    def test_tokens_are_actor_tenant_bound_expiring_and_cannot_change_reviewed_intent(self):
        snapshot = self.preview(self.values())
        tampered = snapshot["preview_token"] + "x"
        self.assertEqual(self.client.post(self.confirm_url, {"preview_token": tampered}, format="json").status_code, 409)
        self.assertEqual(self.client.post(self.confirm_url, {"preview_token": snapshot["preview_token"], "quantidade": "99"}, format="json").status_code, 400)
        with patch("django.core.signing.time.time", return_value=timezone.now().timestamp() + 1000):
            self.assertEqual(self.confirm(snapshot).status_code, 409)
        other = get_user_model().objects.create_user(email="other-launch@example.invalid", password="test", role="manager", organization=self.other)
        self.client.force_authenticate(other)
        self.assertEqual(self.confirm(snapshot).status_code, 403)
        self.assertFalse(MovimentacaoEstoque.objects.exists())

    def test_stock_and_purchase_rollback_on_finance_failure(self):
        snapshot = self.preview(self.values(tipo="compra", custo_unitario="2", farm=str(self.farm.pk), purchase_due_date=str(self.today)))
        from apps.finance.services import record_stock_purchase
        def failing(*args, **kwargs):
            record_stock_purchase(*args, **kwargs)
            raise RuntimeError("synthetic finance failure")
        with patch("apps.finance.services.record_stock_purchase", side_effect=failing):
            self.assertEqual(self.confirm(snapshot).status_code, 500)
        self.assertFalse(MovimentacaoEstoque.objects.exists())
        self.assertEqual(LoteEstoque.objects.count(), 1)
        self.assertFalse(Transaction.objects.exists())

    def test_invalid_context_expiry_duplicate_number_and_precision_fail_without_mutation(self):
        foreign_item = ItemEstoque.objects.create(organization=self.other, nome="Outro", categoria="racao", unidade_medida="kg")
        foreign_farm = Farm.objects.create(organization=self.other, name="Outra fazenda")
        foreign_supplier = Fornecedor.objects.create(organization=self.other, nome="Outro fornecedor")
        for change in [dict(farm=str(foreign_farm.pk)), dict(fornecedor=str(foreign_supplier.pk)), dict(item=str(foreign_item.pk)), dict(numero_lote="EXISTENTE"), dict(data_entrada=str(self.today + timedelta(days=1))), dict(data_validade=str(self.today - timedelta(days=1))), dict(quantidade="0"), dict(quantidade="1.001"), dict(tipo="compra"), dict(tipo="saida"), dict(purchase_payment_status="paid"), dict(custo_unitario="2"), dict(tipo="compra", quantidade="0.01", custo_unitario="0.01", farm=str(self.farm.pk), purchase_due_date=str(self.today)), dict(tipo="compra", quantidade="99999980", custo_unitario="99999999.99", farm=str(self.farm.pk), purchase_due_date=str(self.today))]:
            response = self.client.post(self.preview_url, self.values(**change), format="json")
            self.assertEqual(response.status_code, 400, response.data)
        self.assertFalse(MovimentacaoEstoque.objects.exists())
        self.assertFalse(Transaction.objects.exists())

    def test_operator_and_feeder_cannot_preview_or_confirm(self):
        snapshot = self.preview(self.values())
        for role in ["operator", "feeder"]:
            self.user.role = role
            self.user.save(update_fields=["role"])
            self.assertEqual(self.client.post(self.preview_url, self.values(), format="json").status_code, 403)
            self.assertEqual(self.confirm(snapshot).status_code, 403)

    def test_mandatory_password_change_invalidates_an_already_reviewed_launch(self):
        snapshot = self.preview(self.values())
        self.user.force_password_change = True
        self.user.save(update_fields=["force_password_change"])
        self.assertEqual(self.confirm(snapshot).status_code, 403)
        self.assertEqual(self.client.post(self.preview_url, self.values(), format="json").status_code, 403)
        self.assertFalse(MovimentacaoEstoque.objects.exists())
