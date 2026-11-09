from unittest import skipUnless
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from django.db import connection, close_old_connections
from rest_framework.test import APITransactionTestCase, APIClient
from datetime import timedelta
from unittest.mock import patch
from rest_framework.test import APITestCase
from apps.livestock.tests import test_mobile_castration_confirmation as fixtures
from apps.livestock.models import CattleManagement, CattleManagementEntry, HistoricoEvento, HealthRecord, WeightRecord
from apps.inventory.models import MovimentacaoEstoque


class FollowUpTests(APITestCase):
    base = '/api/v1/livestock/cattle/managements/'
    def setUp(self):
        fixtures.CastrationConfirmationTests.setUp(self)
        self.management.kind='sanitary'; self.management.status='confirmed'
        self.management.next_procedure_date=self.today+timedelta(days=7); self.management.save()
        self.execution=self.make_execution('Complete execution')
    def make_execution(self,description,animals=None):
        row=CattleManagement.objects.create(farm=self.farm,kind='sanitary',status='confirmed',date=self.today,description=description,created_by=self.user)
        for animal in animals if animals is not None else [self.beef,self.dual,self.dairy_male]:
            CattleManagementEntry.objects.create(management=row,animal=animal)
        return row
    def values(self,**changes):
        response=self.client.get(self.base+f'{self.management.pk}/mobile-follow-up/',self.query)
        self.assertEqual(response.status_code,200,response.data)
        return {**self.query,'expected_version':response.data['version'],'status':'done','note':'Conferido','execution':str(self.execution.pk),**changes}
    def resolve(self,values):
        return self.client.post(self.base+f'{self.management.pk}/resolve-follow-up/?view=mobile-follow-up',values,format='json')
    def test_candidates_cover_all_mixed_participants_and_paginate_without_effects(self):
        self.make_execution('Incomplete',[self.beef,self.dual])
        older=self.make_execution('Older'); older.date=self.today-timedelta(days=1); older.save()
        draft=self.make_execution('Draft'); draft.status='draft'; draft.save()
        self.make_execution('Additional',[self.beef,self.dual,self.dairy_male,self.cow])
        response=self.client.get(self.base+f'{self.management.pk}/mobile-follow-up-executions/',{**self.query,'page_size':1})
        self.assertEqual(response.status_code,200,response.data); self.assertEqual(response.data['count'],2); self.assertIsNotNone(response.data['next'])
        response=self.client.get(self.base+f'{self.management.pk}/mobile-follow-up-executions/',{**self.query,'search':'Complete execution'})
        self.assertEqual([r['id'] for r in response.data['results']],[str(self.execution.pk)])
        self.assertFalse(HistoricoEvento.objects.exists()); self.assertFalse(MovimentacaoEstoque.objects.exists())
    def test_done_links_execution_without_reapplying_effects(self):
        values=self.values(); response=self.resolve(values); self.assertEqual(response.status_code,200,response.data)
        self.management.refresh_from_db(); self.assertEqual(self.management.status,'confirmed')
        self.assertEqual(self.management.follow_up_execution,self.execution); self.assertEqual(self.management.follow_up_resolved_by,self.user)
        self.assertEqual(self.management.entries.count(),3)
        for model in [HistoricoEvento,HealthRecord,WeightRecord,MovimentacaoEstoque]: self.assertFalse(model.objects.exists())
        self.assertEqual(self.resolve(values).status_code,409)
    def test_cancellation_only_closes_follow_up(self):
        response=self.resolve(self.values(status='cancelled',execution=None)); self.assertEqual(response.status_code,200,response.data)
        self.management.refresh_from_db(); self.assertEqual(self.management.follow_up_status,'cancelled')
        self.assertEqual(self.management.status,'confirmed'); self.assertIsNone(self.management.follow_up_execution)
    def test_invalid_injected_and_stale_commands(self):
        values=self.values()
        for change in [{'note':' '},{'note':'x'*501},{'execution':None},{'status':'cancelled'},{'inventory_lot':str(self.farm.pk)}]:
            self.assertEqual(self.resolve({**values,**change}).status_code,400)
        self.management.notes='Changed'; self.management.save(); self.assertEqual(self.resolve(values).status_code,409)
        values=self.values(); bad=self.make_execution('Incomplete',[self.beef])
        for id in [self.management.pk,bad.pk]: self.assertEqual(self.resolve({**values,'execution':str(id)}).status_code,404)
        self.management.refresh_from_db(); self.assertEqual(self.management.follow_up_status,'pending')
    def test_context_roles_and_source_state_guarded(self):
        values=self.values(); self.assertEqual(self.resolve({**values,'farm':str(self.foreign_farm.pk)}).status_code,404)
        self.assertEqual(self.resolve({**values,'production':'invalid'}).status_code,400)
        for role in ['operator','feeder']:
            self.user.role=role; self.user.save(); self.user.allowed_livestock.add(self.species)
            self.assertEqual(self.resolve(values).status_code,403)
            self.assertEqual(self.client.get(self.base+f'{self.management.pk}/mobile-follow-up/',self.query).status_code,403)
        self.user.role='manager'; self.user.save(); self.management.next_procedure_date=None; self.management.save()
        self.assertEqual(self.resolve(values).status_code,409)
    def test_write_failure_rolls_back(self):
        values=self.values(); original=CattleManagement.save
        def fail(record,*args,**kwargs):
            original(record,*args,**kwargs)
            if record.pk==self.management.pk: raise RuntimeError('synthetic')
        with patch.object(CattleManagement,'save',fail):
            self.assertEqual(self.resolve(values).status_code,500)
        self.management.refresh_from_db(); self.assertEqual(self.management.follow_up_status,'pending'); self.assertIsNone(self.management.follow_up_resolved_at)


@skipUnless(connection.vendor == 'postgresql', 'Requires PostgreSQL row locks')
class FollowUpConcurrencyTests(APITransactionTestCase):
    base = FollowUpTests.base
    setUp = FollowUpTests.setUp
    make_execution = FollowUpTests.make_execution
    values = FollowUpTests.values

    def test_competing_resolution_commits_once(self):
        values = self.values(); gate = Barrier(2)
        def write(status):
            close_old_connections()
            try:
                client = APIClient(); client.force_authenticate(self.user); gate.wait(timeout=10)
                return client.post(self.base+f'{self.management.pk}/resolve-follow-up/?view=mobile-follow-up',
                    {**values,'status':status,'execution':values['execution'] if status=='done' else None},format='json').status_code
            finally: close_old_connections()
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(write, ['done','cancelled']))
        self.assertEqual(sorted(results),[200,409])
        self.management.refresh_from_db(); self.assertIn(self.management.follow_up_status,['done','cancelled'])
        self.assertFalse(HistoricoEvento.objects.exists()); self.assertFalse(MovimentacaoEstoque.objects.exists())
