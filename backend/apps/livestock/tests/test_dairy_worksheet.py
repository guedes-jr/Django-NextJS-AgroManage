from datetime import timedelta
from decimal import Decimal
from uuid import uuid4

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.farms.models import Farm
from apps.inventory.models import (
    ConsumoRacao,
    ItemEstoque,
    LoteEstoque,
    MovimentacaoEstoque,
)
from apps.livestock.models import (
    Animal,
    CattleMilkDailyTotal,
    CattleMilkRecord,
    DairyWorksheetCommand,
    DairyWorksheetState,
    MilkTank,
    MilkTankMovement,
    Species,
)
from apps.organizations.models import Organization


class DairyWorksheetFixture:
    url = "/api/v1/livestock/cattle/dairy-worksheet/"

    def setUp(self):
        self.day = timezone.localdate()
        self.org = Organization.objects.create(name="Leite", slug="dairy-sheet")
        self.farm = Farm.objects.create(organization=self.org, name="Leiteira")
        self.user = get_user_model().objects.create_user(
            email="sheet@example.invalid",
            password="test",
            role="admin",
            organization=self.org,
        )
        self.client.force_authenticate(self.user)
        self.species, _ = Species.objects.get_or_create(
            code="bovinos", defaults={"name": "Bovinos"}
        )
        self.cow = self.animal("001")
        self.second = self.animal("002")
        self.item = ItemEstoque.objects.create(
            organization=self.org,
            nome="Ração",
            categoria="racao",
            unidade_medida="kg",
            especie_animal="bovino",
        )
        self.lot = LoteEstoque.objects.create(
            item=self.item,
            numero_lote="R1",
            quantidade_inicial=100,
            quantidade_atual=100,
            custo_unitario=2,
            data_entrada=self.day - timedelta(days=1),
        )

    def animal(self, identifier, **changes):
        return Animal.objects.create(
            **{
                "identifier": identifier,
                "farm": self.farm,
                "species": self.species,
                "cattle_purpose": "dairy",
                "category": "Vaca",
                "gender": "F",
                "status": "active",
                "reproductive_status": "lactante",
                "entry_date": self.day - timedelta(days=100),
                **changes,
            }
        )

    def get(self, **changes):
        return self.client.get(
            self.url, {"farm": str(self.farm.pk), "date": str(self.day), **changes}
        )

    def row(self, cow=None, **changes):
        cow = cow or self.cow
        current = next(
            row for row in self.get().data["results"] if row["id"] == str(cow.pk)
        )
        return {
            "animal": str(cow.pk),
            "expected_version": current["expected_version"],
            "morning": "12.00",
            "afternoon": "8.00",
            "evening": "0",
            "discarded_liters": "2",
            "discard_reason": "Qualidade",
            "notes": "",
            "oxytocin_ml": "1.25",
            "feeds": [
                {"slot": "concentrate", "item": str(self.item.pk), "quantity_kg": "5"}
            ],
            **changes,
        }

    def save(self, rows=None, **changes):
        return self.client.post(
            self.url,
            {
                "farm": str(self.farm.pk),
                "date": str(self.day),
                "request_key": str(uuid4()),
                "rows": rows or [self.row()],
                **changes,
            },
            format="json",
        )


