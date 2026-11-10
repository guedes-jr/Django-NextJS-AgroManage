from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest import skipUnless
from unittest.mock import patch
from uuid import uuid4
from django.db import connection, close_old_connections
from rest_framework.test import APITestCase, APIClient, APITransactionTestCase
from apps.livestock.tests import test_mobile_protocol_start as fixture
from apps.livestock.models import CattleProtocol
from apps.livestock.cattle_improvements import start_protocol
from apps.tasks.models import Task

class MobileProtocolTemplateTests(APITestCase):
    base=fixture.MobileProtocolStartTests.base
    animal=fixture.MobileProtocolStartTests.animal
    batch=fixture.MobileProtocolStartTests.batch
    setUp=fixture.MobileProtocolStartTests.setUp
    def values(self):return {'name':'IATF','source':str(self.protocol.pk),'steps':[{'name':'Nova preparação','day':0},{'name':'Aplicar','day':8}]}
    def post(self,kind,v):return self.client.post(self.base+kind+'/?view=mobile',v,format='json')
    def preview(self,v=None):
        r=self.post('protocol-template-preview',v or self.values());self.assertEqual(r.status_code,200,r.data);return r.data
    def confirm(self,r):return self.post('protocol-template-confirm',{'preview_token':r['preview_token']})
    def test_append_only_version_snapshot_and_no_new_tasks(self):
        run=start_protocol(self.user,animal=self.cow,protocol=self.protocol,start_date=self.today,request_key=uuid4(),assigned_to=self.user)
        previous=run.steps_snapshot;tasks=Task.objects.count();r=self.preview();self.assertEqual(r['version'],2)
        result=self.confirm(r);self.assertEqual(result.status_code,201,result.data);self.assertEqual(result.data['version'],2)
        self.protocol.refresh_from_db();run.refresh_from_db();self.assertEqual(self.protocol.steps,previous);self.assertEqual(run.steps_snapshot,previous);self.assertEqual(Task.objects.count(),tasks)
        self.assertEqual(self.confirm(r).status_code,409);self.assertEqual(CattleProtocol.objects.count(),2)
    def test_new_name_starts_version_one(self):
        r=self.preview({**self.values(),'name':'Outro','source':None});self.assertEqual(r['previous_version'],0);self.assertEqual(self.confirm(r).data['version'],1)
    def test_strict_limits_and_order(self):
        for change in [{'name':''},{'steps':[]},{'steps':[{'name':'x','day':0}]*31},{'steps':[{'name':'x','day':366}]},{'steps':[{'name':'x','day':1},{'name':'y','day':0}]},{'steps':[{'name':'x','day':0,'inventory':1}]},{'version':5}]:
            self.assertEqual(self.post('protocol-template-preview',{**self.values(),**change}).status_code,400)
    def test_scope_name_signature_and_expiry(self):
        self.assertEqual(self.post('protocol-template-preview',{**self.values(),'source':str(uuid4())}).status_code,404)
        self.assertEqual(self.post('protocol-template-preview',{**self.values(),'name':'Renamed'}).status_code,400)
        r=self.preview();self.assertEqual(self.confirm({**r,'preview_token':r['preview_token']+'x'}).status_code,400)
        with patch('django.core.signing.time.time',return_value=9999999999):self.assertEqual(self.confirm(r).status_code,400)
        self.protocol.name='Changed';self.protocol.save();self.assertEqual(self.confirm(r).status_code,409)
    def test_operator_forbidden_and_actor_bound(self):
        from apps.accounts.models import User
        r=self.preview();other=User.objects.create_user(email='template-actor@example.invalid',password='test',organization=self.org,role='admin');self.client.force_authenticate(other);self.assertEqual(self.confirm(r).status_code,403)
        self.user.role='operator';self.user.allowed_livestock.add(self.species);self.user.save();self.client.force_authenticate(self.user);self.assertEqual(self.post('protocol-template-preview',self.values()).status_code,403)
    def test_intervening_legacy_version_invalidates_review(self):
        from apps.livestock.cattle_improvements import create_protocol
        r=self.preview();create_protocol(self.user,'IATF',[{'name':'Legacy','day':0}]);self.assertEqual(self.confirm(r).status_code,409)

@skipUnless(connection.vendor=='postgresql','PostgreSQL locks required')
class ProtocolTemplateConcurrencyTests(APITransactionTestCase):
    base=MobileProtocolTemplateTests.base
    animal=MobileProtocolTemplateTests.animal
    batch=MobileProtocolTemplateTests.batch
    setUp=MobileProtocolTemplateTests.setUp
    values=MobileProtocolTemplateTests.values
    post=MobileProtocolTemplateTests.post
    preview=MobileProtocolTemplateTests.preview
    def race(self,legacy=False):
        r=self.preview();gate=Barrier(2)
        def send(index):
            close_old_connections()
            try:
                client=APIClient();client.force_authenticate(self.user);gate.wait(timeout=10)
                if legacy and index:return client.post(self.base+'protocols/',{'name':'IATF','steps':[{'name':'Legacy','day':0}]},format='json').status_code
                return client.post(self.base+'protocol-template-confirm/?view=mobile',{'preview_token':r['preview_token']},format='json').status_code
            finally:close_old_connections()
        with ThreadPoolExecutor(max_workers=2) as pool:results=sorted(pool.map(send,[0,1]))
        self.assertIn(results,[[201,201],[201,409]] if legacy else [[201,409]])
        self.assertEqual(len(set(CattleProtocol.objects.values_list('version',flat=True))),CattleProtocol.objects.count())
    def test_duplicate_review_creates_one_version(self):self.race()
    def test_legacy_native_share_version_lock(self):self.race(True)
