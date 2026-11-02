from datetime import timedelta
from decimal import Decimal
from uuid import uuid4
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase
from rest_framework.exceptions import ValidationError
from apps.farms.models import Farm
from apps.organizations.models import Organization
from apps.inventory.models import ItemEstoque, LoteEstoque, MovimentacaoEstoque
from apps.livestock.models import (Animal, AnimalBatch, Species, CattleMilkRecord, CattleMilkDailyTotal, CattleManagement,
    CattleManagementEntry, HealthRecord, CattlePurposeChange, CattleTransfer, CattleOccurrence, CattleProtocolStep)
from apps.tasks.models import Task
from apps.livestock.cattle_services import confirm_cattle_management
from apps.platform_admin.exports.capture import check_inventory


class CattleImprovementTests(APITestCase):
    base = "/api/v1/livestock/cattle/operations/"

    def setUp(self):
        self.today = timezone.localdate()
        self.org = Organization.objects.create(name="Melhorias", slug="cattle-improvements")
        other = Organization.objects.create(name="Outra", slug="cattle-improvements-other")
        self.farm = Farm.objects.create(organization=self.org,name="Principal")
        self.foreign = Farm.objects.create(organization=other,name="Outra")
        self.user = get_user_model().objects.create_user(email="improvements@example.invalid",password="test",organization=self.org,role="admin",full_name="Gestor")
        self.client.force_authenticate(self.user)
        self.species,_ = Species.objects.get_or_create(code="bovinos",defaults={"name":"Bovinos"})
        self.cow = self.animal("C1",cattle_purpose="dairy")
        self.beef = self.animal("B1",cattle_purpose="beef")
        self.unknown = self.animal("U1")
        self.source = self.batch("SRC",quantity=10,purchase_value=1000,avg_weight_kg=300)
        self.destination = self.batch("DEST",quantity=5,purchase_value=750,avg_weight_kg=400)

    def animal(self, identifier, **changes):
        return Animal.objects.create(**{**dict(farm=self.farm,species=self.species,identifier=identifier,gender="F",category="Vaca",reproductive_status="lactante",entry_date=self.today-timedelta(days=100)),**changes})

    def batch(self, code, **changes):
        return AnimalBatch.objects.create(**{**dict(farm=self.farm,species=self.species,batch_code=code,category="Garrote",gender="M",phase="crescimento",quantity=0,cattle_purpose="beef",entry_date=self.today-timedelta(days=90)),**changes})

    def post(self, kind, data):
        return self.client.post(self.base+kind+"/", data, format="json")

    def transfer_data(self, **changes):
        return {"source":str(self.source.pk),"destination":str(self.destination.pk),"quantity":3,"date":str(self.today),"animals":[],"reason":"Separação de manejo","request_key":str(uuid4()),"preview":True,"expected_source":10,"expected_destination":5,**changes}

    def lot(self, category="medicamento", **changes):
        item=ItemEstoque.objects.create(organization=self.org,nome="Produto",categoria=category,unidade_medida="ml" if category!="semen" else "dose",especie_animal="bovino")
        return LoteEstoque.objects.create(**{**dict(item=item,numero_lote="P1",quantidade_inicial=100,quantidade_atual=100,custo_unitario=2,data_entrada=self.today-timedelta(days=30),data_validade=self.today+timedelta(days=30)),**changes})

    def test_inventory_explicit_registry(self):
        check_inventory()

    def test_purpose_filters_unknown_and_dual_without_guessing_lactation(self):
        dual=self.animal("D1",cattle_purpose="dual")
        url="/api/v1/livestock/cattle/animals/"
        dairy=self.client.get(url,{"production":"dairy"})
        self.assertEqual({row["identifier"] for row in dairy.data["results"]},{"C1","D1"})
        self.assertEqual(self.client.get(url,{"production":"unknown"}).data["count"],1)
        result=self.post("classify",{"animals":[str(self.unknown.pk)],"purpose":"dairy"})
        self.assertEqual(result.status_code,200,result.data)
        self.assertEqual(CattlePurposeChange.objects.get().previous,"unknown")
        self.assertEqual(self.client.get(url,{"production":"dairy"}).data["count"],3)
        self.post("classify",{"animals":[str(self.unknown.pk)],"purpose":"dairy"})
        self.assertEqual(CattlePurposeChange.objects.count(),1)
        summary=self.client.get("/api/v1/livestock/cattle/dairy-overview/")
        self.assertEqual(summary.data["lactating_cows"],3)

    def test_classification_is_tenant_safe_and_history_is_read_only(self):
        foreign=self.animal("FOR",farm=self.foreign)
        self.assertEqual(self.post("classify",{"animals":[str(foreign.pk)],"purpose":"beef"}).status_code,400)
        self.assertEqual(CattlePurposeChange.objects.count(),0)
        self.client.get(self.base+"purpose-history/")
        self.assertEqual(CattlePurposeChange.objects.count(),0)

    def test_transfer_preview_is_read_only_confirm_is_atomic_and_retry_is_safe(self):
        data=self.transfer_data()
        preview=self.post("transfers",data)
        self.assertEqual(preview.status_code,200,preview.data)
        self.source.refresh_from_db(); self.assertEqual(self.source.quantity,10)
        data["preview"]=False
        confirmed=self.post("transfers",data)
        self.assertEqual(confirmed.status_code,201,confirmed.data)
        self.source.refresh_from_db(); self.destination.refresh_from_db()
        self.assertEqual((self.source.quantity,self.destination.quantity),(7,8))
        self.assertEqual(self.source.purchase_value,700)
        self.assertEqual(self.destination.purchase_value,1050)
        self.assertAlmostEqual(float(self.destination.avg_weight_kg),362.5)
        self.post("transfers",data)
        self.assertEqual(CattleTransfer.objects.count(),1)
        self.source.refresh_from_db(); self.assertEqual(self.source.quantity,7)
        self.assertEqual(self.post("transfers",{**data,"quantity":4}).status_code,400)

    def test_transfer_invalid_destinations_and_dates_do_not_change_balances(self):
        foreign=self.batch("OTHER",farm=self.foreign)
        for changes in [{"destination":str(foreign.pk)},{"quantity":11},{"destination":str(self.source.pk)},{"date":str(self.today-timedelta(days=1))}]:
            result=self.post("transfers",self.transfer_data(**changes))
            self.assertEqual(result.status_code,400,result.data)
        self.source.refresh_from_db(); self.assertEqual(self.source.quantity,10)
        self.assertEqual(CattleTransfer.objects.count(),0)

    def test_identified_transfer_requires_exact_participants(self):
        animal=self.animal("MOV",batch=self.source,category="Garrote",gender="M",cattle_purpose="beef")
        self.assertEqual(self.post("transfers",self.transfer_data(quantity=1)).status_code,400)
        result=self.post("transfers",self.transfer_data(quantity=1,animals=[str(animal.pk)],preview=False))
        self.assertEqual(result.status_code,201,result.data)
        animal.refresh_from_db(); self.assertEqual(animal.batch_id,self.destination.pk)

    def test_occurrence_creates_assigned_agenda_task_and_resolves_once(self):
        result=self.post("occurrences",{"farm":str(self.farm.pk),"animal":str(self.cow.pk),"kind":"water","date":str(self.today),"due_date":str(self.today+timedelta(days=1)),"assigned_to":str(self.user.pk),"description":"Reparar bebedouro"})
        self.assertEqual(result.status_code,201,result.data)
        task=Task.objects.get(pk=result.data["task"])
        self.assertEqual(task.organization_id,self.org.pk)
        self.assertEqual(task.assigned_to_id,self.user.pk)
        resolved=self.post("resolve-occurrence",{"id":result.data["id"],"resolution":"Bebedouro reparado"})
        self.assertEqual(resolved.status_code,200,resolved.data)
        task.refresh_from_db();self.assertEqual(task.status,"done")
        self.post("resolve-occurrence",{"id":result.data["id"],"resolution":"Reenvio"})
        self.assertEqual(Task.objects.count(),1)
        self.assertEqual(CattleOccurrence.objects.get().resolution,"Bebedouro reparado")

    def test_occurrence_rejects_foreign_member_and_animal(self):
        other=get_user_model().objects.create_user(email="foreign-improvements@example.invalid",password="test",organization=self.foreign.organization)
        data={"farm":str(self.farm.pk),"kind":"other","date":str(self.today),"due_date":str(self.today),"assigned_to":str(other.pk),"description":"Teste"}
        self.assertEqual(self.post("occurrences",data).status_code,400)
        self.assertEqual(Task.objects.count(),0)

    def import_row(self, identifier="IMPORT-1"):
        return {"identifier":identifier,"name":"Estrela","gender":"F","category":"Vaca","entry_date":str(self.today),"cattle_purpose":"dairy"}

    def test_import_preview_has_no_side_effects_and_confirm_cannot_duplicate(self):
        data={"farm":str(self.farm.pk),"rows":[self.import_row()]}
        preview=self.post("import-preview",data)
        self.assertEqual(preview.status_code,200,preview.data)
        self.assertTrue(preview.data["rows"][0]["valid"])
        self.assertFalse(Animal.objects.filter(identifier="IMPORT-1").exists())
        result=self.post("import-confirm",data)
        self.assertEqual(result.status_code,201,result.data)
        self.assertEqual(self.post("import-confirm",data).status_code,400)
        self.assertEqual(Animal.objects.filter(identifier="IMPORT-1").count(),1)

    def test_import_invalid_line_rolls_back_whole_file(self):
        row=self.import_row("BAD");row["gender"]="invalid"
        result=self.post("import-confirm",{"farm":str(self.farm.pk),"rows":[self.import_row(),row]})
        self.assertEqual(result.status_code,400,result.data)
        self.assertFalse(Animal.objects.filter(identifier="IMPORT-1").exists())
        result=self.post("import-preview",{"farm":str(self.farm.pk),"rows":[self.import_row(),self.import_row()]})
        self.assertFalse(result.data["rows"][1]["valid"])
        self.assertEqual(self.post("import-confirm",{"farm":str(self.farm.pk),"rows":[{**self.import_row(),"purchase_value":100}]}).status_code,400)

    def test_protocol_versions_snapshot_tasks_order_and_idempotency(self):
        template={"name":"Protocolo local","steps":[{"day":0,"name":"Preparação"},{"day":2,"name":"Conferência"}]}
        first=self.post("protocols",template)
        self.assertEqual(first.status_code,201,first.data)
        data={"animal":str(self.cow.pk),"protocol":first.data["id"],"start_date":str(self.today),"request_key":str(uuid4()),"assigned_to":str(self.user.pk)}
        run=self.post("start-protocol",data)
        self.assertEqual(run.status_code,201,run.data)
        self.post("start-protocol",data)
        self.assertEqual(Task.objects.count(),2)
        second=self.post("protocols",{**template,"steps":[{"day":0,"name":"Nova preparação"}]})
        self.assertEqual(second.data["version"],2)
        steps=list(CattleProtocolStep.objects.order_by("number"))
        self.assertEqual(steps[0].task.title,"C1 · Preparação")
        self.assertEqual(self.post("execute-step",{"id":str(steps[1].pk),"date":str(self.today)}).status_code,400)
        self.assertEqual(self.post("execute-step",{"id":str(steps[0].pk),"date":str(self.today)}).status_code,200)
        self.assertEqual(self.post("execute-step",{"id":str(steps[1].pk),"date":str(self.today)}).status_code,200)
        steps[1].task.refresh_from_db();self.assertEqual(steps[1].task.status,"done")

    def management(self, lot):
        management=CattleManagement.objects.create(farm=self.farm,kind="sanitary",date=self.today,description="Aplicação coletiva",created_by=self.user,inventory_lot=lot,inventory_quantity_per_animal=2,cost_per_animal=1)
        CattleManagementEntry.objects.create(management=management,animal=self.cow)
        CattleManagementEntry.objects.create(management=management,animal=self.beef)
        return management

    def test_collective_sanitary_stock_is_consumed_once_and_costs_not_duplicated(self):
        lot=self.lot();management=self.management(lot)
        confirm_cattle_management(management,self.user)
        confirm_cattle_management(management,self.user)
        lot.refresh_from_db();self.assertEqual(lot.quantidade_atual,96)
        self.assertEqual(MovimentacaoEstoque.objects.filter(lote=lot).count(),1)
        self.assertEqual(HealthRecord.objects.filter(cattle_management=management).count(),2)
        result=self.client.get(self.base+"costs/",{"start":str(self.today),"end":str(self.today)})
        self.assertEqual(result.status_code,200,result.data)
        self.assertEqual(Decimal(result.data["operational_total"]),10)
        self.assertEqual(len(result.data["entries"]),2)

    def test_expired_insufficient_or_foreign_sanitary_lot_rolls_back(self):
        for changes in [{"data_validade":self.today-timedelta(days=1)},{"quantidade_atual":1}]:
            lot=self.lot(**changes);management=self.management(lot)
            with self.assertRaises(ValidationError):confirm_cattle_management(management,self.user)
            lot.refresh_from_db();self.assertEqual(lot.quantidade_atual,changes.get("quantidade_atual",100))
        self.assertEqual(HealthRecord.objects.count(),0)
        self.assertEqual(MovimentacaoEstoque.objects.count(),0)

    def test_milk_trends_sessions_drop_and_missing_days_are_not_zero(self):
        for days,liters in [(3,20),(2,10)]:
            CattleMilkRecord.objects.create(animal=self.cow,date=self.today-timedelta(days=days),session="morning",liters=liters)
        result=self.client.get(self.base+"milk-trends/",{"animal":str(self.cow.pk),"drop_percent":30})
        self.assertEqual(result.status_code,200,result.data)
        self.assertEqual(len(result.data["series"]),2)
        self.assertEqual(result.data["produced"],30)
        self.assertEqual(result.data["drop_alert"]["drop_percent"],50)
        self.assertEqual(self.client.get(self.base+"milk-trends/",{"drop_percent":60}).data["drop_alert"],None)
        CattleMilkRecord.objects.filter(date=self.today-timedelta(days=2)).update(date=self.today-timedelta(days=1))
        self.assertEqual(self.client.get(self.base+"milk-trends/").data["drop_alert"],None)

    def test_milk_trends_total_mode_does_not_invent_session_or_animal_allocation(self):
        CattleMilkDailyTotal.objects.create(farm=self.farm,date=self.today,liters=500)
        data=self.client.get(self.base+"milk-trends/").data
        self.assertEqual(data["produced"],500)
        self.assertEqual(data["sessions"],[])
        self.assertEqual(data["series"][0]["milked_cows"],None)
        self.assertEqual(self.client.get(self.base+"milk-trends/",{"animal":str(self.cow.pk)}).data["series"],[])

    def test_operator_scope_read_only_and_financial_permissions(self):
        self.user.role="operator";self.user.save(update_fields=["role"])
        self.assertEqual(self.client.get(self.base+"occurrences/").status_code,403)
        self.user.allowed_livestock.add(self.species)
        self.assertEqual(self.client.get(self.base+"occurrences/").status_code,200)
        self.assertEqual(self.client.get(self.base+"costs/").status_code,403)
        self.assertEqual(self.client.get(self.base+"transfers/").status_code,403)
        self.assertEqual(self.post("classify",{"animals":[str(self.cow.pk)],"purpose":"beef"}).status_code,403)
        self.assertEqual(self.post("transfers",self.transfer_data()).status_code,403)
        self.user.operator_read_only=True;self.user.save(update_fields=["operator_read_only"])
        self.assertEqual(self.post("occurrences",{}).status_code,403)

    def test_agenda_generated_tasks_must_be_resolved_at_origin(self):
        created=self.post("occurrences",{"farm":str(self.farm.pk),"kind":"other","date":str(self.today),"due_date":str(self.today),"assigned_to":str(self.user.pk),"description":"Conferir cerca"})
        task_id=created.data["task"]
        detail=self.client.get(f"/api/v1/tasks/{task_id}/")
        self.assertEqual(detail.status_code,200,detail.data)
        self.assertIn("occurrences",detail.data["operational_link"])
        self.assertEqual(self.client.patch(f"/api/v1/tasks/{task_id}/",{"status":"done"},format="json").status_code,400)
        self.assertEqual(self.client.delete(f"/api/v1/tasks/{task_id}/").status_code,403)

    def test_operator_cannot_assign_an_occurrence_to_other_members(self):
        member=get_user_model().objects.create_user(email="other-member@example.invalid",password="test",organization=self.org,role="manager")
        self.user.role="operator";self.user.save(update_fields=["role"]);self.user.allowed_livestock.add(self.species)
        result=self.post("occurrences",{"farm":str(self.farm.pk),"kind":"other","date":str(self.today),"due_date":str(self.today),"assigned_to":str(member.pk),"description":"Teste"})
        self.assertEqual(result.status_code,403,result.data)
        self.assertEqual(Task.objects.count(),0)

    def test_transfer_rejects_stale_preview_balances(self):
        result=self.post("transfers",self.transfer_data(preview=False,expected_source=9))
        self.assertEqual(result.status_code,400,result.data)
        self.source.refresh_from_db();self.assertEqual(self.source.quantity,10)
        self.assertEqual(CattleTransfer.objects.count(),0)

    def test_pasture_move_closes_and_opens_once_or_rolls_back(self):
        from apps.livestock.models import CattlePasture,CattleGrazing
        origin=CattlePasture.objects.create(farm=self.farm,name="Pasto A",area_ha=10)
        target=CattlePasture.objects.create(farm=self.farm,name="Pasto B",area_ha=10)
        current=CattleGrazing.objects.create(batch=self.source,pasture=origin,entry_date=self.today-timedelta(days=5))
        data={"batch":str(self.source.pk),"pasture":str(target.pk),"reason":"Rotação de pasto","request_key":str(uuid4()),"preview":True}
        preview=self.post("move-pasture",data)
        self.assertEqual(preview.status_code,200,preview.data)
        current.refresh_from_db();self.assertIsNone(current.exit_date)
        data.update(preview=False,expected_source=str(origin.pk))
        moved=self.post("move-pasture",data)
        self.assertEqual(moved.status_code,200,moved.data)
        self.assertEqual(CattleGrazing.objects.filter(batch=self.source,exit_date__isnull=True).get().pasture_id,target.pk)
        self.post("move-pasture",data)
        self.assertEqual(CattleGrazing.objects.filter(batch=self.source).count(),2)

    def test_protocol_semen_consumption_links_mating_and_is_not_repeated(self):
        from apps.livestock.models import Mating
        protocol=self.post("protocols",{"name":"Aplicação", "steps":[{"day":0,"name":"Inseminação"}]})
        self.post("start-protocol",{"animal":str(self.cow.pk),"protocol":protocol.data["id"],"start_date":str(self.today),"request_key":str(uuid4()),"assigned_to":str(self.user.pk)})
        step=CattleProtocolStep.objects.get()
        mating=Mating.objects.create(female=self.cow,mating_date=self.today,mating_type="ai")
        lot=self.lot(category="semen")
        data={"id":str(step.pk),"date":str(self.today),"mating":str(mating.pk),"inventory_lot":str(lot.pk),"inventory_quantity":"1"}
        result=self.post("execute-step",data)
        self.assertEqual(result.status_code,200,result.data)
        self.post("execute-step",data)
        lot.refresh_from_db();self.assertEqual(lot.quantidade_atual,99)
        self.assertEqual(MovimentacaoEstoque.objects.filter(lote=lot).count(),1)
        step.refresh_from_db();self.assertEqual(step.mating_id,mating.pk)

    def test_financial_expenses_are_separate_from_stock_costs(self):
        from apps.finance.models import FinancialCategory,Transaction
        category=FinancialCategory.objects.create(organization=self.org,name="Produto sanitário",category_type="expense")
        Transaction.objects.create(organization=self.org,category=category,animal_batch=self.source,farm=self.farm,description="Compra de medicamento",amount=200,due_date=self.today)
        lot=self.lot();management=self.management(lot)
        confirm_cattle_management(management,self.user)
        data=self.client.get(self.base+"costs/").data
        self.assertEqual(Decimal(data["operational_total"]),10)
        self.assertEqual(Decimal(data["expenses_by_due_date"]),200)
        self.assertEqual(len(data["expenses"]),1)

    def test_product_withdrawal_configuration_is_respected(self):
        lot=self.lot();lot.item.carencia_dias=5;lot.item.save(update_fields=["carencia_dias"])
        management=self.management(lot)
        with self.assertRaises(ValidationError):confirm_cattle_management(management,self.user)
        lot.refresh_from_db();self.assertEqual(lot.quantidade_atual,100)
        management.milk_withdrawal_until=self.today+timedelta(days=5)
        management.meat_withdrawal_until=self.today+timedelta(days=5)
        management.save()
        result=confirm_cattle_management(management,self.user)
        self.assertEqual(result.status,"confirmed")

    def test_batch_classification_keeps_identified_participants_consistent(self):
        animal=self.animal("LINKED",batch=self.source,cattle_purpose="beef")
        result=self.post("classify",{"animals":[str(animal.pk)],"purpose":"dairy"})
        self.assertEqual(result.status_code,400,result.data)
        result=self.post("classify",{"batches":[str(self.source.pk)],"purpose":"dairy"})
        self.assertEqual(result.status_code,200,result.data)
        self.source.refresh_from_db();animal.refresh_from_db()
        self.assertEqual(self.source.cattle_purpose,"dairy")
        self.assertEqual(animal.cattle_purpose,"dairy")
        self.assertEqual(CattlePurposeChange.objects.filter(animal=animal).count(),1)
        self.assertEqual(CattlePurposeChange.objects.filter(batch=self.source).count(),1)

    def test_cost_allocation_reconciles_cents_across_participants(self):
        from apps.livestock.cattle_analytics import allocated_cost
        participants=["a","b","c"]
        shares=[allocated_cost(Decimal("0.01"),participants,[pk]) for pk in participants]
        self.assertEqual(sum(shares),Decimal("0.01"))
        self.assertEqual(shares,[Decimal(".01"),Decimal(0),Decimal(0)])
        self.assertIsNone(allocated_cost(None,participants,["a"]))

    def test_unknown_material_price_does_not_hide_known_service_cost(self):
        lot=self.lot(custo_unitario=None)
        management=self.management(lot)
        confirm_cattle_management(management,self.user)
        report=self.client.get(self.base+"costs/").data
        self.assertEqual(Decimal(report["operational_total"]),2)
        self.assertEqual(report["missing_cost_count"],1)
        self.assertEqual(len(report["entries"]),2)

    def test_reports_do_not_leak_other_tenants_and_validate_period(self):
        foreign=self.animal("FOR",farm=self.foreign)
        CattleMilkRecord.objects.create(animal=foreign,date=self.today,session="morning",liters=999)
        self.assertEqual(self.client.get(self.base+"milk-trends/").data["produced"],0)
        self.assertEqual(self.client.get(self.base+"milk-trends/",{"farm":str(self.foreign.pk)}).status_code,400)
        self.assertEqual(self.client.get(self.base+"costs/",{"start":"invalid"}).status_code,400)

    def test_navigation_links_follow_dairy_sources_and_expose_read_only_purpose(self):
        response=self.post("occurrences",{"farm":str(self.farm.pk),"animal":str(self.cow.pk),"kind":"animal","date":str(self.today),"description":"Conferir vaca leiteira","assigned_to":str(self.user.pk),"due_date":str(self.today)})
        self.assertEqual(response.status_code,201,response.data)
        occurrence=CattleOccurrence.objects.get(pk=response.data["id"])
        task=self.client.get(f"/api/v1/tasks/{occurrence.task_id}/")
        self.assertEqual(task.data["operational_link"],"/home/seguimento/pecuaria-leiteira/operacoes?tab=occurrences")
        animal=self.client.get(f"/api/v1/livestock/animals/{self.cow.pk}/")
        self.assertEqual(animal.data["cattle_purpose"],"dairy")
        from apps.finance.models import Transaction
        from apps.finance.serializers import TransactionSerializer
        title=Transaction.objects.get(reference=f"PURCHASE-BATCH-{self.source.pk}")
        self.assertEqual(TransactionSerializer(title).data["animal_batch_purpose"],"beef")

    def test_feeding_and_trough_reports_keep_segment_farm_and_tenant_scope(self):
        from apps.inventory.models import ConsumoRacao
        from apps.livestock.models import CattleTroughReading, HistoricoEvento
        dairy=self.batch("MILK-FEED",quantity=5,cattle_purpose="dairy")
        foreign=self.batch("FOREIGN-FEED",quantity=5,cattle_purpose="dairy",farm=self.foreign)
        item=ItemEstoque.objects.create(organization=self.org,nome="Ração",categoria="racao",unidade_medida="kg")
        for batch in [self.source,dairy,foreign]:
            ConsumoRacao.objects.create(organization=batch.farm.organization,farm=batch.farm,lote_animal=batch,item_estoque=item if batch.farm_id != self.foreign.pk else ItemEstoque.objects.create(organization=self.foreign.organization,nome="Ração externa",categoria="racao",unidade_medida="kg"),data_inicio=self.today,data_fim=self.today,quantidade=10,custo_total=20)
            CattleTroughReading.objects.create(batch=batch,date=self.today,session="morning",score=2,head_count=batch.quantity,request_key=uuid4(),created_by=self.user)
        history=HistoricoEvento.objects.count();movements=MovimentacaoEstoque.objects.count()
        for resource,identifier in [("feed","lote_codigo"),("trough-readings","batch_code")]:
            url=f"/api/v1/livestock/cattle/{resource}/"
            for production,code in [("beef",self.source.batch_code),("dairy",dairy.batch_code)]:
                result=self.client.get(url,{"production":production,"farm":str(self.farm.pk),"page_size":1})
                self.assertEqual(result.status_code,200,result.data)
                self.assertEqual(result.data["count"],1)
                self.assertEqual(result.data["results"][0][identifier],code)
            self.assertEqual(self.client.get(url,{"production":"dairy","farm":str(self.foreign.pk)}).data["count"],0)
            self.assertEqual(self.client.get(url,{"production":"invalid"}).status_code,400)
        self.assertEqual(HistoricoEvento.objects.count(),history)
        self.assertEqual(MovimentacaoEstoque.objects.count(),movements)
