"""Cross-domain phase-3 acceptance and PostgreSQL row-lock concurrency checks."""
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from threading import Barrier
from unittest import skipUnless
from uuid import uuid4

from django.contrib.auth import get_user_model
from django.db import connection, connections, close_old_connections
from django.test import TransactionTestCase
from django.utils import timezone
from rest_framework.test import APITestCase, APIClient
from apps.organizations.models import Organization
from apps.farms.models import Farm
from apps.inventory.models import ItemEstoque, LoteEstoque, FormulaRacao, FormulaIngrediente, ProducaoRacao, ConsumoRacao, MovimentacaoEstoque
from apps.livestock.models import Species, AnimalBatch, HistoricoEvento
from apps.notifications.models import Notification, NotificationPreference
from apps.finance.models import Transaction


class Phase3Fixture:
    def setUp(self):
        self.org=Organization.objects.create(name='Phase 3 test',slug='phase3-integration')
        self.user=get_user_model().objects.create_user(email='phase3@example.invalid',password='test',role='manager',organization=self.org)
        self.farm=Farm.objects.create(organization=self.org,name='Test farm')
        self.today=timezone.localdate()
        self.raw=ItemEstoque.objects.create(organization=self.org,nome='Milho',categoria='outro',unidade_medida='kg')
        self.feed=ItemEstoque.objects.create(organization=self.org,nome='Ração',categoria='racao',unidade_medida='kg',especie_animal='bovino')
        self.raw_lot=self.lot(self.raw,'RAW','100')
        self.feed_lot=self.lot(self.feed,'FEED','10')
        self.formula=FormulaRacao.objects.create(organization=self.org,nome='Feed formula',item_final=self.feed,especie_animal='bovino')
        FormulaIngrediente.objects.create(formula=self.formula,item=self.raw,percentual='100')
        self.species,_=Species.objects.get_or_create(code='bovinos',defaults={'name':'Bovinos'})
        self.batch=AnimalBatch.objects.create(farm=self.farm,species=self.species,batch_code='A',quantity=10,entry_date=self.today,cattle_purpose='beef')
        self.client.force_authenticate(self.user)

    def lot(self,item,number,amount):
        obj=LoteEstoque(item=item,numero_lote=number,quantidade_inicial=amount,quantidade_atual=amount,custo_unitario='2',data_entrada=self.today)
        obj._skip_finance_transaction=True;obj.save();return obj

    def supply(self,**changes):
        return dict(dict(batch=str(self.batch.pk),farm=str(self.farm.pk),production='beef',formula=str(self.formula.pk),item=str(self.feed.pk),date=str(self.today),quantity_kg='7.00',notes='Test feeding',request_key=str(uuid4())),**changes)


