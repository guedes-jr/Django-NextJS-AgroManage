"""BUG 01: removing a registration must update every module (dashboard, reproduction, finance)."""
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.farms.models import Farm
from apps.finance.models import BankAccount, Transaction
from apps.finance.services import settle_transaction
from apps.inventory.models import ItemEstoque, LoteEstoque, MovimentacaoEstoque
from apps.livestock.models import Animal, AnimalBatch, HeatRecord, Species
from apps.organizations.models import Organization


class CrossModuleRemovalTests(APITestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Remoção", slug="remocao")
        self.user = get_user_model().objects.create_user(email="remocao@example.invalid", password="Password-8472",
                                                         role="admin", organization=self.org)
        self.client.force_authenticate(self.user)
        self.farm = Farm.objects.create(organization=self.org, name="Granja")
        Species.objects.get_or_create(code="suinos", defaults={"name": "Suínos"})

    # -- 1. Exclusão de matriz ------------------------------------------------
    def _matrix_lot(self, code, quantity=1):
        response = self.client.post("/api/v1/livestock/batches/", {
            "batch_code": code, "quantity": quantity, "category": "Matriz", "phase": "reproducao",
            "species_code_input": "suinos", "farm_id": str(self.farm.pk), "entry_date": date.today().isoformat(),
            "status": "active", "origin": "born",
        }, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        return response.data["id"]

    def test_deleting_matrix_lot_removes_its_animals_from_every_module(self):
        lot_id = self._matrix_lot("M-01", quantity=2)
        self.assertEqual(Animal.objects.filter(batch_id=lot_id, status="active").count(), 2)

        self.assertEqual(self.client.delete(f"/api/v1/livestock/batches/{lot_id}/").status_code, 204)

        self.assertFalse(Animal.objects.filter(identifier__startswith="M-01").exists())
        self.assertFalse(Animal.objects.filter(farm=self.farm, status="active").exists())

    def test_matrix_with_history_is_written_off_and_keeps_the_history(self):
        lot_id = self._matrix_lot("M-02")
        animal = Animal.objects.get(batch_id=lot_id)
        HeatRecord.objects.create(animal=animal, heat_date=date.today())

        self.assertEqual(self.client.delete(f"/api/v1/livestock/batches/{lot_id}/").status_code, 204)

        animal.refresh_from_db()
        self.assertEqual((animal.status, animal.reproductive_status, animal.batch_id), ("finished", "", None))
        self.assertTrue(HeatRecord.objects.filter(animal=animal).exists())

    # -- 2. Cancelamento de compra --------------------------------------------
    def _purchase(self, name, quantity="10", cost="5"):
        item = ItemEstoque.objects.create(organization=self.org, nome=name, categoria="outro", unidade_medida="kg")
        lot = LoteEstoque.objects.create(item=item, numero_lote="L1", data_entrada=date.today(), quantidade_inicial=Decimal(quantity),
                                         quantidade_atual=Decimal(quantity), custo_unitario=Decimal(cost))
        return item, lot, Transaction.objects.get(reference=f"LOTE-{lot.pk}")

    def test_deleting_an_unused_product_cancels_its_purchase(self):
        item, _, purchase = self._purchase("Comprado por engano")
        self.assertEqual(self.client.delete(f"/api/v1/inventory/items/{item.pk}/").status_code, 204)
        purchase.refresh_from_db()
        self.assertEqual(purchase.status, "cancelled")

    def test_paid_purchase_is_reversed_before_cancelling(self):
        item, _, purchase = self._purchase("Pago")
        account = BankAccount.objects.create(organization=self.org, name="Conta")
        settle_transaction(purchase, self.user, bank_account=account, payment_date=timezone.localdate(),
                           payment_method="pix", idempotency_key="00000000-0000-4000-8000-000000000001")
        self.assertEqual(self.client.delete(f"/api/v1/inventory/items/{item.pk}/").status_code, 204)
        purchase.refresh_from_db()
        self.assertEqual(purchase.status, "cancelled")
        self.assertTrue(purchase.payment_events.filter(kind="reversal").exists())

    def test_used_product_keeps_its_purchase(self):
        item, lot, purchase = self._purchase("Usado")
        MovimentacaoEstoque.objects.create(farm=self.farm, item=item, lote=lot, tipo="consumo", quantidade=Decimal("3"))
        self.assertEqual(self.client.delete(f"/api/v1/inventory/items/{item.pk}/").status_code, 204)
        purchase.refresh_from_db()
        self.assertNotEqual(purchase.status, "cancelled")
