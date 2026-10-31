from datetime import timedelta
from decimal import Decimal
from uuid import uuid4
from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase
from apps.farms.models import Farm
from apps.organizations.models import Organization
from apps.inventory.models import ItemEstoque, LoteEstoque, MovimentacaoEstoque
from apps.livestock.models import Animal, AnimalBatch, Species, Mating, Pregnancy, CattlePasture, CattleGrazing, CattleManagement, CattleManagementEntry, CattleFeedPlan, CattleFeedDelivery
from apps.livestock.cattle_planning import deliver_feed
from apps.livestock.cattle_services import confirm_cattle_management


class CattleOperationsTests(APITestCase):
    def setUp(self):
        self.today = timezone.localdate()
        self.org = Organization.objects.create(name="Operations", slug="cattle-ops")
        self.other = Organization.objects.create(name="Other", slug="cattle-ops-other")
        self.farm = Farm.objects.create(organization=self.org, name="Farm")
        self.user = get_user_model().objects.create_user(email="ops@example.invalid", password="test", role="admin", organization=self.org)
        self.client.force_authenticate(self.user)
        self.species, _ = Species.objects.get_or_create(code="bovinos", defaults={"name": "Bovinos"})
        self.cow = self.animal("Cow", category="Vaca")
        self.batch = AnimalBatch.objects.create(farm=self.farm, species=self.species, batch_code="L1", quantity=10, category="Garrote", phase="crescimento", entry_date=self.today-timedelta(days=100), avg_weight_kg=200)
        self.item = ItemEstoque.objects.create(organization=self.org, nome="Suplemento", categoria="suplemento", especie_animal="bovino", unidade_medida="kg")
        self.lot = LoteEstoque.objects.create(item=self.item, numero_lote="SUP", quantidade_inicial=100, quantidade_atual=100, custo_unitario=2, data_entrada=self.today)
        self.plan = CattleFeedPlan.objects.create(batch=self.batch, item=self.item, kg_per_head_day=Decimal("0.5"), start_date=self.today, created_by=self.user)

    def animal(self, identifier, **changes):
        return Animal.objects.create(**dict(dict(farm=self.farm, species=self.species, identifier=identifier, gender="F", category="Novilha", entry_date=self.today-timedelta(days=100)), **changes))

    def post(self, route, data, pk=None):
        return self.client.post(reverse(route, args=[pk] if pk else None), data, format="json")

    def delivery(self, **changes):
        values = dict(dict(date=self.today.isoformat(), quantity_kg="50", remaining_before_kg="0", request_key=str(uuid4())), **changes)
        return self.post("cattle-feed-plan-deliveries", values, self.plan.pk), values

    def test_agenda_includes_future_birth_and_all_pages(self):
        for i, offset in enumerate([-40,-35,-30,-25,-20,-15,-10,-5,10]):
            cow = self.animal(str(i), reproductive_status="gestante")
            mating = Mating.objects.create(female=cow, mating_date=self.today-timedelta(days=300), status="confirmed")
            Pregnancy.objects.create(female=cow, mating=mating, start_date=mating.mating_date, expected_birth_date=self.today+timedelta(days=offset))
        result = self.client.get(reverse("cattle-overview"))
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(result.data["agenda_count"], 9)
        self.assertTrue(any(row["date"] > self.today.isoformat() for row in result.data["agenda"]))
        page = self.client.get(reverse("cattle-agenda"), {"page_size":5})
        self.assertEqual((page.data["count"],len(page.data["results"])), (9,5))
        self.assertIsNotNone(page.data["next"])
        self.assertEqual(self.client.get(reverse("cattle-agenda"), {"period":"upcoming","kind":"birth"}).data["count"], 1)

    def test_diagnosis_uses_shared_schedule_and_closes_after_result(self):
        Mating.objects.create(female=self.cow, mating_date=self.today-timedelta(days=25), status="pending_dg")
        self.cow.reproductive_status="coberta"; self.cow.save(update_fields=["reproductive_status"])
        result = self.client.get(reverse("cattle-agenda"), {"kind":"diagnosis"})
        self.assertEqual(result.data["count"],1)
        self.assertEqual(result.data["results"][0]["animal"], str(self.cow.pk))
        self.assertEqual(self.post("cattle-animal-diagnose-pregnancy", {"result":"negative","diagnosis_date":self.today.isoformat()}, self.cow.pk).status_code,200)
        self.assertEqual(self.client.get(reverse("cattle-agenda"), {"kind":"diagnosis"}).data["count"],0)

    def test_self_parent_cycles_and_wrong_sex_rejected_in_both_apis(self):
        for route in ["cattle-animal-detail","animal-detail"]:
            self.assertEqual(self.client.patch(reverse(route,args=[self.cow.pk]),{"dam_ref":str(self.cow.pk)},format="json").status_code,400)
        child=self.animal("Child",dam_ref=self.cow)
        self.assertEqual(self.client.patch(reverse("cattle-animal-detail",args=[self.cow.pk]),{"dam_ref":str(child.pk)},format="json").status_code,400)
        self.assertEqual(self.client.patch(reverse("cattle-animal-detail",args=[child.pk]),{"sire_ref":str(self.cow.pk)},format="json").status_code,400)

    def test_parent_birth_and_parent_gender_edits_preserve_children(self):
        self.cow.birth_date=self.today-timedelta(days=500); self.cow.save(update_fields=["birth_date"])
        child=self.animal("Child",dam_ref=self.cow,birth_date=self.today-timedelta(days=100))
        self.assertEqual(self.client.patch(reverse("cattle-animal-detail",args=[child.pk]),{"birth_date":(self.today-timedelta(days=600)).isoformat()},format="json").status_code,400)
        self.assertEqual(self.client.patch(reverse("animal-detail",args=[self.cow.pk]),{"gender":"M"},format="json").status_code,400)

    def test_named_parent_and_bounded_genealogy(self):
        response=self.post("cattle-animal-list",{"identifier":"Child","farm_id":str(self.farm.pk),"gender":"F","category":"Bezerro","entry_date":self.today.isoformat(),"dam_identifier_input":self.cow.identifier})
        self.assertEqual(response.status_code,201,response.data)
        child=Animal.objects.get(pk=response.data["id"])
        self.assertEqual(child.dam_ref_id,self.cow.pk)
        self.cow.dam_ref=child; self.cow.save(update_fields=["dam_ref"])
        tree=self.client.get(reverse("cattle-animal-genealogy",args=[child.pk]))
        self.assertTrue(any(row["repeated"] for row in tree.data["ancestors"]))

    def management(self, **changes):
        values=dict(dict(farm=self.farm,kind="sanitary",date=self.today,description="Sanitário",created_by=self.user),**changes)
        row=CattleManagement.objects.create(**values)
        CattleManagementEntry.objects.create(management=row,animal=self.cow)
        return confirm_cattle_management(row,self.user)

    def test_follow_up_resolution_is_explicit_and_idempotent(self):
        original=self.management(next_procedure_date=self.today+timedelta(days=5)); executed=self.management()
        data={"status":"done","note":"Conferido","execution":str(executed.pk)}
        for _ in range(2):
            response=self.post("cattle-management-resolve-follow-up",data,original.pk)
            self.assertEqual(response.status_code,200,response.data)
        original.refresh_from_db(); self.assertEqual(original.follow_up_execution,executed)
        self.assertEqual(self.client.get(reverse("cattle-agenda"),{"kind":"sanitary"}).data["count"],0)

    def test_follow_up_cannot_point_to_itself_or_be_patched(self):
        original=self.management(next_procedure_date=self.today)
        self.assertEqual(self.post("cattle-management-resolve-follow-up",{"status":"done","note":"Conferido","execution":str(original.pk)},original.pk).status_code,400)
        self.client.patch(reverse("cattle-management-detail",args=[original.pk]),{"follow_up_status":"done"},format="json")
        original.refresh_from_db(); self.assertEqual(original.follow_up_status,"pending")

    def test_delivery_is_atomic_idempotent_and_protects_stock_origin(self):
        first, values=self.delivery(); self.assertEqual(first.status_code,201,first.data)
        self.assertEqual(first.data["cost"],"100.00")
        self.assertEqual(self.post("cattle-feed-plan-deliveries",values,self.plan.pk).data["id"],first.data["id"])
        self.lot.refresh_from_db(); self.assertEqual(self.lot.quantidade_atual,Decimal(50))
        movement=MovimentacaoEstoque.objects.get(cattle_delivery_id=first.data["id"])
        self.assertEqual(movement.farm,self.farm)
        self.assertEqual(self.client.delete(reverse("inventory-movimentacoes-detail",args=[movement.pk])).status_code,400)
        self.assertEqual(self.client.patch(reverse("inventory-movimentacoes-detail",args=[movement.pk]),{"quantidade":"99"},format="json").status_code,400)

    def test_invalid_delivery_has_no_effect(self):
        self.assertEqual(self.delivery(quantity_kg="101")[0].status_code,400)
        self.assertEqual(self.delivery(date=(self.today-timedelta(days=1)).isoformat())[0].status_code,400)
        self.assertFalse(CattleFeedDelivery.objects.exists()); self.assertFalse(MovimentacaoEstoque.objects.exists())

    def test_delivery_error_rolls_back_snapshot(self):
        with patch("apps.inventory.services.registrar_movimentacao",side_effect=RuntimeError("fail")):
            with self.assertRaises(RuntimeError):
                deliver_feed(self.plan,self.user,quantity_kg=Decimal(10),remaining_before_kg=Decimal(0),date=self.today,request_key=uuid4())
        self.assertFalse(CattleFeedDelivery.objects.exists())
        self.lot.refresh_from_db(); self.assertEqual(self.lot.quantidade_atual,Decimal(100))

    def test_forecast_preserves_snapshot_when_heads_change(self):
        self.delivery()
        url=reverse("cattle-feed-plan-detail",args=[self.plan.pk])
        response=self.client.get(url); self.assertEqual(response.data["forecast"]["estimated_remaining_kg"],Decimal(50))
        self.batch.quantity=20; self.batch.save(update_fields=["quantity"])
        forecast=self.client.get(url).data["forecast"]
        self.assertEqual(forecast["status"],"review"); self.assertIsNone(forecast["estimated_remaining_kg"])
        self.assertEqual(CattleFeedDelivery.objects.get().head_count,10)

    def test_request_key_payload_is_checked(self):
        _, values=self.delivery(); values["quantity_kg"]="1"
        self.assertEqual(self.post("cattle-feed-plan-deliveries",values,self.plan.pk).status_code,400)
        self.assertEqual(CattleFeedDelivery.objects.count(),1)

    def test_plan_creation_does_not_move_stock_and_foreign_item_is_rejected(self):
        item=ItemEstoque.objects.create(organization=self.org,nome="Ração",categoria="racao",unidade_medida="kg")
        data={"batch":str(self.batch.pk),"item":str(item.pk),"kg_per_head_day":"1","start_date":self.today.isoformat()}
        response=self.post("cattle-feed-plan-list",data); self.assertEqual(response.status_code,201,response.data)
        self.assertFalse(MovimentacaoEstoque.objects.exists())
        # Use a genuinely foreign record rather than moving tenant-owned data.
        foreign=ItemEstoque.objects.create(organization=self.other,nome="Other",categoria="racao",unidade_medida="kg")
        self.assertEqual(self.client.patch(reverse("cattle-feed-plan-detail",args=[self.plan.pk]),{"item":str(foreign.pk)},format="json").status_code,400)

    def test_pasture_restriction_and_duration(self):
        pasture=CattlePasture.objects.create(farm=self.farm,name="Pasto",area_ha=10,availability="resting",availability_reason="Recuperação")
        data={"pasture":str(pasture.pk),"batch":str(self.batch.pk),"entry_date":self.today.isoformat()}
        self.assertEqual(self.post("cattle-grazing-list",data).status_code,400)
        url=reverse("cattle-pasture-detail",args=[pasture.pk])
        self.assertEqual(self.client.get(url).data["occupancy"]["state"],"resting")
        self.assertEqual(self.client.patch(url,{"availability":"available"},format="json").status_code,200)
        self.assertEqual(self.post("cattle-grazing-list",data).status_code,201)
        self.assertEqual(self.client.patch(url,{"availability":"blocked","availability_reason":"Obra"},format="json").status_code,400)
        self.assertEqual(self.client.get(url).data["occupancy"]["occupied_days"],0)

    def test_batch_summary_uses_existing_origins(self):
        pasture=CattlePasture.objects.create(farm=self.farm,name="Pasto",area_ha=10)
        CattleGrazing.objects.create(batch=self.batch,pasture=pasture,entry_date=self.today-timedelta(days=5))
        self.cow.batch=self.batch; self.cow.save(update_fields=["batch"])
        response=self.client.get(reverse("cattle-batch-detail",args=[self.batch.pk]))
        self.assertEqual(response.status_code,200,response.data)
        self.assertEqual(response.data["operations"]["pastures"][0]["days"],5)
        self.assertEqual(response.data["operations"]["identified_animals"],1)
        self.assertEqual(self.client.get(reverse("cattle-overview")).data["total_head"],10)

    def test_operator_and_foreign_tenant_are_rejected(self):
        user=get_user_model().objects.create_user(email="op@example.invalid",password="test",role="operator",organization=self.org)
        user.allowed_livestock.add(self.species); self.client.force_authenticate(user)
        self.assertEqual(self.client.get(reverse("cattle-feed-plan-list")).status_code,403)
        self.assertEqual(self.delivery()[0].status_code,403)
        other=get_user_model().objects.create_user(email="foreign@example.invalid",password="test",role="admin",organization=self.other)
        self.client.force_authenticate(other)
        self.assertEqual(self.client.get(reverse("cattle-feed-plan-detail",args=[self.plan.pk])).status_code,404)
        self.assertEqual(self.client.get(reverse("cattle-agenda"),{"farm":str(self.farm.pk)}).data["count"],0)

    def test_inactive_product_plan_can_be_closed(self):
        self.item.ativo = False; self.item.save(update_fields=["ativo"])
        response = self.client.patch(reverse("cattle-feed-plan-detail", args=[self.plan.pk]), {"is_active": False}, format="json")
        self.assertEqual(response.status_code, 200, response.data)

    def test_feed_plan_query_count_does_not_grow_per_row(self):
        from django.db import connection
        from django.test.utils import CaptureQueriesContext
        with CaptureQueriesContext(connection) as first:
            response = self.client.get(reverse("cattle-feed-plan-list"))
        self.assertEqual(response.status_code, 200)
        for index in range(5):
            item = ItemEstoque.objects.create(organization=self.org, nome=f"Produto {index}", categoria="suplemento", unidade_medida="kg")
            CattleFeedPlan.objects.create(batch=self.batch, item=item, kg_per_head_day=1, start_date=self.today)
        with CaptureQueriesContext(connection) as many:
            response = self.client.get(reverse("cattle-feed-plan-list"))
        self.assertEqual(response.data["count"], 6)
        self.assertLessEqual(len(many), len(first) + 1)

    def test_explicit_diagnosis_date_replaces_default_without_duplicate_alert(self):
        due = self.today + timedelta(days=45)
        response = self.post("cattle-animal-register-mating", {"mating_date": self.today.isoformat(), "mating_type": "iatf", "sire_info": "Touro externo", "expected_diagnosis_date": due.isoformat()}, self.cow.pk)
        self.assertEqual(response.status_code, 201, response.data)
        rows = self.client.get(reverse("cattle-agenda"), {"kind": "diagnosis"}).data["results"]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["date"], due.isoformat())

    def test_legacy_parent_cycle_cannot_be_attached_to_new_child(self):
        parent = self.animal("Parent")
        parent.dam_ref = parent; parent.save(update_fields=["dam_ref"])
        response = self.client.patch(reverse("cattle-animal-detail", args=[self.cow.pk]), {"dam_ref": str(parent.pk)}, format="json")
        self.assertEqual(response.status_code, 400)