class DairyWorksheetTests(DairyWorksheetFixture, APITestCase):
    def test_combined_entry_and_day_grid_are_backed_by_existing_ledgers(self):
        response = self.save()
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(CattleMilkRecord.objects.count(), 2)
        self.assertEqual(ConsumoRacao.objects.get().quantidade, 5)
        self.assertEqual(ConsumoRacao.objects.get().custo_total, 10)
        self.lot.refresh_from_db()
        self.assertEqual(self.lot.quantidade_atual, 95)
        row = self.get().data["results"][0]
        self.assertEqual(row["morning"], "12.00")
        self.assertEqual(row["afternoon"], "8.00")
        self.assertEqual(row["discarded_liters"], "2.00")
        self.assertEqual(row["oxytocin_ml"], "1.25")
        self.assertNotIn("consumption", str(row))
        self.assertNotIn("cost", str(row))
        self.assertEqual(DairyWorksheetCommand.objects.count(), 1)

    def test_replay_and_receipt_do_not_repeat_stock_or_milk(self):
        payload = {
            "farm": str(self.farm.pk),
            "date": str(self.day),
            "request_key": str(uuid4()),
            "rows": [self.row()],
        }
        first = self.client.post(self.url, payload, format="json")
        self.assertEqual(first.status_code, 200, first.data)
        self.assertEqual(
            self.client.post(self.url, payload, format="json").data, first.data
        )
        receipt = self.client.get(f"{self.url}{self.farm.pk}/{payload['request_key']}/")
        self.assertEqual(receipt.data, first.data)
        self.assertEqual(MovimentacaoEstoque.objects.count(), 1)
        payload["rows"][0]["notes"] = "Outra intenção"
        self.assertEqual(
            self.client.post(self.url, payload, format="json").status_code, 409
        )

    def test_feed_replacement_and_removal_reverse_original_lots_and_keep_audit(self):
        self.assertEqual(self.save().status_code, 200)
        self.assertEqual(
            self.save(
                [
                    self.row(
                        feeds=[
                            {
                                "slot": "concentrate",
                                "item": str(self.item.pk),
                                "quantity_kg": "3",
                            }
                        ]
                    )
                ]
            ).status_code,
            200,
        )
        self.lot.refresh_from_db()
        self.assertEqual(self.lot.quantidade_atual, 97)
        self.assertEqual(ConsumoRacao.objects.get().quantidade, 3)
        self.assertEqual(MovimentacaoEstoque.objects.count(), 3)
        removed = self.save([self.row(remove=True)])
        self.assertEqual(removed.status_code, 200, removed.data)
        self.lot.refresh_from_db()
        self.assertEqual(self.lot.quantidade_atual, 100)
        self.assertFalse(CattleMilkRecord.objects.exists())
        self.assertFalse(ConsumoRacao.objects.exists())
        self.assertFalse(DairyWorksheetState.objects.exists())
        self.assertEqual(MovimentacaoEstoque.objects.count(), 4)
        self.assertTrue(
            DairyWorksheetCommand.objects.order_by("-created_at")
            .first()
            .before[0]["feed_allocations"]
        )

    def test_last_row_stock_failure_rolls_back_entire_sheet(self):
        rows = [
            self.row(),
            self.row(
                self.second,
                feeds=[
                    {"slot": "silage", "item": str(self.item.pk), "quantity_kg": "100"}
                ],
            ),
        ]
        response = self.save(rows)
        self.assertEqual(response.status_code, 400, response.data)
        self.assertFalse(CattleMilkRecord.objects.exists())
        self.assertFalse(ConsumoRacao.objects.exists())
        self.assertFalse(DairyWorksheetState.objects.exists())
        self.assertFalse(DairyWorksheetCommand.objects.exists())
        self.assertFalse(MovimentacaoEstoque.objects.exists())
        self.lot.refresh_from_db()
        self.assertEqual(self.lot.quantidade_atual, 100)

    def test_stale_version_and_changed_legacy_milking_do_not_overwrite(self):
        stale = self.row()
        self.assertEqual(self.save().status_code, 200)
        self.assertEqual(self.save([stale]).status_code, 409)
        current = self.row()
        milk = CattleMilkRecord.objects.first()
        milk.notes = "Alterado no fluxo anterior"
        milk.save()
        self.assertEqual(self.save([current]).status_code, 409)

    def test_foreign_farm_animal_product_tank_and_receipt_are_denied(self):
        other = Organization.objects.create(name="Outra", slug="dairy-other")
        foreign = Farm.objects.create(organization=other, name="Outra")
        cow = self.animal("FOREIGN", farm=foreign)
        self.assertEqual(self.get(farm=str(foreign.pk)).status_code, 404)
        self.assertEqual(self.save([self.row(animal=str(cow.pk))]).status_code, 400)
        item = ItemEstoque.objects.create(
            organization=other, nome="Privado", categoria="racao", unidade_medida="kg"
        )
        self.assertEqual(
            self.save(
                [
                    self.row(
                        feeds=[
                            {
                                "slot": "concentrate",
                                "item": str(item.pk),
                                "quantity_kg": "1",
                            }
                        ]
                    )
                ]
            ).status_code,
            404,
        )
        tank = MilkTank.objects.create(farm=foreign, name="Outro", capacity_liters=100)
        self.assertEqual(self.save(tank=str(tank.pk)).status_code, 404)
        self.assertFalse(CattleMilkRecord.objects.exists())

    def test_tank_intake_is_atomic_and_capacity_failure_rolls_back(self):
        tank = MilkTank.objects.create(farm=self.farm, name="T1", capacity_liters=10)
        self.assertEqual(self.save(tank=str(tank.pk)).status_code, 400)
        self.assertFalse(CattleMilkRecord.objects.exists())
        tank.capacity_liters = 100
        tank.save()
        response = self.save(tank=str(tank.pk))
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(MilkTankMovement.objects.get().liters, 18)
        response = self.save([self.row(remove=True)])
        self.assertEqual(response.status_code, 400)
        self.assertEqual(CattleMilkRecord.objects.count(), 2)

    def test_aggregate_conflict_invalid_dates_and_duplicate_animals(self):
        row = self.row()
        self.assertEqual(self.save([row, row]).status_code, 400)
        self.assertEqual(
            self.save(date=str(self.day + timedelta(days=1))).status_code, 400
        )
        CattleMilkDailyTotal.objects.create(farm=self.farm, date=self.day, liters=100)
        self.assertEqual(self.save([row]).status_code, 409)
        self.assertTrue(self.get().data["aggregate_mode"])

    def test_roles_ownership_and_read_only_preserve_existing_boundaries(self):
        self.user.role = "operator"
        self.user.save()
        self.assertEqual(self.get().status_code, 403)
        self.user.allowed_livestock.add(self.species)
        response = self.save()
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(self.save([self.row(morning="13")]).status_code, 200)
        self.assertEqual(self.save([self.row(remove=True)]).status_code, 403)
        self.assertEqual(self.save([self.row(feeds=[])]).status_code, 403)
        self.user.operator_read_only = True
        self.user.save()
        self.assertEqual(self.save([self.row()]).status_code, 403)
        self.user.operator_read_only = False
        self.user.role = "feeder"
        self.user.save()
        self.assertEqual(self.get().status_code, 403)

    def test_pagination_and_feed_only_history_survive_dry_off(self):
        self.assertEqual(self.get(page_size=1).data["count"], 2)
        self.assertEqual(len(self.get(page_size=1).data["results"]), 1)
        self.assertEqual(
            self.save(
                [self.row(morning="0", afternoon="0", discarded_liters="0")]
            ).status_code,
            200,
        )
        self.cow.reproductive_status = "descanso"
        self.cow.save()
        rows = self.get(recorded_only=True).data["results"]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["id"], str(self.cow.pk))

    def total_command(self, **changes):
        return {
            "mode": "total",
            "farm": str(self.farm.pk),
            "date": str(self.day),
            "tank": None,
            "request_key": str(uuid4()),
            "total": {
                "period_start": str(self.day - timedelta(days=1)),
                "liters": "100",
                "discarded_liters": "10",
                "discard_reason": "Qualidade",
                "notes": "",
                "oxytocin_ml": "2",
                "feeds": [],
                **changes,
            },
        }

    def test_period_total_books_once_on_end_date_and_blocks_overlap_in_both_apis(self):
        payload = self.total_command()
        response = self.client.post(self.url, payload, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        total = self.get().data["total"]
        self.assertEqual(total["period_start"], payload["total"]["period_start"])
        self.assertEqual(total["liters"], "100.00")
        self.assertEqual(total["oxytocin_ml"], "2.00")
        from apps.livestock.cattle_milk import milk_day_summary

        self.assertEqual(
            milk_day_summary(self.org, self.day, self.farm.pk)["produced_liters"], 100
        )
        self.assertEqual(
            milk_day_summary(self.org, self.day - timedelta(days=1), self.farm.pk)[
                "produced_liters"
            ],
            0,
        )
        conflict = self.client.post(
            "/api/v1/livestock/cattle/milk/",
            {
                "animal": str(self.cow.pk),
                "date": payload["total"]["period_start"],
                "session": "morning",
                "liters": "10",
            },
            format="json",
        )
        self.assertEqual(conflict.status_code, 400)
        conflict = self.client.post(
            "/api/v1/livestock/cattle/milk-totals/",
            {
                "farm": str(self.farm.pk),
                "date": payload["total"]["period_start"],
                "liters": "10",
            },
            format="json",
        )
        self.assertEqual(conflict.status_code, 400)
        self.assertEqual(
            self.client.post(self.url, payload, format="json").data, response.data
        )
        self.assertEqual(CattleMilkDailyTotal.objects.count(), 1)

    def test_period_total_rejects_individual_anywhere_in_range(self):
        CattleMilkRecord.objects.create(
            animal=self.cow,
            date=self.day - timedelta(days=1),
            session="morning",
            liters=10,
        )
        response = self.client.post(self.url, self.total_command(), format="json")
        self.assertEqual(response.status_code, 400, response.data)
        self.assertFalse(CattleMilkDailyTotal.objects.exists())

    def test_total_feed_replacement_deletion_and_stale_version_are_atomic(self):
        feeds = [
            {"slot": "concentrate", "item": str(self.item.pk), "quantity_kg": "20"}
        ]
        response = self.client.post(
            self.url, self.total_command(feeds=feeds), format="json"
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.lot.refresh_from_db()
        self.assertEqual(self.lot.quantidade_atual, 80)
        total = self.get().data["total"]
        stale = self.total_command(
            **{k: total[k] for k in ("id", "expected_version", "period_start")}
        )
        response = self.client.post(
            self.url, self.total_command(**{**total, "feeds": []}), format="json"
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.lot.refresh_from_db()
        self.assertEqual(self.lot.quantidade_atual, 100)
        self.assertEqual(
            self.client.post(self.url, stale, format="json").status_code, 409
        )
        total = self.get().data["total"]
        self.assertEqual(
            self.client.delete(
                f"/api/v1/livestock/cattle/milk-totals/{total['id']}/"
            ).status_code,
            400,
        )
        response = self.client.post(
            self.url, self.total_command(**{**total, "remove": True}), format="json"
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertFalse(CattleMilkDailyTotal.objects.exists())
        self.assertFalse(DairyWorksheetState.objects.exists())

    def test_export_registry_covers_new_dairy_models(self):
        from apps.platform_admin.exports.capture import check_inventory

        check_inventory()

    def test_session_reallocation_checks_tank_after_the_complete_atomic_change(self):
        tank = MilkTank.objects.create(farm=self.farm, name="T1", capacity_liters=100)
        self.assertEqual(self.save(tank=str(tank.pk)).status_code, 200)
        response = self.save([self.row(morning="7.00", afternoon="13.00")])
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(MilkTankMovement.objects.get().liters, 18)
        self.assertEqual(
            sum(CattleMilkRecord.objects.values_list("liters", flat=True)), Decimal(20)
        )

    def test_legacy_period_change_cannot_detach_linked_feed_dates(self):
        payload = self.total_command(
            feeds=[
                {"slot": "concentrate", "item": str(self.item.pk), "quantity_kg": "10"}
            ]
        )
        response = self.client.post(self.url, payload, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        total = self.get().data["total"]
        response = self.client.patch(
            f"/api/v1/livestock/cattle/milk-totals/{total['id']}/",
            {"period_start": str(self.day)},
            format="json",
        )
        self.assertEqual(response.status_code, 400, response.data)
        response = self.client.post(
            self.url,
            self.total_command(**{**total, "period_start": str(self.day)}),
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(ConsumoRacao.objects.get().data_inicio, self.day)
        self.lot.refresh_from_db()
        self.assertEqual(self.lot.quantidade_atual, 90)

    def test_receipt_is_scoped_to_submitting_user_even_for_another_manager(self):
        response = self.save()
        self.assertEqual(response.status_code, 200, response.data)
        key = response.data["request_key"]
        other = get_user_model().objects.create_user(
            email="other-sheet@example.invalid",
            password="test",
            role="manager",
            organization=self.org,
        )
        self.client.force_authenticate(other)
        self.assertEqual(
            self.client.get(f"{self.url}{self.farm.pk}/{key}/").status_code, 404
        )

    def test_historical_dairy_milk_can_be_corrected_after_purpose_change(self):
        self.assertEqual(self.save([self.row(feeds=[])]).status_code, 200)
        self.cow.cattle_purpose = "beef"
        self.cow.save()
        response = self.save([self.row(morning="13", feeds=[])])
        self.assertEqual(response.status_code, 200, response.data)
