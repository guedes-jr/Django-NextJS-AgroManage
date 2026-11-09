from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest import skipUnless
from unittest.mock import patch
from datetime import timedelta
from uuid import uuid4
from django.db import connection, close_old_connections
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APITestCase, APIClient, APITransactionTestCase
from apps.livestock.tests import test_cattle_improvements as fixtures
from apps.livestock.models import CattleProtocol, CattleProtocolRun, CattleProtocolStep
from apps.tasks.models import Task

class MobileProtocolStartTests(APITestCase):
    base=fixtures.CattleImprovementTests.base
    animal=fixtures.CattleImprovementTests.animal
    batch=fixtures.CattleImprovementTests.batch
    def setUp(self):
        fixtures.CattleImprovementTests.setUp(self)
        self.protocol=CattleProtocol.objects.create(organization=self.org,name='IATF',steps=[{'name':'Preparar','day':0},{'name':'Revisar','day':8}],created_by=self.user)
    def values(self):return {'farm':str(self.farm.pk),'production':'dairy','animal':str(self.cow.pk),'animal_version':self.cow.updated_at.isoformat(),'protocol':str(self.protocol.pk),'protocol_version':1,'assigned_to':str(self.user.pk),'start_date':str(self.today),'request_key':str(uuid4())}
    def post(self,kind,values):return self.client.post(self.base+kind+'/?view=mobile',values,format='json')
    def preview(self,values=None):
        response=self.post('protocol-start-preview',values or self.values());self.assertEqual(response.status_code,200,response.data);return response.data
    def confirm(self,review):return self.post('protocol-start-confirm',{'preview_token':review['preview_token']})
    def test_catalog_scope_eligibility_search_and_cost_free(self):
        self.animal('M',gender='M',cattle_purpose='dairy');self.animal('Sold',status='sold',cattle_purpose='dairy')
        self.animal('Dual',cattle_purpose='dual')
        query={'view':'mobile','farm':str(self.farm.pk),'production':'dairy'}
        with CaptureQueriesContext(connection) as captured:response=self.client.get(self.base+'protocol-start-animals/',query)
        self.assertEqual({r['identifier'] for r in response.data['results']},{'C1','Dual'})
        self.assertNotIn('purchase_value',' '.join(q['sql'] for q in captured))
        self.assertEqual(self.client.get(self.base+'protocol-start-animals/',{**query,'search':'none'}).data['count'],0)
        self.assertEqual(self.client.get(self.base+'protocol-start-options/',{**query,'farm':str(self.foreign.pk)}).status_code,404)
    def test_review_confirm_idempotency_and_no_financial_columns(self):
        command=self.values();review=self.preview(command)
        self.assertEqual(review['steps'][1]['due_date'],str(self.today+timedelta(days=8)))
        with CaptureQueriesContext(connection) as captured:response=self.confirm(review)
        self.assertEqual(response.status_code,201,response.data)
        self.assertNotIn('purchase_value',' '.join(q['sql'] for q in captured))
        self.assertEqual(response.data['steps'],2);self.assertEqual(self.confirm(review).data['id'],response.data['id'])
        self.assertEqual(CattleProtocolRun.objects.count(),1);self.assertEqual(Task.objects.count(),2)
        self.assertTrue(all(t.assigned_to_id==self.user.pk and t.farm_id==self.farm.pk for t in Task.objects.all()))
        self.assertTrue(all(s.executed_at is None for s in CattleProtocolStep.objects.all()))
        another=self.preview({**command,'start_date':str(self.today+timedelta(days=1))})
        self.assertEqual(self.confirm(another).status_code,409);self.assertEqual(Task.objects.count(),2)
    def test_strict_versions_dates_and_foreign_targets(self):
        self.assertEqual(self.post('protocol-start-preview',{**self.values(),'inventory_quantity':1}).status_code,400)
        self.assertEqual(self.post('protocol-start-preview',{**self.values(),'protocol_version':2}).status_code,409)
        self.assertEqual(self.post('protocol-start-preview',{**self.values(),'start_date':str(self.today-timedelta(days=101))}).status_code,400)
        self.assertEqual(self.post('protocol-start-preview',{**self.values(),'animal':str(self.beef.pk)}).status_code,404)
        self.protocol.organization=self.foreign.organization;self.protocol.save()
        self.assertEqual(self.post('protocol-start-preview',self.values()).status_code,404)
    def test_changed_context_expired_tampered_actor_and_readonly(self):
        review=self.preview();self.cow.notes='Changed';self.cow.save();self.assertEqual(self.confirm(review).status_code,409)
        review=self.preview();self.protocol.steps=[{'name':'Changed','day':0}];self.protocol.save();self.assertEqual(self.confirm(review).status_code,409)
        review=self.preview();self.assertEqual(self.confirm({**review,'preview_token':review['preview_token']+'x'}).status_code,400)
        with patch('django.core.signing.time.time',return_value=9999999999):self.assertEqual(self.confirm(review).status_code,400)
        from apps.accounts.models import User
        other=User.objects.create_user(email='other-actor@example.invalid',password='test',organization=self.org,role='admin')
        self.client.force_authenticate(other);self.assertEqual(self.confirm(review).status_code,403);self.client.force_authenticate(self.user)
        self.user.role='operator';self.user.operator_read_only=True;self.user.allowed_livestock.add(self.species);self.user.save()
        self.assertEqual(self.post('protocol-start-preview',self.values()).status_code,403)
        self.assertEqual(CattleProtocolRun.objects.count(),0)
    def test_operator_self_assignment_only_and_active_assignee(self):
        from apps.accounts.models import User
        person=User.objects.create_user(email='assignee@example.invalid',password='test',organization=self.org,role='manager')
        self.user.role='operator';self.user.allowed_livestock.add(self.species);self.user.save()
        self.assertEqual(self.post('protocol-start-preview',{**self.values(),'assigned_to':str(person.pk)}).status_code,403)
        self.assertEqual(self.confirm(self.preview()).status_code,201)
        self.user.role='admin';self.user.save();review=self.preview({**self.values(),'assigned_to':str(person.pk)})
        person.is_active=False;person.save();self.assertEqual(self.confirm(review).status_code,409)
    def test_partial_task_failure_rolls_back_everything(self):
        review=self.preview();original=Task.objects.create;count=0
        def create(**kwargs):
            nonlocal count
            count+=1
            if count==2:raise RuntimeError('synthetic task failure')
            return original(**kwargs)
        with patch.object(Task.objects,'create',side_effect=create):
            self.assertEqual(self.confirm(review).status_code,500)
        self.assertEqual(CattleProtocolRun.objects.count(),0);self.assertEqual(CattleProtocolStep.objects.count(),0);self.assertEqual(Task.objects.count(),0)