class Phase3IntegrationTests(Phase3Fixture,APITestCase):
    def test_real_receipt_formula_production_feeding_inbox_and_preferences(self):
        def post(path,values,expected):
            response=self.client.post('/api/v1/'+path,values,format='json')
            self.assertEqual(response.status_code,expected,response.data);return response.data
        # Real API serializers/services/database throughout; no mocked responses.
        review=post('inventory/movimentacoes/preview/',{'item':str(self.raw.pk),'tipo':'entrada','quantidade':'3.25','unidade_esperada':'kg','numero_lote':'RECEIPT','data_entrada':str(self.today),'motivo':'Test receipt'},200)
        post('inventory/movimentacoes/confirm/',{'preview_token':review['preview_token']},201)
        formula=post('inventory/formulas/mobile-save/',{'nome':'Integration formula','especie_animal':'bovino','item_final':str(self.feed.pk),'ingredientes':[{'item':str(self.raw.pk),'percentual':'100.00'}]},201)
        review=post('inventory/producoes/mobile-preview/',{'formula':formula['id'],'quantidade_teorica':'10.00','quantidade_real':'9.50'},200)
        produced=post('inventory/producoes/mobile-confirm/',{'preview_token':review['preview_token']},201)
        self.assertTrue(LoteEstoque.objects.filter(pk=produced['lote'],quantidade_atual=Decimal('9.50')).exists())
        feeder=get_user_model().objects.create_user(email='integration-feeder@example.invalid',password='test',role='feeder',organization=self.org)
        feeder.allowed_livestock.add(self.species);self.client.force_authenticate(feeder)
        page=self.client.get('/api/v1/livestock/cattle/daily-feeding/',{'view':'mobile','production':'beef'})
        self.assertEqual(page.status_code,200,page.data);self.assertEqual(page.data['results'][0]['head_count'],10)
        payload=self.supply(formula=formula['id'],quantity_kg='5.25')
        first=post('livestock/cattle/daily-feeding/',payload,201)
        self.assertEqual(post('livestock/cattle/daily-feeding/',payload,201)['id'],first['id'])
        self.assertEqual(ConsumoRacao.objects.count(),1)
        self.assertEqual(sum(self.feed.lotes.values_list('quantidade_atual',flat=True)),Decimal('14.25'))
        self.assertEqual(sum(self.raw.lotes.values_list('quantidade_atual',flat=True)),Decimal('93.25'))
        self.assertEqual(HistoricoEvento.objects.filter(tipo_evento='Fornecimento de ração').count(),1)
        self.assertFalse(Transaction.objects.exists())
        notification=Notification.objects.create(user=feeder,title='Test receipt',message='Feed recorded',link='/home/seguimento/gado-de-corte/racao/tratos')
        other=get_user_model().objects.create_user(email='unrelated@example.invalid',password='test',role='manager',organization=self.org)
        foreign=Notification.objects.create(user=other,title='Private',message='Do not expose')
        self.assertEqual(self.client.get(f'/api/v1/notifications/{foreign.pk}/').status_code,404)
        result=self.client.patch(f'/api/v1/notifications/{notification.pk}/',{'is_read':True},format='json')
        self.assertEqual(result.status_code,200,result.data);self.assertIsNotNone(result.data['read_at'])
        preferences=self.client.get('/api/v1/notifications/preferences/').data
        result=self.client.patch('/api/v1/notifications/preferences/',{'email_notifications':False,'expected_updated_at':preferences['updated_at']},format='json')
        self.assertEqual(result.status_code,200,result.data);self.assertFalse(result.data['email_notifications'])
        for path in ['inventory/items/','finance/transactions/','tasks/agenda/']:
            self.assertEqual(self.client.get('/api/v1/'+path).status_code,403,path)


