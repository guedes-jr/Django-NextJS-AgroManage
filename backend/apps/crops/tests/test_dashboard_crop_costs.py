from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APITestCase

from apps.crops.models import Field, LaborWorker, PlantingCycle
from apps.farms.models import Farm
from apps.inventory.models import ItemEstoque, LoteEstoque
from apps.organizations.models import Organization

User = get_user_model()


class CropDashboardCostTestCase(APITestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Crop Dash", slug="crop-dash")
        self.user = User.objects.create_user(
            email="crop-dash@test.com", password="Password-8472", full_name="Crop Dash",
            role=User.Role.ADMIN, organization=self.org,
        )
        self.client.force_authenticate(self.user)
        farm = Farm.objects.create(organization=self.org, name="Fazenda", total_area_ha=Decimal("20"))
        field = Field.objects.create(farm=farm, name="Setor 1", area_ha=Decimal("10"))
        self.plantation = PlantingCycle.objects.create(
            organization=self.org, farm=farm, field=field, name="Milho setor 1",
            crop_name="Milho", planting_date=date.today(),
        )
        self.worker = LaborWorker.objects.create(organization=self.org, name="Zé", worker_type=LaborWorker.WorkerType.EMPLOYEE)

    def _item(self, name, category, cost):
        item = ItemEstoque.objects.create(organization=self.org, nome=name, categoria=category, categorias=[category], unidade_medida="kg")
        LoteEstoque.objects.create(item=item, numero_lote=f"L-{name}", quantidade_inicial=Decimal("100"),
                                   quantidade_atual=Decimal("100"), custo_unitario=Decimal(cost), data_entrada=date.today())
        return item

    def _packaging(self, quantity, cost):
        item = ItemEstoque.objects.create(
            organization=self.org, nome="Sacaria", categoria="material", unidade_medida="unidade",
        )
        LoteEstoque.objects.create(
            item=item, quantidade_inicial=quantity, quantidade_atual=quantity,
            custo_unitario=Decimal(cost), data_entrada=date.today(),
        )
        return item

    def test_harvest_land_preparation_is_accepted(self):
        response = self.client.post(reverse("crops-land-preparations-list"), {
            "plantation": str(self.plantation.id), "date": date.today().isoformat(),
            "operation_type": "colheita", "hours_worked": "2", "hourly_rate": "100",
        }, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["operation_type_display"], "Colheita")

    def test_all_crop_operation_costs_appear_in_segment(self):
        seed = self._item("Semente milho", "semente", "10")
        fert = self._item("NPK", "fertilizante", "5")
        today = date.today().isoformat()
        p = str(self.plantation.id)
        for name, payload in [
            ("crops-plantings-list", {"plantation": p, "item": str(seed.id), "quantity": "10", "unit": "kg", "planting_date": today}),
            ("crops-fertilizations-list", {"plantation": p, "item": str(fert.id), "quantity": "20", "unit": "kg", "application_date": today}),
            ("crops-land-preparations-list", {"plantation": p, "date": today, "operation_type": "aracao", "hours_worked": "2", "hourly_rate": "100"}),
        ]:
            response = self.client.post(reverse(name), payload, format="json")
            self.assertEqual(response.status_code, 201, (name, response.data))

        dashboard = self.client.get(reverse("dashboard-summary")).data
        names = {row["name"] for row in dashboard["segments"]["crops"]["cost_breakdown"]}
        self.assertTrue({"Plantio", "Adubação", "Máquinas"} <= names, names)

    def test_operation_without_finance_mirror_still_counts(self):
        from apps.crops.models import LaborRecord, LandPreparation
        today = date.today()
        LandPreparation.objects.create(plantation=self.plantation, date=today, operation_type="colheita",
                                       hours_worked=Decimal("3"), hourly_rate=Decimal("50"))
        LaborRecord.objects.create(plantation=self.plantation, worker=self.worker, activity_date=today,
                                   daily_quantity=Decimal("2"), daily_rate=Decimal("100"))
        crops = self.client.get(reverse("dashboard-summary")).data["segments"]["crops"]
        self.assertEqual(crops["cost"], 350.0)
        self.assertEqual(
            sorted((row["name"], row["value"]) for row in crops["cost_breakdown"]),
            [("Máquinas", 150.0), ("Mão de Obra", 200.0)],
        )


class HarvestPackingAndSalesTestCase(CropDashboardCostTestCase):
    def test_harvest_in_boxes_with_packing_creates_expense(self):
        packaging = self._packaging(1200, "1.40")
        response = self.client.post(reverse("crops-harvests-list"), {
            "planting_cycle": str(self.plantation.id), "harvest_type": "partial",
            "harvest_date": date.today().isoformat(), "quantity": "1000", "quantity_unit": "box",
            "unit_weight_kg": "30", "destination": "stock", "packaged": True, "package_type": "sack",
            "package_weight_kg": "30", "package_count": 1000, "package_item": str(packaging.pk),
            "package_unit_cost": "999.00",
            "packing_labor_per_package": "1.00", "packing_other_costs": "400",
        }, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Decimal(response.data["yield_kg"]), Decimal("30000"))
        self.assertEqual(Decimal(response.data["packing_cost"]), Decimal("2800"))
        crops = self.client.get(reverse("dashboard-summary")).data["segments"]["crops"]
        self.assertEqual(crops["cost_breakdown"], [{"name": "Embalagem", "value": 2800.0}])

        self.assertEqual(packaging.estoque_atual, Decimal("200"))
        harvest_id = response.data["id"]
        detail_url = reverse("crops-harvests-detail", args=[harvest_id])
        rejected = self.client.patch(detail_url, {"package_count": 1201}, format="json")
        self.assertEqual(rejected.status_code, 400, rejected.data)
        self.assertEqual(packaging.estoque_atual, Decimal("200"))
        changed = self.client.patch(detail_url, {"package_count": 1100}, format="json")
        self.assertEqual(changed.status_code, 200, changed.data)
        self.assertEqual(packaging.estoque_atual, Decimal("100"))
        self.client.patch(reverse("crops-harvests-detail", args=[harvest_id]), {"packaged": False}, format="json")
        from apps.finance.models import Transaction
        self.assertFalse(Transaction.objects.filter(reference=f"HARVEST-PACK-{harvest_id}").exists())
        self.assertEqual(packaging.estoque_atual, Decimal("1200"))

    def test_harvest_keeps_the_unit_chosen(self):
        response = self.client.post(reverse("crops-harvests-list"), {
            "planting_cycle": str(self.plantation.id), "harvest_date": date.today().isoformat(),
            "quantity": "120", "quantity_unit": "bundle", "destination": "stock",
        }, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["quantity_unit"], "bundle")
        self.assertEqual(Decimal(response.data["quantity"]), Decimal("120"))
        self.assertIsNone(response.data["yield_kg"])

    def test_legacy_yield_kg_payload_still_works(self):
        response = self.client.post(reverse("crops-harvests-list"), {
            "planting_cycle": str(self.plantation.id), "harvest_date": date.today().isoformat(),
            "yield_kg": "500", "destination": "stock",
        }, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["quantity_unit"], "kg")

    def test_crop_sale_creates_revenue_and_is_tenant_scoped(self):
        url = reverse("crops-sales-list")
        response = self.client.post(url, {
            "planting_cycle": str(self.plantation.id), "sale_date": date.today().isoformat(),
            "quantity": "5000", "unit": "kg", "unit_price": "1.20",
        }, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Decimal(response.data["total_amount"]), Decimal("6000"))
        self.assertEqual(response.data["product"], "Milho")
        crops = self.client.get(reverse("dashboard-summary")).data["segments"]["crops"]
        self.assertEqual(crops["revenue"], 6000.0)

        sale_id = response.data["id"]
        self.client.patch(reverse("crops-sales-detail", args=[sale_id]), {"unit_price": "2"}, format="json")
        from apps.finance.models import Transaction
        self.assertEqual(Transaction.objects.get(reference=f"CROPSALE-{sale_id}").amount, Decimal("10000"))

        other = Organization.objects.create(name="Outra", slug="outra-sale")
        intruder = User.objects.create_user(email="x@sale.com", password="Password-8472", full_name="X",
                                            role=User.Role.ADMIN, organization=other)
        self.client.force_authenticate(intruder)
        self.assertEqual(len(self.client.get(url).data.get("results", self.client.get(url).data)), 0)
        self.assertEqual(self.client.post(url, {
            "planting_cycle": str(self.plantation.id), "sale_date": date.today().isoformat(),
            "quantity": "1", "unit": "kg", "unit_price": "1",
        }, format="json").status_code, 400)

        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.delete(reverse("crops-sales-detail", args=[sale_id])).status_code, 204)
        self.assertFalse(Transaction.objects.filter(reference=f"CROPSALE-{sale_id}").exists())

    def test_harvest_in_bales_converts_to_kg(self):
        response = self.client.post(reverse("crops-harvests-list"), {
            "planting_cycle": str(self.plantation.id), "harvest_date": date.today().isoformat(),
            "quantity": "200", "quantity_unit": "bale", "unit_weight_kg": "25", "destination": "stock",
        }, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Decimal(response.data["yield_kg"]), Decimal("5000"))


