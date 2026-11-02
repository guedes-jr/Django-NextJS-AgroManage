from decimal import Decimal
from datetime import timedelta
from uuid import uuid4
from rest_framework.test import APITestCase
from . import test_cattle_improvements as fixtures
from apps.livestock.models import HistoricoEvento
from apps.inventory.models import ItemEstoque, ConsumoRacao, MovimentacaoEstoque
from apps.finance.models import Transaction


class CattleReportAlignmentTests(APITestCase):
    setUp = fixtures.CattleImprovementTests.setUp
    batch = fixtures.CattleImprovementTests.batch
    animal = fixtures.CattleImprovementTests.animal
    lot = fixtures.CattleImprovementTests.lot

    def command(self, batch, action, **data):
        return self.client.post(f"/api/v1/livestock/cattle/batches/{batch.pk}/{action}/", data, format="json")

    def test_reference_cycle_reconciles_cost_revenue_and_mortality(self):
        batch = self.batch("ENG", quantity=30, purchase_value=71400)
        HistoricoEvento.objects.create(farm=self.farm,lote=batch,tipo_evento="Entrada de Lote",data_evento=batch.entry_date,metadata={"quantidade":30})
        item=ItemEstoque.objects.create(organization=self.org,nome="Alimentação",categoria="nucleo",unidade_medida="kg")
        ConsumoRacao.objects.create(organization=self.org,farm=self.farm,lote_animal=batch,item_estoque=item,data_inicio=batch.entry_date,data_fim=batch.entry_date,quantidade=1,custo_total=28715)
        result=self.command(batch,"registrar-mortalidade",quantity=1,date=str(self.today),reason="Ocorrência",request_key=str(uuid4()))
        self.assertEqual(result.status_code,201,result.data)
        sale=self.command(batch,"register-sale",mode="whole",date=str(self.today),buyer="Comprador",weight_kg="12557",price_per_kg="11.09")
        self.assertEqual(sale.status_code,201,sale.data)
        response=self.client.get(f"/api/v1/livestock/cattle/batches/{batch.pk}/economic-result/")
        self.assertEqual(response.status_code,200,response.data)
        self.assertEqual(Decimal(response.data["total_cost"]),Decimal("100115"))
        self.assertEqual(Decimal(response.data["net_revenue"]),Decimal("139257.13"))
        self.assertEqual(Decimal(response.data["result"]),Decimal("39142.13"))
        self.assertEqual((response.data["sold_head"],response.data["deaths"],response.data["remaining_head"]),(29,1,0))
        self.assertEqual(Transaction.objects.get(reference=f"SALE-BATCH-{batch.pk}").status,"pending")

    def test_death_retry_and_late_death_close_remaining_without_fake_sale(self):
        self.command(self.source,"register-sale",mode="partial",quantity=9,date=str(self.today),buyer="Cliente",weight_kg="900",price_per_kg="10")
        key=str(uuid4())
        for _ in range(2):
            result=self.command(self.source,"registrar-mortalidade",quantity=1,date=str(self.today-timedelta(days=1)),reason="Morte anterior",request_key=key)
            self.assertEqual(result.status_code,201,result.data)
        self.source.refresh_from_db()
        self.assertEqual((self.source.quantity,self.source.status),(0,"finished"))
        self.assertEqual(self.source.historicos.filter(tipo_evento="Mortalidade de Lote").count(),1)
        self.assertEqual(Transaction.objects.filter(animal_batch=self.source,category__category_type="revenue").count(),1)

    def test_carcass_calculation_keeps_precision_and_net_payable(self):
        result=self.command(self.source,"register-sale",mode="whole",date=str(self.today),buyer="Frigorífico",weight_kg="12557",pricing_basis="carcass_arroba",yield_percent="52",price_per_arroba="320",deductions="100",deduction_description="Frete",slaughter_reference="ROM-1")
        self.assertEqual(result.status_code,201,result.data)
        gross=(Decimal("12557")*Decimal(".52")/15*320).quantize(Decimal(".01"))
        self.assertEqual(Decimal(result.data["gross_amount"]),gross)
        self.assertEqual(Decimal(result.data["amount"]),gross-100)
        summary=self.client.get(f"/api/v1/livestock/cattle/batches/{self.source.pk}/economic-result/").data
        self.assertTrue(summary["carcass_estimated"])

    def test_dates_tenant_and_cost_permissions(self):
        self.assertEqual(self.command(self.source,"registrar-mortalidade",quantity=1,date=str(self.today+timedelta(days=1)),reason="Futura",request_key=str(uuid4())).status_code,400)
        foreign=self.batch("FOREIGN",farm=self.foreign,quantity=1)
        self.assertEqual(self.command(foreign,"record-cost",date=str(self.today),amount="10",category="other",description="Custo",request_key=str(uuid4())).status_code,404)
        self.user.role="operator";self.user.save();self.user.allowed_livestock.add(self.species)
        self.assertEqual(self.command(self.source,"record-cost",date=str(self.today),amount="10",category="other",description="Custo",request_key=str(uuid4())).status_code,403)

    def test_collective_treatment_stock_carencia_and_retry(self):
        lot=self.lot()
        lot.item.carencia_dias=5;lot.item.save()
        data=dict(date=str(self.today),quantity=10,description="Vermifugação",inventory_lot=str(lot.pk),quantity_per_head="2",service_cost="50",request_key=str(uuid4()))
        before=MovimentacaoEstoque.objects.count()
        for _ in range(2):
            result=self.command(self.source,"record-treatment",**data)
            self.assertEqual(result.status_code,201,result.data)
        lot.refresh_from_db();self.assertEqual(lot.quantidade_atual,80)
        self.assertEqual(MovimentacaoEstoque.objects.count(),before+1)
        sale=self.command(self.source,"register-sale",mode="whole",date=str(self.today),buyer="Cliente",weight_kg="1000",price_per_kg="10")
        self.assertEqual(sale.status_code,400,sale.data)
        summary=self.client.get(f"/api/v1/livestock/cattle/batches/{self.source.pk}/economic-result/").data
        self.assertEqual(Decimal(summary["operational_cost"]),Decimal(90))

    def test_operational_update_preserves_negotiated_purchase_due_date_and_amount(self):
        title=Transaction.objects.get(reference=f"PURCHASE-BATCH-{self.source.pk}")
        title.due_date=self.today+timedelta(days=60);title.save()
        self.source.purchase_value=700;self.source.save()
        title.refresh_from_db()
        self.assertEqual(title.amount,1000)
        self.assertEqual(title.due_date,self.today+timedelta(days=60))

    def test_cost_is_appended_once(self):
        data=dict(date=str(self.today),amount="125",category="pasture",description="Arrendamento",request_key=str(uuid4()))
        for _ in range(2):
            self.assertEqual(self.command(self.source,"record-cost",**data).status_code,201)
        result=self.client.get(f"/api/v1/livestock/cattle/batches/{self.source.pk}/economic-result/").data
        self.assertEqual(Decimal(result["total_cost"]),1125)
        self.assertEqual(len(result["entries"]),1)
        self.assertEqual(Transaction.objects.filter(animal_batch=self.source,category__category_type="expense").count(),1)

    def test_report_yield_produces_reference_cost_per_arroba_without_changing_sale(self):
        batch=self.batch("REPORT",quantity=29,purchase_value=100115)
        self.command(batch,"register-sale",mode="whole",date=str(self.today),buyer="Comprador",weight_kg="12557",price_per_kg="11.09")
        url=f"/api/v1/livestock/cattle/batches/{batch.pk}/economic-result/"
        self.assertIsNone(self.client.get(url).data["cost_per_arroba"])
        result=self.client.get(url,{"yield_percent":"52"})
        self.assertEqual(result.status_code,200,result.data)
        self.assertEqual(Decimal(result.data["cost_per_arroba"]),Decimal(100115)/(Decimal(12557)*Decimal(".52")/15))
        self.assertEqual(batch.historicos.filter(tipo_evento="Venda de Animais").count(),1)
        self.assertEqual(self.client.get(url,{"yield_percent":"101"}).status_code,400)

    def test_supplement_and_receipt_chronology(self):
        from apps.inventory.models import LoteEstoque
        item=ItemEstoque.objects.create(organization=self.org,nome="Proteinado",categoria="nucleo",unidade_medida="kg",especie_animal="bovino")
        lot=LoteEstoque.objects.create(item=item,numero_lote="SUP",data_entrada=self.today-timedelta(days=10),quantidade_inicial=100,quantidade_atual=100,custo_unitario=2)
        data=dict(lote_animal=str(self.source.pk),item_estoque=str(item.pk),data_inicio=str(self.today),data_fim=str(self.today),quantidade="10",tipo_registro="total_periodo")
        response=self.client.post("/api/v1/livestock/cattle/feed/",data,format="json")
        self.assertEqual(response.status_code,201,response.data)
        lot.refresh_from_db();self.assertEqual(lot.quantidade_atual,90)
        data.update(data_inicio=str(self.today-timedelta(days=11)),data_fim=str(self.today-timedelta(days=11)))
        self.assertEqual(self.client.post("/api/v1/livestock/cattle/feed/",data,format="json").status_code,400)
        lot.refresh_from_db();self.assertEqual(lot.quantidade_atual,90)

    def test_purchase_due_date_input_and_weight_snapshot(self):
        data=dict(farm_id=str(self.farm.pk),batch_code="BUY",category="Garrote",phase="crescimento",quantity=30,gender="M",origin="purchased",purchase_value="71400",entry_date=str(self.today-timedelta(days=60)),purchase_due_date=str(self.today+timedelta(days=30)),avg_weight_kg="210")
        result=self.client.post("/api/v1/livestock/cattle/batches/",data,format="json")
        self.assertEqual(result.status_code,201,result.data)
        title=Transaction.objects.get(reference=f"PURCHASE-BATCH-{result.data['id']}")
        self.assertEqual(title.due_date,self.today+timedelta(days=30))
        event=HistoricoEvento.objects.get(lote_id=result.data["id"],tipo_evento="Entrada de Lote")
        self.assertEqual(Decimal(event.metadata["peso_medio_entrada"]),210)

    def test_stock_receipt_past_date_and_future_rejection(self):
        from apps.inventory.models import LoteEstoque
        item=ItemEstoque.objects.create(organization=self.org,nome="Sal",categoria="nucleo",unidade_medida="kg")
        data=dict(item=str(item.pk),tipo="compra",quantidade="20",numero_lote="RETRO",custo_unitario="2",farm=str(self.farm.pk),data_entrada=str(self.today-timedelta(days=30)))
        result=self.client.post("/api/v1/inventory/movimentacoes/",data,format="json")
        self.assertEqual(result.status_code,201,result.data)
        self.assertEqual(LoteEstoque.objects.get(pk=result.data["lote"]).data_entrada,self.today-timedelta(days=30))
        data.update(numero_lote="FUTURE",data_entrada=str(self.today+timedelta(days=1)))
        self.assertEqual(self.client.post("/api/v1/inventory/movimentacoes/",data,format="json").status_code,400)

    def test_dated_weighings_calculate_gmd_without_inventing_missing_weights(self):
        from apps.livestock.models import WeightRecord
        WeightRecord.objects.create(farm=self.farm,species=self.species,batch=self.source,weight_kg=300,weighing_date=self.today-timedelta(days=20))
        WeightRecord.objects.create(farm=self.farm,species=self.species,batch=self.source,weight_kg=310,weighing_date=self.today-timedelta(days=10))
        result=self.client.get(f"/api/v1/livestock/cattle/batches/{self.source.pk}/economic-result/").data
        self.assertEqual(Decimal(result["daily_weight_gain"]),1)
        self.assertEqual(result["weight_intervals"][0]["days"],10)

    def test_phase_change_confirms_category_and_records_author(self):
        result=self.command(self.source,"change-phase",phase="engorda",category="Terminação",date=str(self.today),notes="Entrada na terminação")
        self.assertEqual(result.status_code,200,result.data)
        self.source.refresh_from_db();self.assertEqual(self.source.category,"Terminação")
        event=self.source.historicos.get(tipo_evento="Categoria de Lote")
        self.assertEqual(event.metadata["previous"],"Garrote")
        self.assertEqual(event.metadata["author"],str(self.user.pk))

    def test_expired_collective_treatment_never_consumes_stock(self):
        lot=self.lot(data_validade=self.today-timedelta(days=1))
        data=dict(date=str(self.today),quantity=10,description="Aplicação",inventory_lot=str(lot.pk),quantity_per_head="2",request_key=str(uuid4()))
        result=self.command(self.source,"record-treatment",**data)
        self.assertEqual(result.status_code,400,result.data)
        lot.refresh_from_db();self.assertEqual(lot.quantidade_atual,100)
        self.assertFalse(self.source.historicos.filter(tipo_evento="Sanidade de Lote Bovino").exists())
