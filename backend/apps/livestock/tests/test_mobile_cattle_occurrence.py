from unittest.mock import patch
from unittest import skipUnless
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from django.contrib.auth import get_user_model
from django.db import connection, close_old_connections
from django.db.models.query import QuerySet
from rest_framework.test import APITestCase, APITransactionTestCase, APIClient
from apps.livestock.tests import test_mobile_cattle_operations as fixtures
from apps.livestock.models import CattleOccurrence, HealthRecord
from apps.tasks.models import Task
from apps.inventory.models import MovimentacaoEstoque


class CattleOccurrenceTests(APITestCase):
    base='/api/v1/livestock/cattle/operations/'
    setUp=fixtures.MobileCattleOperationsTests.setUp
    animal=fixtures.MobileCattleOperationsTests.animal
    batch=fixtures.MobileCattleOperationsTests.batch
    def values(self):
        return {'farm':str(self.farm.pk),'production':'dairy','kind':'other','date':str(self.today),'due_date':str(self.today),
            'description':'New field occurrence','assigned_to':str(self.user.pk),'target_kind':'farm','target':None,'target_version':None}
    def create(self,values):return self.client.post(self.base+'occurrences/?view=mobile',values,format='json')
    def options(self):
        response=self.client.get(self.base+f'occurrences/{self.occurrence.pk}/mobile-resolve/',self.query)
        self.assertEqual(response.status_code,200,response.data);return response.data
    def resolution(self,options):return {'farm':str(self.farm.pk),'production':'dairy','context_token':options['context_token'],'resolution':'Fence repaired'}
    def resolve(self,values):return self.client.post(self.base+f'occurrences/{self.occurrence.pk}/mobile-resolve/',values,format='json')
    def test_create_occurrence_and_exact_agenda_task_without_health_or_stock(self):
        response=self.create(self.values());self.assertEqual(response.status_code,201,response.data)
        row=CattleOccurrence.objects.get(pk=response.data['id']);self.assertEqual(str(row.task_id),response.data['task'])
        self.assertEqual(row.task.organization,self.org);self.assertEqual(row.task.assigned_to,self.user);self.assertEqual(row.task.status,'open')
        self.assertEqual(row.task.description,row.description);self.assertEqual(row.task.due_date,self.today)
        self.assertFalse(HealthRecord.objects.exists());self.assertFalse(MovimentacaoEstoque.objects.exists())
    def test_catalogs_and_target_version_production_and_exclusive_target_guard(self):
        response=self.client.get(self.base+'occurrence-targets/',{**self.query,'target_kind':'animals','search':'C1','page_size':1})
        self.assertEqual(response.status_code,200,response.data);self.assertEqual(response.data['count'],1)
        target=response.data['results'][0];values={**self.values(),'target_kind':'animals','target':target['id'],'target_version':target['version']}
        self.assertEqual(self.create(values).status_code,201)
        self.cow.notes='Changed';self.cow.save();self.assertEqual(self.create(values).status_code,409)
        self.assertEqual(self.create({**values,'target':str(self.beef.pk),'target_version':self.beef.updated_at.isoformat()}).status_code,404)
        for change in [{'target_kind':'farm'},{'target_version':None},{'animal':str(self.cow.pk)}]:self.assertEqual(self.create({**values,**change}).status_code,400)
    def test_input_dates_description_assignment_and_tenant_guarded(self):
        values=self.values()
        for change in [{'date':'2099-01-01'},{'due_date':'2000-01-01'},{'description':' '},{'description':'x'*1001},{'priority':'critical'}]:self.assertEqual(self.create({**values,**change}).status_code,400)
        self.assertEqual(self.create({**values,'farm':str(self.foreign.pk)}).status_code,404)
        foreign=get_user_model().objects.create_user(email='foreign-occ@example.invalid',password='test',organization=self.foreign.organization)
        self.assertEqual(self.create({**values,'assigned_to':str(foreign.pk)}).status_code,404)
    def test_operator_only_self_assignment_and_own_or_assigned_resolution(self):
        manager=self.user;operator=get_user_model().objects.create_user(email='operator-occ@example.invalid',password='test',organization=self.org,role='operator')
        operator.allowed_livestock.add(self.species);self.client.force_authenticate(operator)
        response=self.client.get(self.base+'occurrence-members/',self.query);self.assertEqual(response.status_code,200,response.data)
        self.assertEqual([row['id'] for row in response.data['results']],[str(operator.pk)])
        self.assertEqual(self.create({**self.values(),'assigned_to':str(manager.pk)}).status_code,403)
        response=self.create({**self.values(),'assigned_to':str(operator.pk)});self.assertEqual(response.status_code,201,response.data)
        self.assertEqual(self.client.get(self.base+f'occurrences/{self.occurrence.pk}/mobile-resolve/',self.query).status_code,403)
        read=self.client.get(self.base+f'occurrences/{self.occurrence.pk}/mobile/',self.query);self.assertFalse(read.data['can_resolve'])
        self.task.assigned_to=operator;self.task.save();options=self.options();self.assertEqual(self.resolve(self.resolution(options)).status_code,200)
    def test_resolution_completes_task_and_context_replay_conflicts(self):
        options=self.options();self.assertFalse(self.occurrence.resolved_at)
        values=self.resolution(options);response=self.resolve(values);self.assertEqual(response.status_code,200,response.data)
        self.occurrence.refresh_from_db();self.task.refresh_from_db();self.assertEqual(self.occurrence.resolution,'Fence repaired');self.assertEqual(self.task.status,'done')
        self.assertEqual(self.resolve(values).status_code,409)
    def test_context_binds_task_state_even_without_timestamp_update_and_actor(self):
        options=self.options();Task.objects.filter(pk=self.task.pk).update(status='in_progress')
        self.assertEqual(self.resolve(self.resolution(options)).status_code,409)
        options=self.options();self.assertEqual(self.resolve({**self.resolution(options),'resolution':' '}).status_code,400)
        other=get_user_model().objects.create_user(email='actor-occ@example.invalid',password='test',organization=self.org,role='manager')
        self.client.force_authenticate(other);self.assertEqual(self.resolve(self.resolution(options)).status_code,403)
    def test_readonly_operator_cannot_create_or_resolve(self):
        options=self.options();self.user.role='operator';self.user.operator_read_only=True;self.user.save();self.user.allowed_livestock.add(self.species)
        self.assertEqual(self.create(self.values()).status_code,403);self.assertEqual(self.resolve(self.resolution(options)).status_code,403)
    def test_create_failure_rolls_back_task_and_resolution_failure_rolls_back_both(self):
        before=Task.objects.count()
        with patch('apps.livestock.cattle_improvements.CattleOccurrence.objects.create',side_effect=RuntimeError('synthetic')):self.assertEqual(self.create(self.values()).status_code,500)
        self.assertEqual(Task.objects.count(),before)
        options=self.options();original=QuerySet.update
        def fail(query,*args,**kwargs):
            result=original(query,*args,**kwargs)
            if query.model is Task:raise RuntimeError('synthetic')
            return result
        with patch.object(QuerySet,'update',fail):self.assertEqual(self.resolve(self.resolution(options)).status_code,500)
        self.task.refresh_from_db();self.occurrence.refresh_from_db();self.assertEqual(self.task.status,'open');self.assertIsNone(self.occurrence.resolved_at)