class SaleAvailabilityTestCase(CropDashboardCostTestCase):
    def _harvest(self, quantity, unit):
        response = self.client.post(reverse("crops-harvests-list"), {
            "planting_cycle": str(self.plantation.id), "harvest_date": date.today().isoformat(),
            "quantity": quantity, "quantity_unit": unit, "destination": "stock",
        }, format="json")
        self.assertEqual(response.status_code, 201, response.data)

    def _sell(self, quantity, unit):
        response = self.client.post(reverse("crops-sales-list"), {
            "planting_cycle": str(self.plantation.id), "sale_date": date.today().isoformat(),
            "quantity": quantity, "unit": unit, "unit_price": "1",
        }, format="json")
        self.assertEqual(response.status_code, 201, response.data)

    def _balances(self):
        rows = self.client.get(reverse("crops-sales-availability")).data
        row = next(item for item in rows if item["planting_cycle"] == str(self.plantation.id))
        return {item["unit"]: item for item in row["balances"]}

    def test_balance_levels_and_ton_conversion(self):
        self.assertEqual(self._balances(), {})
        self._harvest("10000", "kg")
        self._harvest("100", "bale")
        self._sell("2", "ton")  # 2.000 kg
        self._sell("85", "bale")
        balances = self._balances()
        self.assertEqual((Decimal(balances["kg"]["available"]), balances["kg"]["level"]), (Decimal("8000"), "ok"))
        self.assertEqual((Decimal(balances["bale"]["available"]), balances["bale"]["level"]), (Decimal("15"), "low"))
        self._sell("15", "bale")
        self.assertEqual(self._balances()["bale"]["level"], "none")

    def test_sacks_sold_are_taken_from_the_packed_harvest_in_kg(self):
        # Production case: 35.000 kg packed in 30 kg sacks, sold by the sack.
        packaging = self._packaging(1200, "1.40")
        response = self.client.post(reverse("crops-harvests-list"), {
            "planting_cycle": str(self.plantation.id), "harvest_date": date.today().isoformat(),
            "quantity": "35000", "quantity_unit": "kg", "destination": "stock",
            "packaged": True, "package_item": str(packaging.pk), "package_weight_kg": "30", "package_count": 1167,
        }, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self._sell("300", "sack")
        self._sell("500", "sack")
        balances = self._balances()
        self.assertEqual(list(balances), ["kg"])  # only what is left, in a single balance
        self.assertEqual(Decimal(balances["kg"]["available"]), Decimal("11000"))
        row = next(item for item in self.client.get(reverse("crops-sales-availability")).data
                   if item["planting_cycle"] == str(self.plantation.id))
        self.assertEqual(row["unit_weights"], {"sack": "30.00"})

    def test_other_organization_does_not_see_balances(self):
        self._harvest("500", "kg")
        other = Organization.objects.create(name="Outra", slug="outra-avail")
        intruder = User.objects.create_user(email="x@avail.com", password="Password-8472", full_name="X",
                                            role=User.Role.ADMIN, organization=other)
        self.client.force_authenticate(intruder)
        self.assertEqual(self.client.get(reverse("crops-sales-availability")).data, [])
