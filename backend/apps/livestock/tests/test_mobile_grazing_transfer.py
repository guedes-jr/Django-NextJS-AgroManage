from unittest.mock import patch
from unittest import skipUnless
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from django.db import connection, close_old_connections
from rest_framework.test import APITestCase, APITransactionTestCase, APIClient
from apps.livestock.tests import test_mobile_grazing as fixtures
from apps.livestock.models import CattlePasture, CattleGrazing
from apps.inventory.models import MovimentacaoEstoque


class GrazingTransferTests(APITestCase):
    base='/api/v1/livestock/cattle/grazings/'
    def setUp(self):
        fixtures.MobileGrazingTests.setUp(self)
        self.destination=CattlePasture.objects.create(farm=self.farm,name='South',area_ha=10,availability='available')
    def values(self):
        response=self.client.get(self.base+f'{self.open.pk}/mobile-transfer-options/',self.query)
        self.assertEqual(response.status_code,200,response.data);row=response.data
        return {**self.query,'grazing_version':row['occupation']['version'],'batch_version':row['batch_version'],
            'destination':str(self.destination.pk),'destination_version':self.destination.updated_at.isoformat(),'date':str(self.today),'notes':'Transferred batch'}
    def preview(self,values=None):
        response=self.client.post(self.base+f'{self.open.pk}/mobile-transfer-preview/',values or self.values(),format='json')
        self.assertEqual(response.status_code,200,response.data);return response.data
    def confirm(self,review):
        return self.client.post(self.base+f'{self.open.pk}/mobile-transfer-confirm/',{'preview_token':review['preview_token']},format='json')
    def test_catalog_paginated_same_farm_released_destinations_only(self):
        CattlePasture.objects.create(farm=self.farm,name='Blocked',area_ha=2,availability='blocked')
        CattlePasture.objects.create(farm=self.farm,name='Other',area_ha=2,availability='available')
        response=self.client.get(self.base+f'{self.open.pk}/mobile-transfer-destinations/',{**self.query,'page_size':1})
        self.assertEqual(response.status_code,200,response.data);self.assertEqual(response.data['count'],2);self.assertIsNotNone(response.data['next'])
        response=self.client.get(self.base+f'{self.open.pk}/mobile-transfer-destinations/',{**self.query,'search':'South'})
        self.assertEqual([r['id'] for r in response.data['results']],[str(self.destination.pk)])
    def test_review_no_effect_confirm_closes_source_and_opens_destination_without_changing_heads(self):
        review=self.preview();self.open.refresh_from_db();self.assertIsNone(self.open.exit_date);self.assertEqual(CattleGrazing.objects.count(),2)
        response=self.confirm(review);self.assertEqual(response.status_code,201,response.data)
        self.open.refresh_from_db();self.assertEqual(self.open.exit_date,self.today)
        row=CattleGrazing.objects.get(pk=response.data['id']);self.assertEqual(row.pasture,self.destination);self.assertEqual(row.batch,self.batch)
        self.assertEqual(row.entry_date,self.today);self.assertEqual(row.notes,'Transferred batch')
        self.assertEqual(CattleGrazing.objects.filter(batch=self.batch,exit_date=None).count(),1)
        self.batch.refresh_from_db();self.assertEqual(self.batch.quantity,12);self.assertEqual(self.confirm(review).status_code,409)
        self.assertFalse(MovimentacaoEstoque.objects.exists())
    def test_dates_same_pasture_injected_fields_and_foreign_destination_rejected(self):
        values=self.values()
        for change in [{'date':'2099-01-01'},{'date':'2000-01-01'},{'destination':str(self.pasture.pk)},{'quantity':1},{'notes':'x'*2001}]:
            self.assertEqual(self.client.post(self.base+f'{self.open.pk}/mobile-transfer-preview/',{**values,**change},format='json').status_code,400)
        self.assertEqual(self.client.post(self.base+f'{self.open.pk}/mobile-transfer-preview/',{**values,'destination':str(self.foreign_pasture.pk)},format='json').status_code,404)
    def test_changed_batch_destination_or_legacy_close_invalidates_review(self):
        review=self.preview();self.batch.quantity=11;self.batch.save();self.assertEqual(self.confirm(review).status_code,409)
        review=self.preview();self.destination.availability='blocked';self.destination.save();self.assertEqual(self.confirm(review).status_code,409)
        self.destination.availability='available';self.destination.save();review=self.preview()
        response=self.client.post(self.base+f'{self.open.pk}/close/',{'exit_date':str(self.today)},format='json');self.assertEqual(response.status_code,200,response.data)
        self.assertEqual(self.confirm(review).status_code,409)
    def test_token_actor_roles_and_closed_source_guarded(self):
        review=self.preview();self.assertEqual(self.confirm({'preview_token':'tampered'}).status_code,409)
        self.assertEqual(self.client.post(self.base+f'{self.open.pk}/mobile-transfer-confirm/',{'preview_token':review['preview_token'],'date':str(self.today)},format='json').status_code,400)
        self.assertEqual(self.client.get(self.base+f'{self.closed.pk}/mobile-transfer-options/',self.query).status_code,409)
        from django.contrib.auth import get_user_model
        other=get_user_model().objects.create_user(email='transfer-other@example.invalid',password='test',role='manager',organization=self.org)
        self.client.force_authenticate(other);self.assertEqual(self.confirm(review).status_code,403);self.client.force_authenticate(self.user)
        for role in ['operator','feeder']:
            self.user.role=role;self.user.save();self.user.allowed_livestock.add(self.species);self.assertEqual(self.confirm(review).status_code,403)
    def test_inactive_empty_or_ambiguous_source_cannot_transfer(self):
        for field,value in [('quantity',0),('status','sold')]:
            old=getattr(self.batch,field);setattr(self.batch,field,value);self.batch.save()
            self.assertEqual(self.client.get(self.base+f'{self.open.pk}/mobile-transfer-options/',self.query).status_code,409)
            setattr(self.batch,field,old);self.batch.save()
        values=self.values()
        CattleGrazing.objects.create(pasture=self.destination,batch=self.batch,entry_date=self.today,exit_date=self.today)
        self.assertEqual(self.client.post(self.base+f'{self.open.pk}/mobile-transfer-preview/',values,format='json').status_code,409)
    def test_destination_failure_rolls_back_source_exit_and_new_occupation(self):
        review=self.preview()
        from apps.livestock.cattle_services import enter_cattle_pasture
        def fail(*args,**kwargs):enter_cattle_pasture(*args,**kwargs);raise RuntimeError('synthetic')
        with patch('apps.livestock.mobile_grazing_transfer.enter_cattle_pasture',side_effect=fail):self.assertEqual(self.confirm(review).status_code,500)
        self.open.refresh_from_db();self.assertIsNone(self.open.exit_date);self.assertEqual(CattleGrazing.objects.count(),2)


