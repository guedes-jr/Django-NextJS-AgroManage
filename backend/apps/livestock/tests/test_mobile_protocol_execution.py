from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest import skipUnless
from unittest.mock import patch
from datetime import timedelta
from uuid import uuid4
from django.db import connection, close_old_connections
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APITestCase, APIClient, APITransactionTestCase
from apps.livestock.tests import test_mobile_protocol_start as fixtures
from apps.livestock.cattle_improvements import start_protocol
from apps.livestock.models import CattleProtocolStep, Mating
from apps.inventory.models import MovimentacaoEstoque
from apps.tasks.models import Task

class MobileProtocolExecutionTests(APITestCase):
    base=fixtures.MobileProtocolStartTests.base
    animal=fixtures.MobileProtocolStartTests.animal
    batch=fixtures.MobileProtocolStartTests.batch
    def setUp(self):
        fixtures.MobileProtocolStartTests.setUp(self)
        self.run=start_protocol(self.user,animal=self.cow,protocol=self.protocol,start_date=self.today-timedelta(days=2),request_key=uuid4(),assigned_to=self.user)
        self.first,self.second=list(self.run.executions.order_by('number'))
    def values(self):return {'farm':str(self.farm.pk),'production':'dairy','step':str(self.first.pk),'date':str(self.today),'notes':'Conferido','documentary':True}
    def post(self,kind,values):return self.client.post(self.base+kind+'/?view=mobile',values,format='json')
    def preview(self,values=None):
        r=self.post('protocol-execution-preview',values or self.values());self.assertEqual(r.status_code,200,r.data);return r.data
    def confirm(self,review):return self.post('protocol-execution-confirm',{'preview_token':review['preview_token']})
    def test_review_execution_task_and_no_financial_stock_or_mating_effects(self):
        with CaptureQueriesContext(connection) as queries:
            review=self.preview();response=self.confirm(review)
        self.assertEqual(response.status_code,200,response.data);self.assertEqual(response.data['notes'],'Conferido')
        self.first.refresh_from_db();self.first.task.refresh_from_db();self.assertEqual(self.first.task.status,'done');self.assertEqual(self.first.executed_by_id,self.user.pk)
        self.assertEqual(self.confirm(review).status_code,409)
        self.assertEqual(Mating.objects.count(),0);self.assertEqual(MovimentacaoEstoque.objects.count(),0)
        self.assertIsNone(self.first.inventory_lot_id);self.assertIsNone(self.first.mating_id)
        for field in ['inventory_cost_snapshot','purchase_value','custo_unitario']:self.assertNotIn(field,' '.join(q['sql'] for q in queries))
    def test_next_stage_unlocks_after_prior_execution(self):
        self.assertEqual(self.confirm(self.preview()).status_code,200)
        next_review=self.preview({**self.values(),'step':str(self.second.pk)})
        self.assertEqual(self.confirm(next_review).status_code,200)
        self.assertEqual(CattleProtocolStep.objects.filter(executed_at__isnull=False).count(),2)

    def test_order_dates_explicit_ack_strict_fields_and_scope(self):
        for change,code in [({'step':str(self.second.pk)},400),({'date':str(self.today+timedelta(days=1))},400),({'date':str(self.today-timedelta(days=3))},400),({'documentary':False},400),({'inventory_lot':str(uuid4())},400),({'farm':str(self.foreign.pk)},404),({'production':'beef'},404)]:
            self.assertEqual(self.post('protocol-execution-preview',{**self.values(),**change}).status_code,code)
        self.first.task.status='cancelled';self.first.task.save();self.assertEqual(self.post('protocol-execution-preview',self.values()).status_code,409)
    def test_version_and_task_assignee_changes_invalidate_context(self):
        review=self.preview();self.first.task.title='Changed';self.first.task.save();self.assertEqual(self.confirm(review).status_code,409)
        review=self.preview();self.cow.notes='Changed';self.cow.save();self.assertEqual(self.confirm(review).status_code,409)
        self.assertFalse(CattleProtocolStep.objects.filter(executed_at__isnull=False).exists())
    def test_permissions_ownership_readonly_and_read_capability(self):
        from apps.accounts.models import User
        actor=User.objects.create_user(email='executor@example.invalid',password='test',organization=self.org,role='operator')
        actor.allowed_livestock.add(self.species);self.client.force_authenticate(actor)
        self.assertEqual(self.post('protocol-execution-preview',self.values()).status_code,403)
        self.first.task.assigned_to=actor;self.first.task.save();review=self.preview()
        actor.operator_read_only=True;actor.save();self.assertEqual(self.confirm(review).status_code,403)
        query={'production':'dairy','farm':str(self.farm.pk)}
        r=self.client.get(self.base+f'protocol-runs/{self.run.pk}/mobile/',query);self.assertFalse(any(s['can_execute_documentary'] for s in r.data['steps']))
        self.client.force_authenticate(self.user);r=self.client.get(self.base+f'protocol-runs/{self.run.pk}/mobile/',query)
        self.assertEqual([s['can_execute_documentary'] for s in r.data['steps']],[True,False])
    def test_signature_actor_expiry_and_altered_payload(self):
        review=self.preview();self.assertEqual(self.confirm({**review,'preview_token':review['preview_token']+'x'}).status_code,400)
        with patch('django.core.signing.time.time',return_value=9999999999):self.assertEqual(self.confirm(review).status_code,400)
        self.assertEqual(self.post('protocol-execution-confirm',{'preview_token':review['preview_token'],'notes':'Tampered'}).status_code,400)
        from apps.accounts.models import User
        other=User.objects.create_user(email='other-executor@example.invalid',password='test',organization=self.org,role='admin');self.client.force_authenticate(other)
        self.assertEqual(self.confirm(review).status_code,403)
    def test_task_failure_rolls_back_execution(self):
        review=self.preview()
        with patch.object(Task,'save',side_effect=RuntimeError('synthetic')):self.assertEqual(self.confirm(review).status_code,500)
        self.first.refresh_from_db();self.first.task.refresh_from_db();self.assertIsNone(self.first.executed_at);self.assertEqual(self.first.task.status,'open')

@skipUnless(connection.vendor=='postgresql','PostgreSQL locking required')
class ProtocolExecutionConcurrencyTests(APITransactionTestCase):
    base=MobileProtocolExecutionTests.base
    animal=MobileProtocolExecutionTests.animal
    batch=MobileProtocolExecutionTests.batch
    setUp=MobileProtocolExecutionTests.setUp
    values=MobileProtocolExecutionTests.values
    post=MobileProtocolExecutionTests.post
    preview=MobileProtocolExecutionTests.preview
    def race(self,legacy=False):
        review=self.preview();gate=Barrier(2)
        def send(index):
            close_old_connections()
            try:
                client=APIClient();client.force_authenticate(self.user);gate.wait(timeout=10)
                if legacy and index:return client.post(self.base+'execute-step/',{'id':str(self.first.pk),'date':str(self.today),'notes':'Legacy'},format='json').status_code
                return client.post(self.base+'protocol-execution-confirm/?view=mobile',{'preview_token':review['preview_token']},format='json').status_code
            finally:close_old_connections()
        with ThreadPoolExecutor(max_workers=2) as pool:result=sorted(pool.map(send,[0,1]))
        self.assertIn(result,[[200,409],[200,200]] if legacy else [[200,409]])
        self.assertEqual(CattleProtocolStep.objects.filter(executed_at__isnull=False).count(),1)
    def test_same_review_executes_once(self):self.race()
    def test_native_legacy_execution_serializes(self):self.race(True)
