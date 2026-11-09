from datetime import date
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils.dateparse import parse_datetime
from rest_framework.test import APITestCase

from apps.organizations.models import Organization
from apps.inventory.models import ItemEstoque, LoteEstoque, MovimentacaoEstoque, Fornecedor, FornecedorContato, FornecedorEndereco


class MobileInventoryWritesTests(APITestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Mobile cadastros", slug="mobile-stock-write")
        self.other = Organization.objects.create(name="Outra", slug="other-stock-write")
        self.user = get_user_model().objects.create_user(email="stock-write@example.invalid", password="test", role="manager", organization=self.org)
        self.client.force_authenticate(self.user)

    def create_product(self):
        response = self.client.post(reverse("inventory-items-list"), dict(nome="Semente 0009", categoria="semente", categorias=["semente"], unidade_medida="kg", estoque_minimo="10.25", fabricante="Teste", descricao="", especie_animal="", prioridade="alta"), format="json")
        self.assertEqual(response.status_code, 201, response.data)
        return ItemEstoque.objects.get(pk=response.data["id"])

    def create_supplier(self):
        response = self.client.post(reverse("inventory-fornecedores-list"), dict(nome="Cooperativa", cnpj="", tipo_contrato="mensal", contatos=[dict(tipo="telefone", label="Vendas", valor="12345")], enderecos=[dict(label="Matriz", logradouro="Estrada", numero="9", latitude="-3.1234567890", longitude="-38.1234567890")]), format="json")
        self.assertEqual(response.status_code, 201, response.data)
        return Fornecedor.objects.get(pk=response.data["id"])

    def test_product_create_is_not_stock_receipt_and_edit_preserves_ledger_and_technical_fields(self):
        item = self.create_product()
        self.assertEqual(LoteEstoque.objects.filter(item=item).count(), 0)
        self.assertEqual(MovimentacaoEstoque.objects.filter(item=item).count(), 0)
        self.assertEqual(item.estoque_minimo, Decimal("10.25"))
        lot = LoteEstoque.objects.create(item=item, numero_lote="A", quantidade_inicial="7.25", quantidade_atual="7.25", data_entrada=date.today())
        item.principio_ativo = "Preservado"
        item.carencia_dias = 12
        item.save()
        url = reverse("inventory-items-detail", args=[item.pk])
        snapshot = self.client.get(url, {"view": "operational"}).data
        self.assertIn("updated_at", snapshot)
        edited = self.client.patch(url, dict(nome="Renomeado", descricao="Novo", fabricante="Marca", especie_animal="", prioridade="media", estoque_minimo="5.50", expected_updated_at=snapshot["updated_at"]), format="json")
        self.assertEqual(edited.status_code, 200, edited.data)
        item.refresh_from_db()
        lot.refresh_from_db()
        self.assertEqual(item.principio_ativo, "Preservado")
        self.assertEqual(item.carencia_dias, 12)
        self.assertEqual(item.unidade_medida, "kg")
        self.assertEqual(item.categorias, ["semente"])
        self.assertEqual(lot.quantidade_atual, Decimal("7.25"))
        self.assertEqual(MovimentacaoEstoque.objects.filter(item=item).count(), 0)
        stale = self.client.patch(url, {"nome": "Antigo", "expected_updated_at": snapshot["updated_at"]}, format="json")
        self.assertEqual(stale.status_code, 400)
        item.refresh_from_db()
        self.assertEqual(item.nome, "Renomeado")
        # Legacy callers do not need to send a version.
        self.assertEqual(self.client.patch(url, {"nome": "Legado"}, format="json").status_code, 200)

    def test_supplier_scalar_patch_preserves_nested_ids_labels_and_precise_coordinates(self):
        supplier = self.create_supplier()
        contact = supplier.contatos.get()
        address = supplier.enderecos.get()
        url = reverse("inventory-fornecedores-detail", args=[supplier.pk])
        snapshot = self.client.get(url).data
        response = self.client.patch(url, dict(nome="Cooperativa nova", cnpj="", tipo_contrato="anual", expected_updated_at=snapshot["updated_at"]), format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(supplier.contatos.get().pk, contact.pk)
        self.assertEqual(supplier.enderecos.get().pk, address.pk)
        self.assertEqual(response.data["enderecos"][0]["label"], "Matriz")
        self.assertEqual(response.data["enderecos"][0]["latitude"], "-3.1234567890")
        stale = self.client.patch(url, {"contatos": [], "enderecos": [], "expected_updated_at": snapshot["updated_at"]}, format="json")
        self.assertEqual(stale.status_code, 400)
        self.assertEqual(supplier.contatos.count(), 1)
        self.assertEqual(supplier.enderecos.count(), 1)

    def test_supplier_nested_update_is_atomic_and_can_remove_rows_explicitly(self):
        supplier = self.create_supplier()
        url = reverse("inventory-fornecedores-detail", args=[supplier.pk])
        snapshot = self.client.get(url).data
        # Emulate a storage failure after deletion and the scalar update.
        with patch.object(FornecedorContato.objects, "create", side_effect=RuntimeError("synthetic storage failure")):
            failed = self.client.patch(url, dict(nome="Parcial", contatos=[dict(tipo="telefone", valor="999")], expected_updated_at=snapshot["updated_at"]), format="json")
            self.assertEqual(failed.status_code, 500)
        supplier.refresh_from_db()
        self.assertEqual(supplier.nome, "Cooperativa")
        self.assertEqual(supplier.contatos.get().valor, "12345")
        self.assertEqual(supplier.updated_at, parse_datetime(snapshot["updated_at"]))
        cleared = self.client.patch(url, dict(contatos=[], enderecos=[], expected_updated_at=snapshot["updated_at"]), format="json")
        self.assertEqual(cleared.status_code, 200, cleared.data)
        self.assertEqual(supplier.contatos.count(), 0)
        self.assertEqual(supplier.enderecos.count(), 0)

    def test_supplier_creation_rolls_back_when_nested_storage_fails(self):
        with patch.object(FornecedorEndereco.objects, "create", side_effect=RuntimeError("synthetic storage failure")):
            failed = self.client.post(reverse("inventory-fornecedores-list"), dict(nome="Não persistir", contatos=[dict(tipo="telefone", valor="123")], enderecos=[dict(logradouro="Estrada")]), format="json")
            self.assertEqual(failed.status_code, 500)
        self.assertFalse(Fornecedor.objects.filter(organization=self.org).exists())
        self.assertEqual(FornecedorContato.objects.count(), 0)

    def test_supplier_duplicates_and_foreign_tenant_cannot_be_overwritten(self):
        supplier = self.create_supplier()
        duplicate = self.client.post(reverse("inventory-fornecedores-list"), {"nome": supplier.nome}, format="json")
        self.assertEqual(duplicate.status_code, 400)
        foreign = Fornecedor.objects.create(organization=self.other, nome="Outra")
        response = self.client.patch(reverse("inventory-fornecedores-detail", args=[foreign.pk]), {"nome": "Alterado"}, format="json")
        self.assertEqual(response.status_code, 404)
        foreign.refresh_from_db()
        self.assertEqual(foreign.nome, "Outra")

    def test_operator_and_feeder_cannot_create_inventory_registrations(self):
        for role in ["operator", "feeder"]:
            self.user.role = role
            self.user.save(update_fields=["role"])
            for route in ["inventory-items-list", "inventory-fornecedores-list"]:
                self.assertEqual(self.client.post(reverse(route), {"nome": "Negado"}, format="json").status_code, 403)

    def test_opt_in_write_receipt_keeps_input_validation_and_excludes_financial_serialization(self):
        from unittest.mock import PropertyMock
        with patch.object(ItemEstoque, "custo_medio", new_callable=PropertyMock, side_effect=AssertionError("financial field read")):
            created = self.client.post(reverse("inventory-items-list") + "?view=receipt", dict(nome="Recibo", categoria="racao", categorias=["racao"], unidade_medida="kg"), format="json")
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(set(created.data), {"id"})
        url = reverse("inventory-items-detail", args=[created.data["id"]])
        snapshot = self.client.get(url, {"view": "operational"}).data
        saved = self.client.patch(url + "?view=receipt", dict(nome="Recibo novo", expected_updated_at=snapshot["updated_at"]), format="json")
        self.assertEqual(saved.status_code, 200, saved.data)
        self.assertEqual(set(saved.data), {"id"})
        stale = self.client.patch(url + "?view=receipt", dict(nome="Velho", expected_updated_at=snapshot["updated_at"]), format="json")
        self.assertEqual(stale.status_code, 400)
        supplier = self.client.post(reverse("inventory-fornecedores-list") + "?view=receipt", {"nome": "Recibo fornecedor"}, format="json")
        self.assertEqual(supplier.status_code, 201, supplier.data)
        self.assertEqual(set(supplier.data), {"id"})