@skipUnless(connection.vendor=='postgresql','PostgreSQL locking required')
class CattleOccurrenceConcurrencyTests(APITransactionTestCase):
    base=CattleOccurrenceTests.base
    setUp=CattleOccurrenceTests.setUp
    animal=CattleOccurrenceTests.animal
    batch=CattleOccurrenceTests.batch
    options=CattleOccurrenceTests.options
    resolution=CattleOccurrenceTests.resolution
    def race(self,legacy=False):
        values=self.resolution(self.options());gate=Barrier(2)
        def write(index):
            close_old_connections()
            try:
                client=APIClient();client.force_authenticate(self.user);gate.wait(timeout=10)
                if index and legacy:return client.post(self.base+'resolve-occurrence/',{'id':str(self.occurrence.pk),'resolution':'Legacy repaired'},format='json').status_code
                return client.post(self.base+f'occurrences/{self.occurrence.pk}/mobile-resolve/',values,format='json').status_code
            finally:close_old_connections()
        with ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(write,[0,1]))
        self.task.refresh_from_db();self.occurrence.refresh_from_db();self.assertEqual(self.task.status,'done');self.assertIsNotNone(self.occurrence.resolved_at)
        return sorted(results)
    def test_native_resolution_commits_once(self):self.assertEqual(self.race(),[200,409])
    def test_legacy_native_share_resolution_lock(self):self.assertIn(self.race(legacy=True),[[200,200],[200,409]])
