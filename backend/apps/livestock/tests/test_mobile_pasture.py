from unittest.mock import patch
from unittest import skipUnless
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from django.db import connection, close_old_connections
from rest_framework.test import APITestCase, APITransactionTestCase, APIClient
from apps.livestock.tests import test_mobile_grazing as fixtures
from apps.livestock.models import CattlePasture


class MobilePastureTests(APITestCase):
    base='/api/v1/livestock/cattle/pastures/'
    setUp=fixtures.MobileGrazingTests.setUp
    def values(self, edit=False):
        values={'farm':str(self.farm.pk),'name':'South','area_ha':'12.50','max_stocking_ua_ha':None,
            'availability':'available','availability_reason':'','notes':'Water and shade'}
        if edit:
            response=self.client.get(self.base+f'{self.pasture.pk}/mobile-form/',{'farm':str(self.farm.pk)})
            self.assertEqual(response.status_code,200,response.data)
            values.update(name=self.pasture.name,expected_version=response.data['version'])
        return values
    def save(self,values,edit=False):
        return self.client.patch(self.base+f'{self.pasture.pk}/?view=mobile',values,format='json') if edit else self.client.post(self.base+'?view=mobile',values,format='json')

    def test_create_and_versioned_edit_return_minimal_scoped_receipts(self):
        response=self.client.get(self.base+'mobile-form-options/',{'farm':str(self.farm.pk)})
        self.assertEqual(response.status_code,200,response.data)
        created=self.save(self.values()); self.assertEqual(created.status_code,201,created.data)
        self.assertEqual(set(created.data),{'id','farm','version'})
        row=CattlePasture.objects.get(pk=created.data['id']); self.assertEqual(str(row.area_ha),'12.50'); self.assertIsNone(row.max_stocking_ua_ha)
        values=self.values(edit=True); values.update(area_ha='11.25',max_stocking_ua_ha='2.30')
        edited=self.save(values,edit=True); self.assertEqual(edited.status_code,200,edited.data)
        self.assertEqual(self.save(values,edit=True).status_code,409)
        self.pasture.refresh_from_db(); self.assertEqual(str(self.pasture.max_stocking_ua_ha),'2.30')

    def test_decimal_limits_reason_and_unrecognized_fields_are_validated(self):
        for change in [{'area_ha':'0'},{'area_ha':'1.001'},{'area_ha':'100000000'},{'max_stocking_ua_ha':'0'},{'max_stocking_ua_ha':'1000000'}, {'availability':'blocked','availability_reason':''},{'occupancy':{'heads':0}}]:
            response=self.save({**self.values(),**change}); self.assertEqual(response.status_code,400,response.data)
        self.assertEqual(self.save({**self.values(),'name':'North'}).status_code,400)
        self.assertEqual(CattlePasture.objects.filter(farm=self.farm).count(),1)

    def test_active_occupations_block_restriction_and_existing_notes_are_preserved(self):
        values=self.values(edit=True); values.update(availability='resting',availability_reason='Recovery')
        self.assertEqual(self.save(values,edit=True).status_code,400)
        self.open.exit_date=self.today; self.open.save()
        values=self.values(edit=True); values.update(availability='resting',availability_reason='Recovery',notes='x'*3000)
        response=self.save(values,edit=True); self.assertEqual(response.status_code,200,response.data)
        self.pasture.refresh_from_db(); self.assertEqual(self.pasture.availability,'resting'); self.assertEqual(len(self.pasture.notes),3000)

    def test_metadata_writes_require_manager_and_own_farm(self):
        self.assertEqual(self.client.get(self.base+'mobile-form-options/',{'farm':str(self.foreign_farm.pk)}).status_code,404)
        values=self.values(edit=True)
        self.assertEqual(self.save({**values,'farm':str(self.foreign_farm.pk)},edit=True).status_code,404)
        for role in ['operator','feeder']:
            self.user.role=role; self.user.save(); self.user.allowed_livestock.add(self.species)
            self.assertEqual(self.client.get(self.base+'mobile-form-options/',{'farm':str(self.farm.pk)}).status_code,403)
            self.assertEqual(self.save(values,edit=True).status_code,403)

    def test_save_failure_rolls_back_created_pasture(self):
        values=self.values(); count=CattlePasture.objects.count(); original=CattlePasture.save
        def fail(row,*args,**kwargs):
            original(row,*args,**kwargs)
            raise RuntimeError('synthetic pasture failure')
        with patch.object(CattlePasture,'save',fail): self.assertEqual(self.save(values).status_code,500)
        self.assertEqual(CattlePasture.objects.count(),count)

    def test_legacy_create_patch_still_use_full_existing_serializer(self):
        response=self.client.post(self.base,self.values(),format='json')
        self.assertEqual(response.status_code,201,response.data); self.assertIn('occupancy',response.data)
        response=self.client.patch(self.base+f"{response.data['id']}/",{'notes':'Legacy'},format='json')
        self.assertEqual(response.status_code,200,response.data); self.assertEqual(response.data['notes'],'Legacy')


@skipUnless(connection.vendor=='postgresql','PostgreSQL locking required')
class ConcurrentPastureTests(APITransactionTestCase):
    base=MobilePastureTests.base
    setUp=MobilePastureTests.setUp
    values=MobilePastureTests.values
    def test_simultaneous_edits_with_same_version_conflict(self):
        values=self.values(edit=True); barrier=Barrier(2)
        def run(index):
            close_old_connections()
            try:
                client=APIClient(); client.force_authenticate(self.user); barrier.wait(timeout=10)
                return client.patch(self.base+f'{self.pasture.pk}/?view=mobile',{**values,'notes':f'Edit {index}'},format='json').status_code
            finally: close_old_connections()
        with ThreadPoolExecutor(max_workers=2) as pool: statuses=list(pool.map(run,range(2)))
        self.assertEqual(sorted(statuses),[200,409])

    def test_restriction_and_entry_cannot_both_commit(self):
        self.open.exit_date=self.today; self.open.save()
        root='/api/v1/livestock/cattle/grazings/'
        options=self.client.get(root+'mobile-entry-options/',self.query).data
        batches=self.client.get(root+'mobile-entry-batches/',self.query).data['results']
        batch=batches[0]
        preview=self.client.post(root+'mobile-entry-preview/',{**self.query,'pasture_version':options['pasture']['version'],
            'batch':batch['id'],'batch_version':batch['version'],'entry_date':str(self.today),'notes':''},format='json')
        self.assertEqual(preview.status_code,200,preview.data)
        values=self.values(edit=True); values.update(availability='resting',availability_reason='Recovery')
        barrier=Barrier(2)
        def run(kind):
            close_old_connections()
            try:
                client=APIClient(); client.force_authenticate(self.user); barrier.wait(timeout=10)
                if kind=='edit': return client.patch(self.base+f'{self.pasture.pk}/?view=mobile',values,format='json').status_code
                return client.post(root+'mobile-entry-confirm/',{'preview_token':preview.data['preview_token']},format='json').status_code
            finally: close_old_connections()
        with ThreadPoolExecutor(max_workers=2) as pool: statuses=list(pool.map(run,['edit','entry']))
        self.assertIn(statuses,[[200,409],[400,201]])
        self.pasture.refresh_from_db()
        from apps.livestock.models import CattleGrazing
        self.assertFalse(self.pasture.availability=='resting' and CattleGrazing.objects.filter(pasture=self.pasture,exit_date__isnull=True,batch__status='active').exists())