@skipUnless(connection.vendor=='postgresql','PostgreSQL locking required')
class GrazingTransferConcurrencyTests(APITransactionTestCase):
    base=GrazingTransferTests.base
    setUp=GrazingTransferTests.setUp
    values=GrazingTransferTests.values
    preview=GrazingTransferTests.preview
    def race(self,close=False):
        review=self.preview();gate=Barrier(2)
        def write(index):
            close_old_connections()
            try:
                client=APIClient();client.force_authenticate(self.user);gate.wait(timeout=10)
                if index and close:return client.post(self.base+f'{self.open.pk}/close/',{'exit_date':str(self.today)},format='json').status_code
                return client.post(self.base+f'{self.open.pk}/mobile-transfer-confirm/',{'preview_token':review['preview_token']},format='json').status_code
            finally:close_old_connections()
        with ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(write,[0,1]))
        self.assertLessEqual(CattleGrazing.objects.filter(batch=self.batch,exit_date=None).count(),1);return sorted(results)
    def test_same_source_transfer_commits_once(self):self.assertEqual(self.race(),[201,409])
    def test_legacy_close_and_transfer_are_serialized(self):self.assertIn(self.race(close=True),[[201,400],[200,409]])

    def test_opposite_direction_batches_transfer_without_deadlock(self):
        from apps.livestock.models import AnimalBatch
        other=AnimalBatch.objects.create(farm=self.farm,species=self.species,batch_code='SECOND',cattle_purpose='beef',quantity=7,entry_date=self.batch.entry_date)
        source=CattleGrazing.objects.create(pasture=self.destination,batch=other,entry_date=self.open.entry_date)
        first=self.preview();command={**self.values(),'pasture':str(self.destination.pk),'destination':str(self.pasture.pk),
            'grazing_version':source.updated_at.isoformat(),'batch_version':other.updated_at.isoformat(),'destination_version':self.pasture.updated_at.isoformat()}
        response=self.client.post(self.base+f'{source.pk}/mobile-transfer-preview/',command,format='json')
        self.assertEqual(response.status_code,200,response.data);second=response.data;gate=Barrier(2)
        def write(index):
            close_old_connections()
            try:
                client=APIClient();client.force_authenticate(self.user);gate.wait(timeout=10)
                pk=source.pk if index else self.open.pk
                return client.post(self.base+f'{pk}/mobile-transfer-confirm/',{'preview_token':(second if index else first)['preview_token']},format='json').status_code
            finally:close_old_connections()
        with ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(write,[0,1]))
        self.assertEqual(results,[201,201]);self.assertEqual(CattleGrazing.objects.filter(batch=self.batch,exit_date=None).get().pasture_id,self.destination.pk)
        self.assertEqual(CattleGrazing.objects.filter(batch=other,exit_date=None).get().pasture_id,self.pasture.pk)