@skipUnless(connection.vendor=='postgresql','Requires explicit disposable PostgreSQL test settings')
class Phase3ConcurrencyTests(Phase3Fixture,TransactionTestCase):
    def setUp(self):
        self.client=APIClient();super().setUp()

    def parallel(self,path,payloads):
        barrier=Barrier(len(payloads));user_id=self.user.pk
        def worker(data):
            close_old_connections()
            try:
                client=APIClient();client.force_authenticate(get_user_model().objects.get(pk=user_id))
                barrier.wait(timeout=10)
                response=client.post('/api/v1/'+path,data,format='json')
                return response.status_code,response.data
            finally:
                connections.close_all()
        with ThreadPoolExecutor(max_workers=len(payloads)) as pool:
            return list(pool.map(worker,payloads))

    def test_same_key_parallel_delivery_has_one_effect(self):
        values=self.supply();results=self.parallel('livestock/cattle/daily-feeding/',[values,values])
        self.assertEqual([r[0] for r in results],[201,201],results)
        self.assertEqual(results[0][1]['id'],results[1][1]['id'])
        self.assertEqual(ConsumoRacao.objects.count(),1);self.assertEqual(MovimentacaoEstoque.objects.count(),1)
        self.feed_lot.refresh_from_db();self.assertEqual(self.feed_lot.quantidade_atual,Decimal('3'))

    def test_same_key_different_payload_does_not_mutate_twice(self):
        values=self.supply(quantity_kg='5.00');results=self.parallel('livestock/cattle/daily-feeding/',[values,{**values,'quantity_kg':'6.00'}])
        self.assertEqual(sorted(r[0] for r in results),[201,400],results)
        self.assertEqual(ConsumoRacao.objects.count(),1);self.assertEqual(MovimentacaoEstoque.objects.count(),1)

    def test_distinct_batches_compete_for_last_stock_without_negative_balance(self):
        other=AnimalBatch.objects.create(farm=self.farm,species=self.species,batch_code='B',quantity=10,entry_date=self.today,cattle_purpose='beef')
        results=self.parallel('livestock/cattle/daily-feeding/',[self.supply(),self.supply(batch=str(other.pk))])
        self.assertEqual(sorted(r[0] for r in results),[201,400],results)
        self.assertEqual(ConsumoRacao.objects.count(),1)
        self.feed_lot.refresh_from_db();self.assertEqual(self.feed_lot.quantidade_atual,Decimal('3'))

    def test_signed_stock_review_is_not_confirmed_twice(self):
        preview=self.client.post('/api/v1/inventory/movimentacoes/preview/',{'item':str(self.feed.pk),'tipo':'saida','lote':str(self.feed_lot.pk),'quantidade':'7.00','unidade_esperada':'kg','motivo':'Test withdrawal','destino':'Test'},format='json')
        self.assertEqual(preview.status_code,200,preview.data)
        values={'preview_token':preview.data['preview_token']}
        results=self.parallel('inventory/movimentacoes/confirm/',[values,values])
        self.assertEqual(sorted(r[0] for r in results),[201,409],results)
        self.assertEqual(MovimentacaoEstoque.objects.count(),1)

    def test_signed_feed_production_is_not_confirmed_twice(self):
        preview=self.client.post('/api/v1/inventory/producoes/mobile-preview/',{'formula':str(self.formula.pk),'quantidade_teorica':'7.00','quantidade_real':'7.00'},format='json')
        self.assertEqual(preview.status_code,200,preview.data)
        values={'preview_token':preview.data['preview_token']}
        results=self.parallel('inventory/producoes/mobile-confirm/',[values,values])
        self.assertEqual(sorted(r[0] for r in results),[201,409],results)
        self.assertEqual(ProducaoRacao.objects.count(),1)
        self.raw_lot.refresh_from_db();self.assertEqual(self.raw_lot.quantidade_atual,Decimal('93'))

    def test_parallel_purchase_creates_one_pending_payable(self):
        preview=self.client.post('/api/v1/inventory/movimentacoes/preview/',{'item':str(self.raw.pk),'tipo':'compra','quantidade':'3.25','unidade_esperada':'kg','numero_lote':'PURCHASE','data_entrada':str(self.today),'farm':str(self.farm.pk),'custo_unitario':'2.55','purchase_due_date':str(self.today),'motivo':'Test purchase'},format='json')
        self.assertEqual(preview.status_code,200,preview.data)
        values={'preview_token':preview.data['preview_token']}
        results=self.parallel('inventory/movimentacoes/confirm/',[values,values])
        self.assertEqual(sorted(r[0] for r in results),[201,409],results)
        self.assertEqual(Transaction.objects.count(),1)

    def test_preferences_version_allows_one_of_two_parallel_updates(self):
        preference=NotificationPreference.objects.create(user=self.user)
        version=preference.updated_at.isoformat()
        # PATCH follows the same row lock as normal preference writes.
        barrier=Barrier(2)
        def worker(changes):
            close_old_connections()
            try:
                client=APIClient();client.force_authenticate(get_user_model().objects.get(pk=self.user.pk));barrier.wait(timeout=10)
                result=client.patch('/api/v1/notifications/preferences/',{**changes,'expected_updated_at':version},format='json')
                return result.status_code,result.data
            finally:
                connections.close_all()
        with ThreadPoolExecutor(max_workers=2) as pool:
            results=list(pool.map(worker,[{'marketing_alerts':True},{'email_notifications':False}]))
        self.assertEqual(sorted(r[0] for r in results),[200,409],results)
        preference.refresh_from_db();self.assertNotEqual(preference.marketing_alerts,not preference.email_notifications)
