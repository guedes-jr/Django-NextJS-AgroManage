from datetime import timedelta
from uuid import uuid4

from rest_framework.test import APITestCase

from apps.inventory.models import ConsumoRacao, MovimentacaoEstoque
from apps.livestock.models import DairyWorksheetCommand

from .test_dairy_worksheet import DairyWorksheetFixture


class DairyFeedingTests(DairyWorksheetFixture, APITestCase):
    def command(self, **changes):
        return {
            "farm": str(self.farm.pk),
            "date": str(self.day),
            "period_start": str(self.day - timedelta(days=1)),
            "request_key": str(uuid4()),
            "groups": [
                {
                    "name": "Secas e novilhas",
                    "animals": [str(self.cow.pk), str(self.second.pk)],
                    "feeds": [
                        {
                            "item": str(self.item.pk),
                            "quantity_kg": "2.50",
                            "mode": "per_head_day",
                        }
                    ],
                }
            ],
            **changes,
        }

    def post_groups(self, values=None):
        return self.client.post(
            "/api/v1/livestock/cattle/dairy-feeding/",
            values or self.command(),
            format="json",
        )

    def test_group_calculation_history_and_replay_use_real_consumption_once(self):
        values = self.command()
        result = self.post_groups(values)
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(result.data["groups"][0]["feeds"][0]["total_kg"], "10.00")
        self.assertEqual(ConsumoRacao.objects.get().quantidade, 10)
        self.assertEqual(ConsumoRacao.objects.get().animais.count(), 2)
        self.assertEqual(self.post_groups(values).data, result.data)
        self.assertEqual(MovimentacaoEstoque.objects.count(), 1)
        history = self.client.get(
            "/api/v1/livestock/cattle/dairy-feeding/",
            {"farm": str(self.farm.pk), "resource": "history"},
        ).data
        self.assertFalse(history["results"][0]["groups"][0]["cancelled"])
        self.assertNotIn("cost", str(history))
        self.assertNotIn("consumption", str(history))

    def test_duplicate_animals_cross_group_and_stock_failure_do_not_partially_supply(
        self,
    ):
        values = self.command()
        values["groups"].append(values["groups"][0])
        self.assertEqual(self.post_groups(values).status_code, 400)
        values = self.command()
        values["groups"][0]["feeds"][0]["quantity_kg"] = "26"
        self.assertEqual(self.post_groups(values).status_code, 400)
        self.assertFalse(ConsumoRacao.objects.exists())
        self.assertFalse(MovimentacaoEstoque.objects.exists())
        self.assertFalse(DairyWorksheetCommand.objects.exists())

    def test_cancellation_reverses_original_allocations_once_and_retains_history(self):
        source = self.post_groups().data
        values = {
            "farm": str(self.farm.pk),
            "request_key": str(uuid4()),
            "source_key": source["request_key"],
            "group_index": 0,
            "reason": "Fornecimento informado indevidamente",
        }
        url = "/api/v1/livestock/cattle/dairy-feeding/cancel/"
        result = self.client.post(url, values, format="json")
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(self.client.post(url, values, format="json").data, result.data)
        self.lot.refresh_from_db()
        self.assertEqual(self.lot.quantidade_atual, 100)
        self.assertFalse(ConsumoRacao.objects.exists())
        self.assertEqual(MovimentacaoEstoque.objects.count(), 2)
        values["request_key"] = str(uuid4())
        self.assertEqual(self.client.post(url, values, format="json").status_code, 409)
        history = self.client.get(
            "/api/v1/livestock/cattle/dairy-feeding/",
            {"farm": str(self.farm.pk), "resource": "history"},
        ).data
        self.assertTrue(history["results"][0]["groups"][0]["cancelled"])

    def test_all_other_roles_and_foreign_targets_are_rejected(self):
        for role in ["operator", "feeder"]:
            self.user.role = role
            self.user.save()
            self.user.allowed_livestock.add(self.species)
            self.assertEqual(self.post_groups().status_code, 403)
            self.assertEqual(
                self.client.get(
                    "/api/v1/livestock/cattle/dairy-feeding/",
                    {"farm": str(self.farm.pk)},
                ).status_code,
                403,
            )
        self.user.role = "admin"
        self.user.save()
        values = self.command()
        values["groups"][0]["animals"] = [str(uuid4())]
        self.assertEqual(self.post_groups(values).status_code, 400)
        self.assertFalse(ConsumoRacao.objects.exists())
