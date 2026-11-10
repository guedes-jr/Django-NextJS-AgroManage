from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest import skipUnless
from unittest.mock import patch
from datetime import timedelta
from decimal import Decimal
from uuid import uuid4
from django.db import connection, close_old_connections
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APITestCase, APIClient, APITransactionTestCase
from apps.livestock.tests import test_mobile_protocol_execution as fixture
from apps.livestock.tests import test_cattle_improvements as original
from apps.livestock.models import Mating, CattleProtocolStep
from apps.livestock.cattle_improvements import start_protocol
from apps.inventory.models import MovimentacaoEstoque
from apps.tasks.models import Task

class MobileProtocolSemenTests(APITestCase):
    base=fixture.MobileProtocolExecutionTests.base
    animal=fixture.MobileProtocolExecutionTests.animal
    batch=fixture.MobileProtocolExecutionTests.batch
    lot=original.CattleImprovementTests.lot
    def setUp(self):
        fixture.MobileProtocolExecutionTests.setUp(self)
        self.mating=Mating.objects.create(female=self.cow,mating_date=self.today,mating_type='ai')
        self.semen=self.lot(category='semen')
    def values(self):return {'farm':str(self.farm.pk),'production':'dairy','step':str(self.first.pk),'date':str(self.today),'notes':'Aplicação','mating':str(self.mating.pk),'inventory_lot':str(self.semen.pk),'inventory_quantity':'1.50','acknowledged':True}
    def post(self,kind,values):return self.client.post(self.base+kind+'/?view=mobile',values,format='json')
    def preview(self,values=None):
        r=self.post('protocol-semen-preview',values or self.values());self.assertEqual(r.status_code,200,r.data);return r.data
    def confirm(self,review):return self.post('protocol-semen-confirm',{'preview_token':review['preview_token']})
    def test_review_cost_free_atomic_consumption_and_history(self):
        with CaptureQueriesContext(connection) as captured:review=self.preview()
        self.assertNotIn('custo_unitario',' '.join(q['sql'] for q in captured));self.assertEqual(review['stock']['after'],'98.50')
        response=self.confirm(review);self.assertEqual(response.status_code,200,response.data)
        self.semen.refresh_from_db();self.first.refresh_from_db();self.assertEqual(self.semen.quantidade_atual,Decimal('98.50'))
        self.assertEqual(self.first.mating_id,self.mating.pk);self.assertEqual(self.first.inventory_cost_snapshot,Decimal('3.00'))
        self.assertEqual(MovimentacaoEstoque.objects.filter(lote=self.semen).count(),1);self.assertEqual(self.confirm(review).status_code,409)
        history=self.client.get(self.base+f'protocol-runs/{self.run.pk}/mobile/',{'farm':str(self.farm.pk),'production':'dairy'}).data['steps'][0]
        self.assertEqual(history['mating']['id'],str(self.mating.pk));self.assertEqual(history['stock']['quantity'],'1.50');self.assertNotIn('cost',str(response.data))
    def test_link_without_stock_does_not_create_mating_or_movement(self):
        review=self.preview({**self.values(),'inventory_lot':None,'inventory_quantity':None});self.assertIsNone(review['stock'])
        self.assertEqual(self.confirm(review).status_code,200);self.assertEqual(Mating.objects.count(),1);self.assertEqual(MovimentacaoEstoque.objects.count(),0)
    def test_catalog_scope_date_balance_and_expiry_without_prices(self):
        query={**self.values(),'view':'mobile'}
        r=self.client.get(self.base+'protocol-semen-matings/',query);self.assertEqual(r.status_code,200,r.data);self.assertEqual(r.data['count'],1)
        self.assertEqual(self.client.get(self.base+'protocol-semen-lots/',query).data['count'],1)
        self.assertEqual(self.client.get(self.base+'protocol-semen-lots/',{**query,'search':'absent'}).data['count'],0)
        self.semen.data_validade=self.today-timedelta(days=1);self.semen.save();self.assertEqual(self.client.get(self.base+'protocol-semen-lots/',query).data['count'],0)
        self.assertEqual(self.post('protocol-semen-preview',self.values()).status_code,400)
        self.assertEqual(self.client.get(self.base+'protocol-semen-matings/',{**query,'farm':str(self.foreign.pk)}).status_code,404)
    def test_strict_input_quantity_mating_and_foreign_scope(self):
        wrong=Mating.objects.create(female=self.beef,mating_date=self.today,mating_type='ai')
        for changes,code in [({'inventory_quantity':'0'},400),({'inventory_quantity':'0.001'},400),({'inventory_quantity':'101'},400),({'inventory_lot':None},400),({'acknowledged':False},400),({'cost':10},400),({'mating':str(wrong.pk)},404),({'date':str(self.today+timedelta(days=1))},400),({'production':'beef'},404)]:
            self.assertEqual(self.post('protocol-semen-preview',{**self.values(),**changes}).status_code,code)
    def test_balance_unit_and_mating_changes_invalidate_signed_review(self):
        review=self.preview();self.semen.quantidade_atual=99;self.semen.save();self.assertEqual(self.confirm(review).status_code,409)
        review=self.preview();item=self.semen.item;item.unidade_medida='ml';item.save();self.assertEqual(self.confirm(review).status_code,409)
        review=self.preview();self.mating.notes='Changed';self.mating.save();self.assertEqual(self.confirm(review).status_code,409)
        self.assertFalse(MovimentacaoEstoque.objects.exists())
    def test_operator_ownership_readonly_signature_and_actor(self):
        from apps.accounts.models import User
        review=self.preview();other=User.objects.create_user(email='semen-executor@example.invalid',password='test',organization=self.org,role='operator');other.allowed_livestock.add(self.species);self.client.force_authenticate(other)
        self.assertEqual(self.post('protocol-semen-preview',self.values()).status_code,403);self.assertEqual(self.confirm(review).status_code,403)
        self.first.task.assigned_to=other;self.first.task.save();review=self.preview();other.operator_read_only=True;other.save();self.assertEqual(self.confirm(review).status_code,403)
        self.client.force_authenticate(self.user);review=self.preview();self.assertEqual(self.confirm({**review,'preview_token':review['preview_token']+'x'}).status_code,400)
    def test_task_failure_rolls_back_stock_link_and_execution(self):
        review=self.preview()
        with patch.object(Task,'save',side_effect=RuntimeError('synthetic')):self.assertEqual(self.confirm(review).status_code,500)
        self.semen.refresh_from_db();self.first.refresh_from_db();self.assertEqual(self.semen.quantidade_atual,100);self.assertIsNone(self.first.executed_at);self.assertIsNone(self.first.mating_id);self.assertFalse(MovimentacaoEstoque.objects.exists())