@skipUnless(connection.vendor=='postgresql','PostgreSQL row locks required')
class MobileProtocolStartConcurrencyTests(APITransactionTestCase):
    base=MobileProtocolStartTests.base
    animal=MobileProtocolStartTests.animal
    batch=MobileProtocolStartTests.batch
    setUp=MobileProtocolStartTests.setUp
    values=MobileProtocolStartTests.values
    post=MobileProtocolStartTests.post
    preview=MobileProtocolStartTests.preview
    def race(self,legacy=False):
        values=self.values();review=self.preview(values);gate=Barrier(2)
        def send(index):
            close_old_connections()
            try:
                client=APIClient();client.force_authenticate(self.user);gate.wait(timeout=10)
                if legacy and index:return client.post(self.base+'start-protocol/',{key:value for key,value in values.items() if key in ['animal','protocol','start_date','request_key','assigned_to']},format='json').status_code
                return client.post(self.base+'protocol-start-confirm/?view=mobile',{'preview_token':review['preview_token']},format='json').status_code
            finally:close_old_connections()
        with ThreadPoolExecutor(max_workers=2) as pool:self.assertEqual(list(pool.map(send,[0,1])),[201,201])
        self.assertEqual(CattleProtocolRun.objects.count(),1);self.assertEqual(Task.objects.count(),2)
    def test_concurrent_native_same_key_creates_once(self):self.race()
    def test_legacy_native_same_key_share_lock_without_duplicates(self):self.race(True)
