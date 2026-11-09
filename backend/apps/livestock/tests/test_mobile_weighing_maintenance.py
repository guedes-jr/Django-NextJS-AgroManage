from decimal import Decimal
from unittest.mock import patch
from unittest import skipUnless
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from django.db import connection, close_old_connections
from rest_framework.test import APITestCase, APITransactionTestCase, APIClient
from apps.livestock.tests import test_mobile_management as fixtures
from apps.livestock.models import CattleManagementEntry, WeightRecord


class WeighingMaintenanceTests(APITestCase):
    base='/api/v1/livestock/cattle/managements/'
    def setUp(self):
        fixtures.MobileManagementTests.setUp(self)
        self.management.entries.update(weight_kg=Decimal('400'))
    def values(self):
        response=self.client.get(self.base+f'{self.management.pk}/mobile-weighing-edit/',self.query)
        self.assertEqual(response.status_code,200,response.data)
        value=response.data
        return {'farm':value['farm']['id'],'production':value['production'],'expected_version':value['version'],
            'date':value['values']['date'],'description':value['values']['description'],'responsible':value['values']['responsible'],
            'notes':value['values']['notes'],'entries':[{'animal':row['animal']['id'],'animal_version':row['animal']['version'],
                'weight_kg':row['weight_kg']} for row in value['values']['entries']]}
    def edit(self,values):
        return self.client.patch(self.base+f'{self.management.pk}/?view=mobile-weighing',values,format='json')
    def cancel(self,values):
        return self.client.post(self.base+f'{self.management.pk}/cancel/?view=mobile-weighing',
            {key:values[key] for key in ['farm','production','expected_version']}|{'reason':'Duplicated schedule'},format='json')

    def test_edit_preserves_mixed_participants_and_does_not_apply_weights(self):
        values=self.values(); self.assertEqual(len(values['entries']),3)
        values.update(description='Revised weighing',notes='Preserved')
        response=self.edit(values); self.assertEqual(response.status_code,200,response.data)
        self.assertEqual(response.data['participant_count'],3)
        self.management.refresh_from_db(); self.assertEqual(self.management.description,'Revised weighing')
        self.assertEqual(set(self.management.entries.values_list('animal_id',flat=True)),{self.cow.pk,self.heifer.pk,self.beef.pk})
        self.assertFalse(WeightRecord.objects.exists()); self.assertEqual(self.edit(values).status_code,409)

    def test_invalid_inputs_and_removal_of_all_segment_participants_rejected(self):
        values=self.values()
        for change in [{'entries':[]},{'entries':[values['entries'][0]]*2},{'date':'2099-01-01'},{'entries':[{**values['entries'][0],'weight_kg':'0'}]},{'kind':'sanitary'}]:
            self.assertEqual(self.edit({**values,**change}).status_code,400)
        self.assertEqual(self.edit({**values,'entries':[row for row in values['entries'] if row['animal']==str(self.beef.pk)]}).status_code,409)
        self.assertEqual(self.edit({**values,'farm':str(self.foreign_farm.pk)}).status_code,404)

    def test_inactive_participant_must_be_removed_but_can_cancel_draft(self):
        self.beef.status='sold'; self.beef.save()
        values=self.values(); self.assertEqual(self.edit(values).status_code,409)
        response=self.cancel(values); self.assertEqual(response.status_code,200,response.data)
        self.management.refresh_from_db(); self.assertEqual(self.management.status,'cancelled')
        self.assertEqual(self.management.entries.count(),3); self.assertFalse(WeightRecord.objects.exists())

    def test_cancel_requires_reason_and_version_and_rejects_confirmed(self):
        values=self.values()
        for reason in ['', ' ', 'x'*301]:
            self.assertEqual(self.client.post(self.base+f'{self.management.pk}/cancel/?view=mobile-weighing',
                {key:values[key] for key in ['farm','production','expected_version']}|{'reason':reason},format='json').status_code,400)
        self.assertEqual(self.edit(values).status_code,200)
        self.assertEqual(self.cancel(values).status_code,409)
        values=self.values()
        response=self.client.post(self.base+f'{self.management.pk}/confirm/',{},format='json'); self.assertEqual(response.status_code,200,response.data)
        self.assertEqual(self.edit(values).status_code,409); self.assertEqual(self.cancel(values).status_code,409)

    def test_participant_failure_rolls_back_edit_and_preserves_old_entry_ids(self):
        values=self.values(); before=list(self.management.entries.values_list('id',flat=True)); original=CattleManagementEntry.objects.bulk_create
        def fail(*args,**kwargs):
            original(*args,**kwargs)
            raise RuntimeError('synthetic weighing edit failure')
        with patch('apps.livestock.mobile_weighing.CattleManagementEntry.objects.bulk_create',side_effect=fail):
            self.assertEqual(self.edit({**values,'description':'Must roll back'}).status_code,500)
        self.management.refresh_from_db(); self.assertEqual(self.management.description,'Mixed weighing')
        self.assertEqual(set(before),set(self.management.entries.values_list('id',flat=True)))

    def test_operator_and_feeder_cannot_edit_cancel_or_load_form(self):
        values=self.values()
        for role in ['operator','feeder']:
            self.user.role=role; self.user.save(); self.user.allowed_livestock.add(self.species)
            self.assertEqual(self.client.get(self.base+f'{self.management.pk}/mobile-weighing-edit/',self.query).status_code,403)
            self.assertEqual(self.edit(values).status_code,403); self.assertEqual(self.cancel(values).status_code,403)


@skipUnless(connection.vendor=='postgresql','PostgreSQL locking required')
class ConcurrentWeighingMaintenanceTests(APITransactionTestCase):
    base=WeighingMaintenanceTests.base
    setUp=WeighingMaintenanceTests.setUp
    values=WeighingMaintenanceTests.values
    def race(self,cancel):
        values=self.values()
        review=self.client.get(self.base+f'{self.management.pk}/mobile-weighing-review/',self.query)
        self.assertEqual(review.status_code,200,review.data); barrier=Barrier(2)
        def run(index):
            close_old_connections()
            try:
                client=APIClient(); client.force_authenticate(self.user); barrier.wait(timeout=10)
                if index:
                    return client.post(self.base+f'{self.management.pk}/confirm/?view=mobile-weighing',{'preview_token':review.data['preview_token']},format='json').status_code
                if cancel:
                    body={key:values[key] for key in ['farm','production','expected_version']}|{'reason':'Schedule changed'}
                    return client.post(self.base+f'{self.management.pk}/cancel/?view=mobile-weighing',body,format='json').status_code
                return client.patch(self.base+f'{self.management.pk}/?view=mobile-weighing',{**values,'description':'Changed'},format='json').status_code
            finally: close_old_connections()
        with ThreadPoolExecutor(max_workers=2) as pool: statuses=list(pool.map(run,range(2)))
        self.assertIn(statuses,[[200,409],[409,200]])
        self.management.refresh_from_db(); self.assertEqual(WeightRecord.objects.count(),3 if self.management.status=='confirmed' else 0)
    def test_edit_and_confirm_cannot_both_commit(self): self.race(cancel=False)
    def test_cancel_and_confirm_cannot_both_commit(self): self.race(cancel=True)