@skipUnless(connection.vendor=='postgresql','PostgreSQL row locks required')
class ProtocolSemenConcurrencyTests(APITransactionTestCase):
    base=MobileProtocolSemenTests.base
    animal=MobileProtocolSemenTests.animal
    batch=MobileProtocolSemenTests.batch
    lot=MobileProtocolSemenTests.lot
    setUp=MobileProtocolSemenTests.setUp
    values=MobileProtocolSemenTests.values
    post=MobileProtocolSemenTests.post
    preview=MobileProtocolSemenTests.preview
    def race(self,legacy=False,shared=False):
        values=self.values()
        if shared:
            self.semen.quantidade_atual=2;self.semen.save()
        first=self.preview(values);second=first
        if shared:
            cow=self.animal('Second',cattle_purpose='dairy');mating=Mating.objects.create(female=cow,mating_date=self.today,mating_type='ai')
            run=start_protocol(self.user,animal=cow,protocol=self.protocol,start_date=self.today,request_key=uuid4(),assigned_to=self.user)
            second=self.preview({**values,'step':str(run.executions.order_by('number').first().pk),'mating':str(mating.pk)})
        gate=Barrier(2)
        def send(index):
            close_old_connections()
            try:
                client=APIClient();client.force_authenticate(self.user);gate.wait(timeout=10)
                if legacy and index:return client.post(self.base+'execute-step/',{'id':str(self.first.pk),'date':str(self.today),'mating':str(self.mating.pk),'inventory_lot':str(self.semen.pk),'inventory_quantity':'1.50'},format='json').status_code
                return client.post(self.base+'protocol-semen-confirm/?view=mobile',{'preview_token':(second if index else first)['preview_token']},format='json').status_code
            finally:close_old_connections()
        with ThreadPoolExecutor(max_workers=2) as pool:result=sorted(pool.map(send,[0,1]))
        self.assertIn(result,[[200,200],[200,409]] if legacy else [[200,409]])
        self.assertEqual(MovimentacaoEstoque.objects.count(),1);self.semen.refresh_from_db();self.assertEqual(self.semen.quantidade_atual,Decimal('.50') if shared else Decimal('98.50'))
    def test_duplicate_confirmation_consumes_once(self):self.race()
    def test_native_legacy_consume_once(self):self.race(legacy=True)
    def test_shared_lot_cannot_be_overspent(self):self.race(shared=True)
