"""Cancelar o título de compra de animais no Financeiro desfaz a compra em todos os módulos."""
from datetime import date

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from apps.farms.models import Farm
from apps.finance.models import Transaction
from apps.livestock.models import Animal, AnimalBatch, Species
from apps.organizations.models import Organization


class CancelledAnimalPurchaseTests(APITestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Compra", slug="compra")
        self.user = get_user_model().objects.create_user(email="compra@example.invalid", password="Password-8472",
                                                         role="admin", organization=self.org)
        self.client.force_authenticate(self.user)
        self.farm = Farm.objects.create(organization=self.org, name="Granja")
        Species.objects.get_or_create(code="suinos", defaults={"name": "Suínos"})

    def _buy(self, code="M-10", quantity=1):
        response = self.client.post("/api/v1/livestock/batches/", {
            "batch_code": code, "quantity": quantity, "category": "Matriz", "phase": "reproducao",
            "species_code_input": "suinos", "farm_id": str(self.farm.pk), "entry_date": date.today().isoformat(),
            "status": "active", "origin": "purchased", "purchase_value": "3000",
        }, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        return response.data["id"]

    def _cancel(self, batch_id):
        title = Transaction.objects.get(reference=f"PURCHASE-BATCH-{batch_id}")
        response = self.client.patch(f"/api/v1/finance/transactions/{title.pk}/", {"status": "cancelled"}, format="json")
        self.assertEqual(response.status_code, 200, response.data)

    def _dashboard(self):
        return self.client.get("/api/v1/reports/dashboard/").data["kpis"]

    def test_cancelling_purchase_takes_animal_out_of_every_module(self):
        batch_id = self._buy()
        self.assertEqual((self._dashboard()["total_animals"], self._dashboard()["month_expense"]), (1, 3000.0))

        self._cancel(batch_id)

        kpis = self._dashboard()
        self.assertEqual((kpis["total_animals"], kpis["month_expense"]), (0, 0.0))
        batch = AnimalBatch.objects.get(pk=batch_id)
        self.assertEqual(batch.status, "finished")
        animal = Animal.objects.get(batch_id=batch_id)
        self.assertEqual((animal.status, animal.reproductive_status), ("finished", ""))
        matrizes = self.client.get("/api/v1/livestock/matrizes/?species=suinos").data
        self.assertEqual(matrizes["kpis"]["total"], 0)
        # The cancelled title stays as it was: the batch save does not reopen it.
        self.assertEqual(Transaction.objects.get(reference=f"PURCHASE-BATCH-{batch_id}").status, "cancelled")

    def test_other_titles_and_sold_lots_are_untouched(self):
        batch_id = self._buy()
        other_id = self._buy("M-11")
        AnimalBatch.objects.filter(pk=other_id).update(status="sold")
        self._cancel(other_id)
        self.assertEqual(AnimalBatch.objects.get(pk=other_id).status, "sold")
        self.assertEqual(AnimalBatch.objects.get(pk=batch_id).status, "active")
        self.assertEqual(self._dashboard()["total_animals"], 1)
