from datetime import timedelta
from decimal import Decimal
from uuid import uuid4
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase
from apps.organizations.models import Organization
from apps.farms.models import Farm
from apps.finance.models import Transaction
from apps.livestock.models import MilkTank, MilkTankMovement, MilkTankQuality, CattleMilkDailyTotal, Animal, Species
from apps.platform_admin.exports.capture import check_inventory


class MilkTankTests(APITestCase):
    base = "/api/v1/livestock/cattle/"

    def setUp(self):
        self.today = timezone.localdate()
        self.org = Organization.objects.create(name="Tanques",slug="tank-tests")
        other = Organization.objects.create(name="Outra",slug="tank-tests-other")
        self.farm = Farm.objects.create(organization=self.org,name="Leite")
        self.foreign = Farm.objects.create(organization=other,name="Outra")
        self.species,_ = Species.objects.get_or_create(code="bovinos", defaults={"name":"Bovinos"})
        self.user = get_user_model().objects.create_user(email="tank@example.invalid",password="test",organization=self.org,role="admin",full_name="Gestor")
        self.client.force_authenticate(self.user)
        self.production = CattleMilkDailyTotal.objects.create(farm=self.farm,date=self.today,liters=1000,discarded_liters=50,discard_reason="Descarte na ordenha")
        response = self.client.post(self.base+"milk-tanks/", {"farm":str(self.farm.pk),"name":"T1","capacity_liters":"1000"}, format="json")
        self.assertEqual(response.status_code,201,response.data)
        self.tank = MilkTank.objects.get(pk=response.data["id"])

    def test_mobile_tank_read_contract_scope_and_no_writes(self):
        foreign = MilkTank.objects.create(farm=self.foreign, name="Foreign", capacity_liters=2000)
        inactive = MilkTank.objects.create(farm=self.farm, name="Inactive", capacity_liters=2000, is_active=False)
        self.move()
        from django.db import connection
        from django.test.utils import CaptureQueriesContext
        with CaptureQueriesContext(connection) as captured:
            response = self.client.get(self.base+"milk-tanks/", {"farm":str(self.farm.pk), "is_active":"true", "page_size":20})
            detail = self.client.get(self.base+f"milk-tanks/{self.tank.pk}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(detail.data["balance_liters"], "600.00")
        self.assertEqual(detail.data["capacity_liters"], "1000.00")
        self.assertEqual(set(detail.data), {"id", "farm", "farm_name", "name", "capacity_liters", "balance_liters", "is_active", "notes"})
        self.assertFalse(any(q["sql"].lstrip().upper().startswith(("INSERT", "UPDATE", "DELETE")) for q in captured))
        self.assertEqual(self.client.get(self.base+f"milk-tanks/{foreign.pk}/").status_code, 404)
        self.assertEqual(self.client.get(self.base+"milk-tanks/", {"farm":str(self.foreign.pk)}).data["count"], 0)
        self.assertEqual(self.client.get(self.base+"milk-tanks/", {"is_active":"false"}).data["results"][0]["id"], str(inactive.pk))

    def test_mobile_tank_reads_respect_bovine_operator_scope(self):
        self.user.role = "operator"
        self.user.save(update_fields=["role"])
        self.user.allowed_livestock.set([self.species])
        self.assertEqual(self.client.get(self.base+"milk-tanks/").status_code, 200)
        self.user.allowed_livestock.clear()
        self.assertEqual(self.client.get(self.base+"milk-tanks/").status_code, 403)

    def test_mobile_movement_projection_excludes_financial_columns_and_is_read_only(self):
        from django.db import connection
        from django.test.utils import CaptureQueriesContext
        self.move()
        collection = self.move(kind="collection", liters="100", buyer="Dairy", unit_price="2.0000").data
        self.cancel(collection)
        with CaptureQueriesContext(connection) as captured:
            response = self.client.get(self.base+"milk-tank-movements/", {"view":"mobile", "tank":str(self.tank.pk), "farm":str(self.farm.pk), "kind":"collection", "date":str(self.today)})
            detail = self.client.get(self.base+f"milk-tank-movements/{collection['id']}/", {"view":"mobile", "tank":str(self.tank.pk)})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["count"], 1)
        row = response.data["results"][0]
        self.assertEqual(row["farm"], str(self.farm.pk))
        self.assertEqual(row["liters"], "100.00")
        self.assertIsNotNone(row["cancelled_at"])
        self.assertEqual(row["cancellation_reason"], "Correção justificada")
        self.assertEqual(detail.data["id"], collection["id"])
        for field in ["unit_price", "amount", "receivable", "request_key"]:
            self.assertNotIn(field, row)
        for q in captured:
            self.assertFalse(q["sql"].lstrip().upper().startswith(("INSERT", "UPDATE", "DELETE")))
            if q["sql"].lstrip().upper().startswith("SELECT"):
                for field in ["unit_price", "amount", "receivable_id"]:
                    self.assertNotIn('"'+field+'"', q["sql"])
        legacy = self.client.get(self.base+f"milk-tank-movements/{collection['id']}/")
        self.assertEqual(legacy.data["unit_price"], "2.0000")

    def test_mobile_movement_scope_and_pagination(self):
        foreign_tank = MilkTank.objects.create(farm=self.foreign, name="Foreign", capacity_liters=2000)
        foreign_row = MilkTankMovement.objects.create(tank=foreign_tank, kind="production", date=self.today, liters=1, request_key=uuid4(), created_by=self.user)
        for _ in range(21):
            self.move(liters="1")
        response = self.client.get(self.base+"milk-tank-movements/", {"view":"mobile", "tank":str(self.tank.pk), "page":2, "page_size":20})
        self.assertEqual(response.data["count"], 21)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(self.client.get(self.base+f"milk-tank-movements/{foreign_row.pk}/", {"view":"mobile"}).status_code, 404)
        self.assertEqual(self.client.get(self.base+"milk-tank-movements/", {"view":"mobile", "farm":str(self.foreign.pk)}).data["count"], 0)
        row_id = response.data["results"][0]["id"]
        self.assertEqual(self.client.get(self.base+f"milk-tank-movements/{row_id}/", {"view":"mobile", "tank":str(foreign_tank.pk)}).status_code, 404)
        self.user.role = "operator"
        self.user.save(update_fields=["role"])
        self.user.allowed_livestock.set([self.species])
        self.assertEqual(self.client.get(self.base+"milk-tank-movements/", {"view":"mobile"}).status_code, 200)
        self.user.allowed_livestock.clear()
        self.assertEqual(self.client.get(self.base+"milk-tank-movements/", {"view":"mobile"}).status_code, 403)

    def test_mobile_quality_read_projection_preserves_null_zero_and_legacy(self):
        from django.db import connection
        from django.test.utils import CaptureQueriesContext
        row = MilkTankQuality.objects.create(tank=self.tank, date=self.today, sample="A1", temperature_c="-0.50", fat_percent=0, scc=0, request_key=uuid4(), created_by=self.user)
        with CaptureQueriesContext(connection) as captured:
            response = self.client.get(self.base+"milk-tank-quality/", {"view":"mobile", "tank":str(self.tank.pk), "farm":str(self.farm.pk), "date":str(self.today)})
            detail = self.client.get(self.base+f"milk-tank-quality/{row.pk}/", {"view":"mobile", "tank":str(self.tank.pk)})
        self.assertEqual(response.status_code, 200, response.data)
        result = response.data["results"][0]
        self.assertEqual(result["farm"], str(self.farm.pk))
        self.assertEqual(result["temperature_c"], "-0.50")
        self.assertEqual(result["fat_percent"], "0.00")
        self.assertIsNone(result["protein_percent"])
        self.assertEqual(result["scc"], 0)
        self.assertIsNone(result["tbc"])
        self.assertEqual(result["antibiotics"], "not_tested")
        self.assertEqual(detail.data["id"], str(row.pk))
        self.assertEqual(detail.data["recorded_by"], self.user.full_name)
        self.assertNotIn("request_key", result)
        self.assertNotIn("compliance", result)
        self.assertFalse(any(q["sql"].lstrip().upper().startswith(("INSERT", "UPDATE", "DELETE")) for q in captured))
        legacy = self.client.get(self.base+f"milk-tank-quality/{row.pk}/")
        self.assertEqual(legacy.status_code, 200)
        self.assertNotIn("farm", legacy.data)

    def test_mobile_quality_pagination_tenant_filters_and_operator_access(self):
        foreign_tank = MilkTank.objects.create(farm=self.foreign, name="Foreign", capacity_liters=2000)
        foreign = MilkTankQuality.objects.create(tank=foreign_tank, date=self.today, antibiotics="positive", request_key=uuid4(), created_by=self.user)
        for _ in range(21):
            MilkTankQuality.objects.create(tank=self.tank, date=self.today, antibiotics="negative", request_key=uuid4(), created_by=self.user)
        response = self.client.get(self.base+"milk-tank-quality/", {"view":"mobile", "tank":str(self.tank.pk), "page":2, "page_size":20})
        self.assertEqual(response.data["count"], 21)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(self.client.get(self.base+f"milk-tank-quality/{foreign.pk}/", {"view":"mobile"}).status_code, 404)
        self.assertEqual(self.client.get(self.base+"milk-tank-quality/", {"view":"mobile", "farm":str(self.foreign.pk)}).data["count"], 0)
        row_id = response.data["results"][0]["id"]
        self.assertEqual(self.client.get(self.base+f"milk-tank-quality/{row_id}/", {"view":"mobile", "tank":str(foreign_tank.pk)}).status_code, 404)
        self.user.role = "operator"
        self.user.save(update_fields=["role"])
        self.user.allowed_livestock.set([self.species])
        self.assertEqual(self.client.get(self.base+"milk-tank-quality/", {"view":"mobile"}).status_code, 200)
        self.user.allowed_livestock.clear()
        self.assertEqual(self.client.get(self.base+"milk-tank-quality/", {"view":"mobile"}).status_code, 403)

    def test_mobile_tank_form_options_permissions_and_scope(self):
        options = self.client.get(self.base+"milk-tanks/form-options/", {"farm":str(self.farm.pk)})
        self.assertEqual(options.status_code, 200)
        self.assertEqual(self.client.get(self.base+"milk-tanks/form-options/", {"farm":str(self.foreign.pk)}).status_code, 404)
        self.assertEqual(self.client.get(self.base+f"milk-tanks/{self.tank.pk}/form-record/", {"farm":str(self.foreign.pk)}).status_code, 404)
        self.user.role = "operator"
        self.user.save(update_fields=["role"])
        self.user.allowed_livestock.set([self.species])
        self.assertEqual(self.client.get(self.base+"milk-tanks/form-options/", {"farm":str(self.farm.pk)}).status_code, 403)
        self.assertEqual(self.client.patch(self.base+f"milk-tanks/{self.tank.pk}/?view=mobile", {"name":"Denied"}, format="json").status_code, 403)

    def test_mobile_tank_create_edit_version_and_legacy(self):
        response = self.client.post(self.base+"milk-tanks/?view=mobile", {"farm":str(self.farm.pk), "name":"New", "capacity_liters":"1200.25", "is_active":True, "notes":"N"}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertFalse(response.data["has_movements"])
        url = self.base+f"milk-tanks/{response.data['id']}/?view=mobile"
        version = response.data["version"]
        self.assertEqual(self.client.patch(url, {"name":"Missing version"}, format="json").status_code, 400)
        edit = self.client.patch(url, {"name":"Updated", "expected_version":version}, format="json")
        self.assertEqual(edit.status_code, 200, edit.data)
        stale = self.client.patch(url, {"notes":"Stale", "expected_version":version}, format="json")
        self.assertEqual(stale.status_code, 409, stale.data)
        self.assertEqual(MilkTank.objects.get(pk=response.data["id"]).notes, "N")
        self.assertEqual(self.client.patch(self.base+f"milk-tanks/{response.data['id']}/", {"notes":"Legacy"}, format="json").status_code, 200)

    def test_mobile_tank_edit_history_balance_farm_and_name_rules(self):
        self.move()
        record = self.client.get(self.base+f"milk-tanks/{self.tank.pk}/form-record/", {"farm":str(self.farm.pk)}).data
        self.assertTrue(record["has_movements"])
        url = self.base+f"milk-tanks/{self.tank.pk}/?view=mobile"
        for payload in [{"capacity_liters":"2000"}, {"is_active":False}, {"farm":str(self.foreign.pk)}]:
            response = self.client.patch(url, {**payload,"expected_version":record["version"]}, format="json")
            self.assertEqual(response.status_code, 400, response.data)
        MilkTank.objects.create(farm=self.farm,name="Existing",capacity_liters=100)
        self.assertEqual(self.client.patch(url, {"name":"Existing", "expected_version":record["version"]}, format="json").status_code, 400)
        self.assertEqual(self.balance(),600)
        self.tank.refresh_from_db()
        self.assertEqual(self.tank.capacity_liters,1000)
        self.assertTrue(self.tank.is_active)

    def move(self, **changes):
        data={"tank":str(self.tank.pk),"kind":"production","date":str(self.today),"liters":"600","request_key":str(uuid4()), **changes}
        return self.client.post(self.base+"milk-tank-movements/",data,format="json")

    def balance(self, tank=None):
        result=self.client.get(self.base+f"milk-tanks/{(tank or self.tank).pk}/")
        self.assertEqual(result.status_code,200,result.data)
        return Decimal(result.data["balance_liters"])

    def cancel(self, movement):
        return self.client.post(self.base+f"milk-tank-movements/{movement['id']}/cancel/",{"reason":"Correção justificada"},format="json")

    def test_ledger_tracks_only_explicit_usable_production_collections_and_discards(self):
        self.assertEqual(self.balance(),0)
        available=self.client.get(self.base+f"milk-tanks/{self.tank.pk}/production-available/").data
        self.assertEqual(Decimal(available["available"]),950)
        self.assertEqual(self.move().status_code,201)
        self.assertEqual(self.move(kind="collection",liters="200",buyer="Laticínio").status_code,201)
        self.assertEqual(self.move(kind="discard",liters="50",reason="Avaria").status_code,201)
        self.assertEqual(self.balance(),350)
        self.assertEqual(self.production.liters,1000)
        self.assertFalse(Transaction.objects.filter(reference__startswith="SALE-MILK-TANK-").exists())

    def test_receipts_cannot_overallocate_the_same_production_across_tanks(self):
        self.move()
        second=MilkTank.objects.create(farm=self.farm,name="T2",capacity_liters=1000)
        bad=self.move(tank=str(second.pk),liters="351")
        self.assertEqual(bad.status_code,400,bad.data)
        self.assertEqual(self.balance(second),0)
        self.assertEqual(self.move(tank=str(second.pk),liters="350").status_code,201)
        self.assertEqual(self.move(liters="1").status_code,400)
        self.assertEqual(self.balance()+self.balance(second),950)

    def test_capacity_and_historical_stock_validation_roll_back_every_effect(self):
        self.move()
        self.assertEqual(self.move(kind="collection",liters="601",buyer="Laticínio",unit_price="2",generate_receivable=True).status_code,400)
        CattleMilkDailyTotal.objects.create(farm=self.farm,date=self.today-timedelta(days=2),liters=1000)
        self.assertEqual(self.move(date=str(self.today-timedelta(days=2)),liters="600").status_code,400)
        self.assertEqual(MilkTankMovement.objects.count(),1)
        self.assertEqual(self.balance(),600)
        self.assertFalse(Transaction.objects.filter(reference__startswith="SALE-MILK-TANK-").exists())

    def test_collection_retry_creates_one_pending_receivable_and_cancellation_is_audited(self):
        key=str(uuid4())
        for _ in range(2): self.assertEqual(self.move(request_key=key).status_code,201)
        key=str(uuid4())
        for _ in range(2):
            result=self.move(kind="collection",liters="200",buyer="Laticínio",unit_price="2.50",generate_receivable=True,request_key=key)
            self.assertEqual(result.status_code,201,result.data)
        title=Transaction.objects.get(pk=result.data["receivable"])
        self.assertEqual((title.status,title.amount,title.farm_id),("pending",Decimal(500),self.farm.pk))
        self.assertEqual(MilkTankMovement.objects.count(),2)
        self.assertEqual(self.balance(),400)
        for _ in range(2): self.assertEqual(self.cancel(result.data).status_code,200)
        self.assertEqual(self.balance(),600)
        title.refresh_from_db();self.assertEqual(title.status,"cancelled")
        row=MilkTankMovement.objects.get(pk=result.data["id"])
        self.assertEqual(row.cancelled_by,self.user)
        self.assertTrue(row.cancellation_reason)

    def test_paid_collection_requires_financial_reversal(self):
        self.move()
        collection=self.move(kind="collection",liters="100",buyer="Laticínio",unit_price="3",generate_receivable=True).data
        Transaction.objects.filter(pk=collection["receivable"]).update(status="paid")
        self.assertEqual(self.cancel(collection).status_code,400)
        self.assertEqual(self.balance(),500)
        self.assertIsNone(MilkTankMovement.objects.get(pk=collection["id"]).cancelled_at)

    def test_production_correction_or_deletion_cannot_remove_reserved_milk(self):
        entry=self.move().data
        url=self.base+f"milk-totals/{self.production.pk}/"
        self.assertEqual(self.client.patch(url,{"liters":"550"},format="json").status_code,400)
        self.assertEqual(self.client.patch(url,{"date":str(self.today-timedelta(days=1))},format="json").status_code,400)
        self.assertEqual(self.client.delete(url).status_code,400)
        self.production.refresh_from_db();self.assertEqual(self.production.liters,1000)
        self.assertEqual(self.client.patch(url,{"liters":"1200"},format="json").status_code,200)
        self.assertEqual(self.cancel(entry).status_code,200)
        self.assertEqual(self.client.delete(url).status_code,204)

    def test_individual_milking_is_also_protected_after_tank_receipt(self):
        cow=Animal.objects.create(farm=self.farm,species=self.species,identifier="V1",category="Vaca",gender="F",entry_date=self.today-timedelta(days=30))
        day=str(self.today-timedelta(days=1))
        result=self.client.post(self.base+"milk/",{"animal":str(cow.pk),"date":day,"session":"morning","liters":"50","discarded_liters":"5","discard_reason":"Separação"},format="json")
        self.assertEqual(result.status_code,201,result.data)
        self.assertEqual(self.move(date=day,liters="45").status_code,201)
        url=self.base+f"milk/{result.data['id']}/"
        self.assertEqual(self.client.patch(url,{"discarded_liters":"10"},format="json").status_code,400)
        self.assertEqual(self.client.delete(url).status_code,400)

    def test_cancelling_an_entry_cannot_leave_subsequent_collection_negative(self):
        entry=self.move().data
        self.move(kind="collection",liters="400",buyer="Laticínio")
        self.assertEqual(self.cancel(entry).status_code,400)
        self.assertEqual(self.balance(),200)
        self.assertIsNone(MilkTankMovement.objects.get(pk=entry["id"]).cancelled_at)

    def test_quality_records_are_independent_and_idempotent(self):
        self.move()
        data={"tank":str(self.tank.pk),"date":str(self.today),"fat_percent":"3.7","protein_percent":"3.2","scc":100000,"tbc":2000,"antibiotics":"positive","request_key":str(uuid4())}
        for _ in range(2):
            result=self.client.post(self.base+"milk-tank-quality/",data,format="json")
            self.assertEqual(result.status_code,201,result.data)
        self.assertEqual(MilkTankQuality.objects.count(),1)
        self.assertEqual(self.balance(),600)
        data.update(request_key=str(uuid4()),fat_percent="101")
        self.assertEqual(self.client.post(self.base+"milk-tank-quality/",data,format="json").status_code,400)

    def test_tenant_isolation_future_dates_and_inactive_tank(self):
        foreign=MilkTank.objects.create(farm=self.foreign,name="Secret",capacity_liters=500)
        self.assertEqual(self.client.get(self.base+f"milk-tanks/{foreign.pk}/").status_code,404)
        self.assertEqual(self.move(tank=str(foreign.pk)).status_code,400)
        self.assertEqual(self.move(date=str(self.today+timedelta(days=1))).status_code,400)
        self.assertEqual(self.move(kind="discard",liters="1").status_code,400)
        self.assertEqual(self.client.patch(self.base+f"milk-tanks/{self.tank.pk}/",{"is_active":False},format="json").status_code,200)
        self.assertEqual(self.move().status_code,400)
        self.assertEqual(self.client.get(self.base+"milk-tank-movements/",{"farm":str(self.foreign.pk)}).data["count"],0)

    def test_tank_cannot_be_shrunk_moved_deactivated_or_deleted_with_balance(self):
        self.move()
        url=self.base+f"milk-tanks/{self.tank.pk}/"
        self.assertEqual(self.client.patch(url,{"capacity_liters":"500"},format="json").status_code,400)
        self.assertEqual(self.client.patch(url,{"is_active":False},format="json").status_code,400)
        self.assertEqual(self.client.patch(url,{"farm":str(self.foreign.pk)},format="json").status_code,400)
        self.assertEqual(self.client.delete(url).status_code,405)
        self.assertEqual(self.balance(),600)

    def test_operator_scope_read_only_and_financial_fields(self):
        self.move()
        self.move(kind="collection",liters="100",buyer="Laticínio",unit_price="2",generate_receivable=True)
        self.user.role="operator";self.user.save()
        self.assertEqual(self.client.get(self.base+"milk-tanks/").status_code,403)
        self.user.allowed_livestock.add(self.species)
        result=self.client.get(self.base+"milk-tank-movements/")
        self.assertEqual(result.status_code,200)
        self.assertNotIn("amount",result.data["results"][0])
        self.assertNotIn("receivable",result.data["results"][0])
        self.assertEqual(self.move(kind="collection",liters="1",buyer="Laticínio",unit_price="2").status_code,403)
        self.assertEqual(self.move(kind="collection",liters="1",buyer="Laticínio").status_code,201)
        self.assertEqual(self.client.post(self.base+"milk-tanks/",{"farm":str(self.farm.pk),"name":"No","capacity_liters":"100"},format="json").status_code,403)
        self.user.operator_read_only=True;self.user.save()
        self.assertEqual(self.move(kind="discard",liters="1",reason="No").status_code,403)

    def test_inventory_and_read_queries_create_no_movements(self):
        check_inventory()
        self.client.get(self.base+"milk-tanks/")
        self.client.get(self.base+f"milk-tanks/{self.tank.pk}/production-available/")
        self.assertEqual(MilkTankMovement.objects.count(),0)
