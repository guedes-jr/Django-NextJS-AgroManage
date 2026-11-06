import uuid
from datetime import date
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.farms.models import Farm
from apps.finance.models import BankAccount, FinancialCategory, Transaction, PaymentEvent
from apps.inventory.models import ItemEstoque, LoteEstoque, MovimentacaoEstoque
from apps.inventory.services import registrar_movimentacao
from apps.organizations.models import Organization


class FinancialPostingTests(APITestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Finance Posting", slug="posting-tests")
        self.other = Organization.objects.create(name="Other", slug="posting-other")
        self.user = get_user_model().objects.create_user(email="posting@example.com", password="test", role="admin", organization=self.org)
        self.client.force_authenticate(self.user)
        self.farm = Farm.objects.create(organization=self.org, name="Fazenda B")
        self.revenue = FinancialCategory.objects.create(organization=self.org, name="Vendas", category_type="revenue")
        self.expense = FinancialCategory.objects.create(organization=self.org, name="Compras", category_type="expense")
        self.account = BankAccount.objects.create(organization=self.org, name="Caixa", initial_balance=1000)
        self.other_account = BankAccount.objects.create(organization=self.other, name="Caixa outro")
        self.document = self.make_document()

    def make_document(self, **changes):
        values = dict(organization=self.org, category=self.revenue, amount=Decimal("400"), due_date=timezone.localdate(), description="Venda", farm=self.farm)
        return Transaction.objects.create(**dict(values, **changes))

    def balance(self, account=None):
        account = account or self.account
        account.refresh_from_db()
        return account.current_balance

    def pay(self, document=None, **changes):
        return self.client.post(reverse("transaction-settle", args=[(document or self.document).pk]), {**dict(bank_account=str(self.account.pk), payment_date=timezone.localdate().isoformat(), payment_method="pix", idempotency_key=str(uuid.uuid4())), **changes}, format="json")

    def test_initial_plus_paid_income_less_paid_expense_pending_has_no_effect(self):
        self.assertEqual(self.balance(), Decimal("1000"))
        self.assertEqual(self.pay().status_code, 200)
        expense = self.make_document(category=self.expense, amount=100)
        self.assertEqual(self.pay(expense).status_code, 200)
        self.make_document(category=self.expense, amount=999, bank_account=self.account)
        self.assertEqual(self.balance(), Decimal("1300"))
        response = self.client.get(reverse("transaction-stats"))
        self.assertEqual(response.data["summary"]["balance"], 1300)
        self.assertEqual(response.data["summary"]["total_revenue"], 400)
        self.assertEqual(response.data["summary"]["total_expense"], 100)

    def test_repeated_payment_and_reversal_do_not_duplicate_effect(self):
        key = str(uuid.uuid4())
        paid = self.pay(idempotency_key=key)
        self.assertEqual(paid.status_code, 200, paid.data)
        self.assertEqual(self.pay(idempotency_key=key).data["id"], paid.data["id"])
        reversal = dict(payment=paid.data["id"], reason="Pagamento devolvido", idempotency_key=str(uuid.uuid4()))
        url = reverse("transaction-reverse", args=[self.document.pk])
        first = self.client.post(url, reversal, format="json")
        self.assertEqual(first.status_code, 200, first.data)
        self.assertEqual(self.client.post(url, reversal, format="json").data["id"], first.data["id"])
        self.assertEqual(self.balance(), Decimal("1000"))
        self.assertEqual(PaymentEvent.objects.count(), 2)
        self.assertEqual(self.pay(idempotency_key=key).data["id"], paid.data["id"])
        self.assertEqual(self.balance(), Decimal("1000"))
        self.assertEqual(self.pay().status_code, 200)
        self.assertEqual(self.balance(), Decimal("1400"))

    def test_legacy_paid_entry_can_be_reversed_preserving_original_details(self):
        document = self.make_document(status="paid", bank_account=self.account)
        self.assertEqual(self.balance(), Decimal("1400"))
        response = self.client.post(reverse("transaction-reverse", args=[document.pk]), {"reason": "Devolvido", "idempotency_key": str(uuid.uuid4())}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(document.payment_events.count(), 2)
        self.assertEqual(self.balance(), Decimal("1000"))

    def test_payment_requires_own_active_account_and_actual_date(self):
        self.assertEqual(self.pay(bank_account=str(self.other_account.pk)).status_code, 400)
        self.assertEqual(self.pay(payment_date="2099-01-01").status_code, 400)
        self.account.is_active = False
        self.account.save()
        self.assertEqual(self.pay().status_code, 400)
        self.assertFalse(PaymentEvent.objects.exists())

    def test_paid_fields_cannot_be_silently_overwritten_or_deleted(self):
        self.pay()
        url = reverse("transaction-detail", args=[self.document.pk])
        for changes in [{"amount": "500"}, {"status": "pending"}, {"bank_account": None}]:
            self.assertEqual(self.client.patch(url, changes, format="json").status_code, 400)
        self.assertEqual(self.client.delete(url).status_code, 400)
        self.assertEqual(self.client.patch(url, {"notes": "Nota adicional"}, format="json").status_code, 200)
        self.assertEqual(self.balance(), Decimal("1400"))

    def test_failed_payment_rolls_back_history_and_balance(self):
        with patch.object(Transaction, "save", side_effect=RuntimeError("failure")):
            with self.assertRaises(RuntimeError):
                from apps.finance.services import settle_transaction
                settle_transaction(self.document, self.user, bank_account=self.account, payment_date=timezone.localdate(), payment_method="pix", idempotency_key=uuid.uuid4())
        self.assertFalse(PaymentEvent.objects.exists())
        self.assertEqual(self.balance(), Decimal("1000"))

    def test_financial_category_and_initial_balance_are_protected_after_use(self):
        self.pay()
        self.assertEqual(self.client.patch(reverse("bank-account-detail", args=[self.account.pk]), {"initial_balance": "9000"}, format="json").status_code, 400)
        self.assertEqual(self.client.delete(reverse("bank-account-detail", args=[self.account.pk])).status_code, 400)
        self.assertEqual(self.client.patch(reverse("financial-category-detail", args=[self.revenue.pk]), {"category_type": "expense"}, format="json").status_code, 400)

    def test_accounts_follow_legacy_paid_edits_transfers_and_deletes(self):
        second = BankAccount.objects.create(organization=self.org, name="Banco", initial_balance=50)
        document = self.make_document(status="paid", bank_account=self.account)
        document.amount = Decimal(300)
        document.bank_account = second
        document.save()
        self.assertEqual(self.balance(), Decimal(1000))
        self.assertEqual(self.balance(second), Decimal(350))
        document.delete()
        self.assertEqual(self.balance(second), Decimal(50))

    def series(self, kind="installment", **changes):
        values = {"series_id": str(uuid.uuid4()), "kind": kind, "count": 3, "transaction": {"description": "Contrato", "category": str(self.expense.pk), "amount": "100.00", "due_date": "2026-01-31", "status": "pending"}}
        values.update(changes)
        return self.client.post(reverse("transaction-series"), values, format="json"), values

    def test_installments_keep_total_and_clamp_month_end_and_retry(self):
        response, values = self.series()
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual([row["due_date"] for row in response.data], ["2026-01-31", "2026-02-28", "2026-03-31"])
        self.assertEqual(sum(Decimal(row["amount"]) for row in response.data), Decimal("100"))
        self.assertEqual(len(self.client.post(reverse("transaction-series"), values, format="json").data), 3)
        self.assertEqual(Transaction.objects.filter(series_id=values["series_id"]).count(), 3)
        self.assertEqual(self.balance(), Decimal("1000"))

    def test_recurrence_repeats_full_amount_instead_of_dividing(self):
        response, _ = self.series("recurrence")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual([Decimal(row["amount"]) for row in response.data], [Decimal("100")] * 3)

    def test_filters_export_and_lookups_preserve_tenant_context(self):
        other_farm = Farm.objects.create(organization=self.other, name="Segredo")
        other_category = FinancialCategory.objects.create(organization=self.other, name="Segredo", category_type="revenue")
        self.make_document(organization=self.other, category=other_category, farm=other_farm, description="Oculto")
        response = self.client.get(reverse("transaction-list"), {"farm": str(self.farm.pk), "search": "Venda"})
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(self.client.get(reverse("transaction-list"), {"due_date__gte": "invalido"}).status_code, 400)
        export = self.client.get(reverse("transaction-export"), {"farm": str(self.farm.pk)})
        self.assertEqual(export.status_code, 200)
        self.assertNotIn("Oculto", export.content.decode())
        lookup = self.client.get(reverse("transaction-lookups"))
        self.assertEqual([row["name"] for row in lookup.data["farms"]], ["Fazenda B"])

    def test_foreign_document_and_operators_cannot_settle(self):
        foreign_category = FinancialCategory.objects.create(organization=self.other, name="Receita", category_type="revenue")
        foreign = self.make_document(organization=self.other, category=foreign_category, farm=None)
        self.assertEqual(self.pay(foreign).status_code, 404)
        operator = get_user_model().objects.create_user(email="op-posting@example.com", password="test", role="operator", organization=self.org)
        self.client.force_authenticate(operator)
        self.assertEqual(self.pay().status_code, 403)

    def test_stock_purchase_pending_or_explicit_paid_keeps_property_and_no_duplicate_expense(self):
        item = ItemEstoque.objects.create(organization=self.org, nome="Sal", categoria="suplemento", unidade_medida="kg")
        payload = {"item": str(item.pk), "tipo": "compra", "quantidade": "20", "numero_lote": "L1", "custo_unitario": "2", "farm": str(self.farm.pk), "purchase_due_date": "2026-12-01"}
        first = self.client.post(reverse("inventory-movimentacoes-list"), payload, format="json")
        self.assertEqual(first.status_code, 201, first.data)
        payable = Transaction.objects.get(reference=f"STOCK-MOV-{first.data['id']}")
        self.assertEqual((payable.status, payable.amount, payable.farm), ("pending", Decimal("40"), self.farm))
        self.assertEqual(self.balance(), Decimal("1000"))
        payload.update(purchase_payment_status="paid", purchase_bank_account=str(self.account.pk), purchase_payment_date=timezone.localdate().isoformat())
        second = self.client.post(reverse("inventory-movimentacoes-list"), payload, format="json")
        self.assertEqual(second.status_code, 201, second.data)
        self.assertEqual(Transaction.objects.filter(category__name="Compra de Insumos").count(), 2)
        self.assertEqual(self.balance(), Decimal("960"))
        self.assertEqual(item.lotes.get().quantidade_atual, Decimal("40"))

    def test_stock_service_never_chooses_an_arbitrary_farm(self):
        item = ItemEstoque.objects.create(organization=self.org, nome="Ração", categoria="racao", unidade_medida="kg")
        lot = LoteEstoque.objects.create(item=item, numero_lote="L1", quantidade_inicial=10, quantidade_atual=10, data_entrada=date.today())
        registrar_movimentacao(item, lot, tipo="consumo", quantidade=Decimal(2), responsavel=self.user, farm=self.farm)
        self.assertEqual(MovimentacaoEstoque.objects.get().farm, self.farm)
        registrar_movimentacao(item, lot, tipo="consumo", quantidade=Decimal(1), responsavel=self.user)
        self.assertIsNone(MovimentacaoEstoque.objects.latest("created_at").farm)
        foreign_farm = Farm.objects.create(organization=self.other, name="Outra")
        from rest_framework.exceptions import ValidationError
        with self.assertRaises(ValidationError):
            registrar_movimentacao(item, lot, tipo="consumo", quantidade=Decimal(1), responsavel=self.user, farm=foreign_farm)

    def test_posting_a_paid_title_records_history_for_existing_clients(self):
        response = self.client.post(reverse("transaction-list"), {"description": "Recebimento", "category": str(self.revenue.pk), "amount": "20", "due_date": timezone.localdate().isoformat(), "status": "paid", "bank_account": str(self.account.pk)}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(len(response.data["payment_events"]), 1)
        self.assertEqual(self.balance(), Decimal("1020"))

    def test_series_reusing_key_with_different_terms_is_rejected(self):
        response, values = self.series()
        self.assertEqual(response.status_code, 201)
        values["transaction"]["amount"] = "200.00"
        self.assertEqual(self.client.post(reverse("transaction-series"), values, format="json").status_code, 400)
        self.assertEqual(Transaction.objects.filter(series_id=values["series_id"]).count(), 3)

    def test_reconcile_migration_only_refreshes_balances(self):
        import importlib
        from types import SimpleNamespace
        from django.apps import apps
        from django.db import connection
        document = self.make_document(status="paid", bank_account=self.account)
        BankAccount.objects.filter(pk=self.account.pk).update(current_balance=0)
        importlib.import_module("apps.finance.migrations.0007_reconcile_account_balances").reconcile(apps, SimpleNamespace(connection=connection))
        self.assertEqual(self.balance(), Decimal("1400"))
        document.refresh_from_db()
        self.assertEqual(document.status, "paid")
        self.document.refresh_from_db()
        self.assertEqual(self.document.status, "pending")

    def test_csv_escapes_spreadsheet_formulas(self):
        self.make_document(description="=WEBSERVICE(\"example\")")
        response = self.client.get(reverse("transaction-export"))
        self.assertIn("'=WEBSERVICE", response.content.decode())

    def test_cash_flow_keeps_payment_and_reversal_on_their_actual_dates(self):
        from datetime import timedelta
        paid_date = timezone.localdate() - timedelta(days=2)
        paid = self.pay(payment_date=paid_date.isoformat())
        self.assertEqual(paid.status_code, 200)
        response = self.client.post(reverse("transaction-reverse", args=[self.document.pk]), {"payment": paid.data["id"], "reason": "Devolvido", "idempotency_key": str(uuid.uuid4())}, format="json")
        self.assertEqual(response.status_code, 200)
        rows = {row["date"]: row for row in self.client.get(reverse("transaction-stats")).data["cash_flow"]}
        self.assertEqual(rows[paid_date.isoformat()]["revenue"], 400)
        self.assertEqual(rows[timezone.localdate().isoformat()]["revenue"], -400)

    def test_legacy_lot_purchase_cannot_be_removed_independently_of_payable(self):
        item = ItemEstoque.objects.create(organization=self.org, nome="Insumo", categoria="suplemento", unidade_medida="kg")
        lot = LoteEstoque.objects.create(item=item, numero_lote="H1", quantidade_inicial=10, quantidade_atual=10, custo_unitario=2, data_entrada=date.today())
        movement = MovimentacaoEstoque.objects.create(item=item, lote=lot, tipo="compra", quantidade=10)
        url = reverse("inventory-movimentacoes-detail", args=[movement.pk])
        self.assertEqual(self.client.delete(url).status_code, 400)
        self.assertEqual(self.client.patch(url, {"quantidade": "8"}, format="json").status_code, 400)
        lot.refresh_from_db()
        self.assertEqual(lot.quantidade_atual, Decimal("10"))
        self.assertTrue(Transaction.objects.filter(reference=f"LOTE-{lot.pk}").exists())

    def test_projection_only_uses_open_titles_and_does_not_change_balance(self):
        from datetime import timedelta
        from django.utils import timezone
        tomorrow = timezone.localdate() + timedelta(days=1)
        self.make_document(category=self.expense, amount=1500, due_date=tomorrow)
        self.make_document(category=self.revenue, amount=9999, status="cancelled")
        response = self.client.get(reverse("transaction-projection"), {"days": 3})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["opening_balance"], Decimal("1000"))
        self.assertEqual(response.data["closing_balance"], Decimal("-100"))
        self.assertEqual(response.data["first_negative_date"], tomorrow)
        self.assertEqual(self.balance(), Decimal("1000"))

    def test_projection_rejects_foreign_account_and_can_exclude_overdue(self):
        from datetime import timedelta
        from django.utils import timezone
        self.make_document(category=self.expense, amount=100, due_date=timezone.localdate() - timedelta(days=1))
        response = self.client.get(reverse("transaction-projection"), {"days": 1, "include_overdue": "false"})
        self.assertEqual(response.data["closing_balance"], Decimal("1400"))
        self.assertEqual(self.client.get(reverse("transaction-projection"), {"bank_account": str(self.other_account.pk)}).status_code, 400)
        self.assertEqual(self.client.get(reverse("transaction-projection"), {"days": 1000}).status_code, 400)

    def test_csv_localizes_headings_without_changing_values_or_tenant_scope(self):
        import csv
        import io

        foreign_category = FinancialCategory.objects.create(organization=self.other, name="Receita", category_type="revenue")
        self.make_document(organization=self.other, category=foreign_category, farm=None, description="Oculto")
        for language, heading in [("en", "Description"), ("es", "Descripción"), ("pt-PT", "Descrição")]:
            with self.subTest(language=language):
                response = self.client.get(reverse("transaction-export"), HTTP_ACCEPT_LANGUAGE=language)
                self.assertEqual(response.status_code, 200)
                rows = list(csv.reader(io.StringIO(response.content.decode("utf-8-sig")), delimiter=";"))
                self.assertEqual(rows[0][0], heading)
                self.assertEqual(len(rows), 2)
                self.assertEqual(rows[1][0], "Venda")
                self.assertEqual(rows[1][-2], "pending")
                self.assertEqual(rows[1][-1], "400,00")
                self.assertNotIn("Oculto", response.content.decode())
