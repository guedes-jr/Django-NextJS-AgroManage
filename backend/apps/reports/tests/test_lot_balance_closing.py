"""A lot whose animals were all sold but kept a leftover balance must stop receiving general labor."""
from datetime import date
from decimal import Decimal

from django.urls import reverse
from rest_framework.test import APITestCase

from apps.livestock.models import AnimalBatch, HistoricoEvento
from apps.reports.tests.test_lot_costs import LotCostsTest


class LotBalanceClosingTests(APITestCase):
    new_batch, transaction, report = LotCostsTest.new_batch, LotCostsTest.transaction, LotCostsTest.report

    def setUp(self):
        LotCostsTest.setUp(self)
        self.batch.delete()
        self.lot = self.new_batch("A", quantity=10)
        self.other = self.new_batch("B", quantity=10)

    def labor(self, amount, day):
        self.transaction("Mão de Obra - Suinocultura", amount, None, due_date=day, payment_date=day,
                         reference=f"LABOR-SWINE-{day}-{amount}")

    def sell(self, quantity, day, **extra):
        return self.client.post(reverse("animalbatch-register-sale", args=[self.lot.pk]), dict(
            mode="partial", quantity=quantity, weight_kg="800", price_per_kg="10", date=day, buyer="X", **extra), format="json")

    def labor_of(self, lot):
        return Decimal(self.report()[str(lot.pk)]["labor"] or 0)

    def test_leftover_lot_keeps_receiving_labor_until_its_balance_is_closed(self):
        self.assertEqual(self.sell(8, "2026-03-01").status_code, 201)  # 2 animals that do not exist stay on the system
        self.labor(1000, date(2026, 4, 1))
        self.assertGreater(self.labor_of(self.lot), 0)

        response = self.client.post(reverse("animalbatch-close-balance", args=[self.lot.pk]),
                                    {"date": "2026-03-01", "reason": "Todos vendidos"}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.lot.refresh_from_db()
        self.assertEqual((self.lot.status, self.lot.quantity, self.lot.exit_date), ("sold", 0, date(2026, 3, 1)))
        self.assertTrue(HistoricoEvento.objects.filter(lote=self.lot, tipo_evento="Encerramento de Saldo",
                                                       metadata__quantity=2).exists())
        self.assertEqual(self.labor_of(self.lot), 0)
        self.assertEqual(self.labor_of(self.other), Decimal("1000"))

    def test_sale_can_close_the_lot(self):
        response = self.sell(8, "2026-03-01", close_batch=True)
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["closed_quantity"], 2)
        self.lot.refresh_from_db()
        self.assertEqual((self.lot.status, self.lot.quantity), ("sold", 0))
        self.labor(1000, date(2026, 4, 1))
        self.assertEqual(self.labor_of(self.lot), 0)

    def test_closing_dates_are_checked(self):
        self.assertEqual(self.sell(8, "2026-03-01").status_code, 201)
        url = reverse("animalbatch-close-balance", args=[self.lot.pk])
        self.assertEqual(self.client.post(url, {"date": "2026-02-01"}, format="json").status_code, 400)  # before last sale
        self.assertEqual(self.client.post(url, {"date": "2999-01-01"}, format="json").status_code, 400)  # future
        self.assertEqual(AnimalBatch.objects.get(pk=self.lot.pk).status, "active")
