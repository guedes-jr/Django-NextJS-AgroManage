from datetime import timedelta
from uuid import uuid4
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APITestCase
from apps.livestock.tests import test_cattle_improvements as fixtures
from apps.livestock.models import CattleProtocol, CattleProtocolRun, CattleProtocolStep, Species
from apps.livestock.cattle_improvements import start_protocol

class MobileProtocolsTests(APITestCase):
    animal = fixtures.CattleImprovementTests.animal
    batch = fixtures.CattleImprovementTests.batch
    base = fixtures.CattleImprovementTests.base
    def setUp(self):
        fixtures.CattleImprovementTests.setUp(self)
        self.protocol = CattleProtocol.objects.create(organization=self.org, name='IATF', version=1, steps=[{'name':'Iniciar','day':0},{'name':'Revisar','day':8}], created_by=self.user)
        self.run = start_protocol(self.user, animal=self.cow, protocol=self.protocol, start_date=self.today-timedelta(days=2), request_key=uuid4(), assigned_to=self.user)
        self.query = {'production':'dairy','farm':str(self.farm.pk),'view':'mobile'}
    def get(self, kind, **kwargs):
        return self.client.get(self.base+kind+'/',{**self.query,**kwargs})
    def detail(self, kind='protocol-runs', pk=None, **kwargs):
        return self.client.get(self.base+f'{kind}/{pk or self.run.pk}/mobile/',{**self.query,**kwargs})
    def test_snapshot_and_read_without_effects(self):
        first=self.run.executions.order_by('number').first()
        first.executed_at=timezone.now();first.executed_date=self.today;first.executed_by=self.user;first.notes='Conferido';first.save()
        self.protocol.steps=[{'name':'Alterado','day':3}];self.protocol.save()
        response=self.get('protocol-runs');self.assertEqual(response.status_code,200,response.data)
        row=response.data['results'][0];self.assertEqual((row['total'],row['completed']),(2,1))
        detail=self.detail();self.assertEqual(detail.status_code,200,detail.data)
        self.assertEqual(detail.data['steps'][0]['name'],'Iniciar');self.assertEqual(detail.data['steps'][0]['notes'],'Conferido')
        self.assertEqual([s['status'] for s in detail.data['steps']],['done','pending'])
        self.assertEqual(CattleProtocolRun.objects.count(),1);self.assertEqual(CattleProtocolStep.objects.count(),2)
    def test_catalog_org_search_pagination_and_identity(self):
        CattleProtocol.objects.create(organization=self.foreign.organization,name='Secret',steps=[],created_by=self.user)
        self.assertEqual(self.get('protocols').data['count'],1)
        self.assertEqual(self.get('protocols',search='missing').data['count'],0)
        self.assertEqual(self.detail('protocols',self.protocol.pk).data['name'],'IATF')
        self.assertEqual(self.detail('protocols',uuid4()).status_code,404)
        CattleProtocol.objects.create(organization=self.org,name='Other',steps=self.protocol.steps,created_by=self.user)
        response=self.get('protocols',page_size=1);self.assertIsNotNone(response.data['next']);self.assertEqual(response.data['count'],2)
    def test_farm_segment_species_search_and_foreign_protocol(self):
        self.assertEqual(self.get('protocol-runs',farm=str(self.foreign.pk)).data['count'],0)
        self.assertEqual(self.get('protocol-runs',production='beef').data['count'],0)
        self.assertEqual(self.get('protocol-runs',search='C1').data['count'],1)
        self.assertEqual(self.get('protocol-runs',search='missing').data['count'],0)
        self.cow.cattle_purpose='dual';self.cow.save();self.assertEqual(self.get('protocol-runs',production='beef').data['count'],1)
        self.cow.species=Species.objects.create(code='other',name='Other');self.cow.save();self.assertEqual(self.get('protocol-runs').data['count'],0)
        self.cow.species=self.species;self.cow.save();self.protocol.organization=self.foreign.organization;self.protocol.save();self.assertEqual(self.detail().status_code,404)
    def test_invalid_task_relation_cannot_leak(self):
        step=self.run.executions.first();step.task.organization=self.foreign.organization;step.task.save()
        self.assertEqual(self.get('protocol-runs').data['count'],0);self.assertEqual(self.detail().status_code,404)
    def test_overdue_cancelled_no_financial_columns_and_constant_query_count(self):
        steps=list(self.run.executions.order_by('number'));steps[1].task.status='cancelled';steps[1].task.save()
        with CaptureQueriesContext(connection) as queries:response=self.detail()
        self.assertEqual(response.status_code,200,response.data)
        self.assertEqual([row['status'] for row in response.data['steps']],['overdue','cancelled'])
        sql=' '.join(q['sql'] for q in queries)
        for name in ['inventory_cost_snapshot','purchase_value','custo_unitario','inventory_movement_id']:self.assertNotIn(name,sql)
        with CaptureQueriesContext(connection) as single:self.get('protocol-runs')
        for index in range(5):start_protocol(self.user,animal=self.cow,protocol=self.protocol,start_date=self.today,request_key=uuid4(),assigned_to=self.user)
        with CaptureQueriesContext(connection) as many:self.get('protocol-runs')
        self.assertEqual(len(single),len(many))
    def test_permissions_and_validation(self):
        self.assertEqual(self.get('protocol-runs',production='all').status_code,400)
        self.assertEqual(self.get('protocol-runs',farm='invalid').status_code,400)
        self.user.role='operator';self.user.save();self.assertEqual(self.get('protocols').status_code,403)
        self.user.allowed_livestock.add(self.species);self.user.operator_read_only=True;self.user.save();self.assertEqual(self.get('protocol-runs').status_code,200)
        self.user.role='feeder';self.user.save();self.assertEqual(self.get('protocols').status_code,403)
        self.client.force_authenticate(None);self.assertIn(self.get('protocols').status_code,[401,403])
