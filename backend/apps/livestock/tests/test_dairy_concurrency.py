from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest import skipUnless
from unittest.mock import patch
from uuid import uuid4

from django.db import close_old_connections, connection
from rest_framework.test import APIClient, APITransactionTestCase

from apps.farms.models import Farm
from apps.inventory.models import ConsumoRacao
from apps.livestock.models import CattleMilkRecord, DairyWorksheetCommand

from .test_dairy_worksheet import DairyWorksheetFixture


@skipUnless(connection.vendor == "postgresql", "Requires real PostgreSQL row locks.")
class DairyWorksheetConcurrencyTests(DairyWorksheetFixture, APITransactionTestCase):
    def setUp(self):
        delivery = patch(
            "apps.notifications.services.NotificationService.schedule_external_delivery"
        )
        delivery.start()
        self.addCleanup(delivery.stop)
        super().setUp()

    def parallel(self, commands, url=None):
        gate = Barrier(len(commands))

        def send(command):
            close_old_connections()
            try:
                client = APIClient()
                client.force_authenticate(self.user)
                gate.wait(timeout=10)
                response = client.post(url or self.url, command, format="json")
                return response.status_code, response.data
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=len(commands)) as pool:
            return list(pool.map(send, commands))

    def payload(self, row=None, farm=None):
        return {
            "farm": str((farm or self.farm).pk),
            "date": str(self.day),
            "request_key": str(uuid4()),
            "rows": [row or self.row()],
        }

    def test_simultaneous_same_key_has_one_receipt_and_one_consumption(self):
        command = self.payload()
        results = self.parallel([command, command])
        self.assertEqual([value[0] for value in results], [200, 200], results)
        self.assertEqual(results[0][1], results[1][1])
        self.assertEqual(ConsumoRacao.objects.count(), 1)
        self.assertEqual(CattleMilkRecord.objects.count(), 2)
        self.assertEqual(DairyWorksheetCommand.objects.count(), 1)
        self.lot.refresh_from_db()
        self.assertEqual(self.lot.quantidade_atual, 95)

    def test_competing_versions_cannot_overwrite_same_animal(self):
        row = self.row()
        results = self.parallel(
            [self.payload(row), self.payload({**row, "morning": "15"})]
        )
        self.assertEqual(sorted(value[0] for value in results), [200, 409], results)
        self.assertEqual(ConsumoRacao.objects.count(), 1)
        self.lot.refresh_from_db()
        self.assertEqual(self.lot.quantidade_atual, 95)

    def test_two_farms_competing_for_stock_never_overdraw_or_partially_save(self):
        farm = Farm.objects.create(organization=self.org, name="Segunda")
        cow = self.animal("OUTRA", farm=farm)
        row = self.row(
            feeds=[
                {"slot": "concentrate", "item": str(self.item.pk), "quantity_kg": "60"}
            ]
        )
        other = {**row, "animal": str(cow.pk)}
        results = self.parallel([self.payload(row), self.payload(other, farm)])
        self.assertEqual(sorted(value[0] for value in results), [200, 400], results)
        self.assertEqual(ConsumoRacao.objects.count(), 1)
        self.assertEqual(CattleMilkRecord.objects.count(), 2)
        self.lot.refresh_from_db()
        self.assertEqual(self.lot.quantidade_atual, 40)

    def test_competing_group_cancellations_cannot_return_stock_twice(self):
        payload = {
            "farm": str(self.farm.pk),
            "date": str(self.day),
            "period_start": str(self.day),
            "request_key": str(uuid4()),
            "groups": [
                {
                    "name": "Grupo",
                    "animals": [str(self.cow.pk)],
                    "feeds": [
                        {"item": str(self.item.pk), "quantity_kg": "5", "mode": "total"}
                    ],
                }
            ],
        }
        response = self.client.post(
            "/api/v1/livestock/cattle/dairy-feeding/", payload, format="json"
        )
        self.assertEqual(response.status_code, 200, response.data)
        cancel = {
            "farm": str(self.farm.pk),
            "request_key": str(uuid4()),
            "source_key": payload["request_key"],
            "group_index": 0,
            "reason": "Correção",
        }
        results = self.parallel(
            [cancel, {**cancel, "request_key": str(uuid4())}],
            "/api/v1/livestock/cattle/dairy-feeding/cancel/",
        )
        self.assertEqual(sorted(value[0] for value in results), [200, 409], results)
        self.lot.refresh_from_db()
        self.assertEqual(self.lot.quantidade_atual, 100)
        self.assertFalse(ConsumoRacao.objects.exists())
