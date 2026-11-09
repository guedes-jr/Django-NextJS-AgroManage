from unittest.mock import patch
from unittest import skipUnless
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from django.db import connection, close_old_connections
from rest_framework.test import APITestCase, APITransactionTestCase, APIClient
from apps.livestock.tests import test_mobile_sanitary_confirmation as fixtures
from apps.livestock.models import CattleManagement, CattleManagementEntry, HealthRecord, WeightRecord, HistoricoEvento
from apps.inventory.models import MovimentacaoEstoque


class SanitaryMaintenanceTests(APITestCase):
    base='/api/v1/livestock/cattle/managements/'
    setUp=fixtures.SanitaryConfirmationTests.setUp
    def values(self):
        response=self.client.get(self.base+f'{self.management.pk}/mobile-sanitary-edit/',self.query)
        self.assertEqual(response.status_code,200,response.data); row=response.data
        return {**self.query,'expected_version':row['version'],**row['values'],
            **{key:row['values'][key] or None for key in ['next_procedure_date','milk_withdrawal_until','meat_withdrawal_until']},
            'entries':[{'animal':entry['id'],'animal_version':entry['version']} for entry in row['entries']]}
    def edit(self,values):
        return self.client.patch(self.base+f'{self.management.pk}/?view=mobile-sanitary',values,format='json')
    def cancellation(self,values):
        return {key:values[key] for key in ['farm','production','expected_version']}|{'reason':'Schedule replaced'}
    def cancel(self,values):
        return self.client.post(self.base+f'{self.management.pk}/cancel/?view=mobile-sanitary',self.cancellation(values),format='json')
    def test_edit_preserves_mixed_participants_and_all_documentary_fields(self):
        values=self.values(); self.assertEqual(len(values['entries']),3)
        values.update(description='Revised exam',treatment_type='surgery',next_procedure_date='2099-01-01',milk_withdrawal_until=None,meat_withdrawal_until=str(self.today))
        response=self.edit(values); self.assertEqual(response.status_code,200,response.data)
        self.management.refresh_from_db(); self.assertEqual(self.management.treatment_type,'surgery'); self.assertIsNone(self.management.milk_withdrawal_until)
        self.assertEqual(str(self.management.next_procedure_date),'2099-01-01')
        self.assertEqual(set(self.management.entries.values_list('animal_id',flat=True)),{self.beef.pk,self.dual.pk,self.dairy_male.pk})
        for model in [HealthRecord,WeightRecord,HistoricoEvento,MovimentacaoEstoque]: self.assertFalse(model.objects.exists())
        self.assertEqual(self.edit(values).status_code,409)
    def test_dates_duplicates_injected_fields_and_loss_of_segment_rejected(self):
        values=self.values()
        for change in [{'entries':[]},{'entries':[values['entries'][0]]*2},{'date':'2099-01-01'},{'next_procedure_date':'2000-01-01'},
            {'treatment_type':'medication'},{'cost_per_animal':1},{'inventory_lot':str(self.farm.pk)},{'entries':[{**values['entries'][0],'weight_kg':'1'}]}]:
            self.assertEqual(self.edit({**values,**change}).status_code,400)
        self.assertEqual(self.edit({**values,'entries':[row for row in values['entries'] if row['animal']==str(self.dairy_male.pk)]}).status_code,409)
        self.assertEqual(self.edit({**values,'farm':str(self.foreign_farm.pk)}).status_code,404)
    def test_inactive_visible_requires_removal_but_can_cancel(self):
        self.beef.status='sold'; self.beef.save(); values=self.values(); self.assertEqual(self.edit(values).status_code,409)
        self.assertEqual(self.cancel(values).status_code,200); self.management.refresh_from_db()
        self.assertEqual(self.management.status,'cancelled'); self.assertEqual(self.management.entries.count(),3)
        self.assertFalse(HealthRecord.objects.exists())
    def test_reason_version_and_documentary_draft_guards(self):
        values=self.values()
        for reason in ['', ' ', 'x'*301]:
            self.assertEqual(self.client.post(self.base+f'{self.management.pk}/cancel/?view=mobile-sanitary',{**self.cancellation(values),'reason':reason},format='json').status_code,400)
        self.assertEqual(self.edit(values).status_code,200); self.assertEqual(self.cancel(values).status_code,409)
        values=self.values(); self.management.cost_per_animal=1; self.management.save()
        self.assertEqual(self.cancel(values).status_code,404)
    def test_confirmation_blocks_further_maintenance_and_old_review_invalidated(self):
        review=fixtures.SanitaryConfirmationTests.review(self); values=self.values(); self.assertEqual(self.edit(values).status_code,200)
        self.assertEqual(fixtures.SanitaryConfirmationTests.confirm(self,review).status_code,409)
        review=fixtures.SanitaryConfirmationTests.review(self); values=self.values()
        self.assertEqual(fixtures.SanitaryConfirmationTests.confirm(self,review).status_code,200)
        self.assertEqual(self.edit(values).status_code,409); self.assertEqual(self.cancel(values).status_code,409)
        self.assertEqual(HealthRecord.objects.count(),3)
    def test_atomic_entry_failure_restores_original_ids_and_metadata(self):
        values=self.values(); before=list(self.management.entries.values_list('id',flat=True)); original=CattleManagementEntry.objects.bulk_create
        def fail(*args,**kwargs): original(*args,**kwargs); raise RuntimeError('synthetic')
        with patch.object(CattleManagementEntry.objects,'bulk_create',fail): self.assertEqual(self.edit({**values,'description':'Changed'}).status_code,500)
        self.management.refresh_from_db(); self.assertNotEqual(self.management.description,'Changed')
        self.assertEqual(set(self.management.entries.values_list('id',flat=True)),set(before))
    def test_nonmanager_roles_cannot_read_or_write(self):
        values=self.values()
        for role in ['operator','feeder']:
            self.user.role=role; self.user.save(); self.user.allowed_livestock.add(self.species)
            self.assertEqual(self.edit(values).status_code,403); self.assertEqual(self.cancel(values).status_code,403)
            self.assertEqual(self.client.get(self.base+f'{self.management.pk}/mobile-sanitary-edit/',self.query).status_code,403)


@skipUnless(connection.vendor=='postgresql','PostgreSQL locking required')
class ConcurrentSanitaryMaintenanceTests(APITransactionTestCase):
    base=SanitaryMaintenanceTests.base
    setUp=SanitaryMaintenanceTests.setUp
    values=SanitaryMaintenanceTests.values
    cancellation=SanitaryMaintenanceTests.cancellation
    def race(self,cancelling=False):
        values=self.values(); review=fixtures.SanitaryConfirmationTests.review(self); gate=Barrier(2)
        def write(index):
            close_old_connections()
            try:
                client=APIClient(); client.force_authenticate(self.user); gate.wait(timeout=10)
                if index:return client.post(self.base+f'{self.management.pk}/confirm/?view=mobile-sanitary',{'preview_token':review['preview_token']},format='json').status_code
                if cancelling:return client.post(self.base+f'{self.management.pk}/cancel/?view=mobile-sanitary',self.cancellation(values),format='json').status_code
                return client.patch(self.base+f'{self.management.pk}/?view=mobile-sanitary',values,format='json').status_code
            finally:close_old_connections()
        with ThreadPoolExecutor(max_workers=2) as pool: results=list(pool.map(write,[0,1]))
        self.assertEqual(sorted(results),[200,409]); self.assertIn(HealthRecord.objects.count(),[0,3])
    def test_edit_versus_confirmation(self):self.race()
    def test_cancel_versus_confirmation(self):self.race(cancelling=True)
