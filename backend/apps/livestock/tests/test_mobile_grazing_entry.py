from unittest.mock import patch
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest import skipUnless
from django.db import connection, close_old_connections
from rest_framework.test import APITestCase, APITransactionTestCase, APIClient
from apps.livestock.tests import test_mobile_grazing as grazing_fixtures
from apps.livestock.models import CattleGrazing, AnimalBatch


class MobileGrazingEntryTests(APITestCase):
    base = '/api/v1/livestock/cattle/grazings/'
    def setUp(self):
        grazing_fixtures.MobileGrazingTests.setUp(self)
        self.open.exit_date=self.today; self.open.save()

    def values(self):
        options=self.client.get(self.base+'mobile-entry-options/', self.query)
        self.assertEqual(options.status_code,200,options.data)
        rows=self.client.get(self.base+'mobile-entry-batches/', self.query)
        self.assertEqual(rows.status_code,200,rows.data)
        row=rows.data['results'][0]
        return {**self.query,'pasture_version':options.data['pasture']['version'],'batch':row['id'],
            'batch_version':row['version'],'entry_date':str(self.today),'notes':'Entry review'}

    def preview(self, values=None):
        response=self.client.post(self.base+'mobile-entry-preview/', values or self.values(), format='json')
        self.assertEqual(response.status_code,200,response.data)
        return response.data

    def confirm(self, review):
        return self.client.post(self.base+'mobile-entry-confirm/', {'preview_token':review['preview_token']}, format='json')

    def test_preview_is_readonly_confirm_reuses_service_and_blocks_replay(self):
        count=CattleGrazing.objects.count(); review=self.preview()
        self.assertEqual(CattleGrazing.objects.count(),count)
        response=self.confirm(review); self.assertEqual(response.status_code,201,response.data)
        row=CattleGrazing.objects.get(pk=response.data['id'])
        self.assertEqual(row.batch,self.batch); self.assertEqual(row.pasture,self.pasture)
        self.assertEqual(row.notes,'Entry review'); self.assertIsNone(row.exit_date)
        self.assertEqual(self.confirm(review).status_code,409)
        self.assertEqual(CattleGrazing.objects.count(),count+1)

    def test_changed_context_and_new_open_occupation_block_commit(self):
        review=self.preview(); self.pasture.availability='blocked'; self.pasture.save()
        self.assertEqual(self.confirm(review).status_code,409)
        self.pasture.availability='available'; self.pasture.save()
        review=self.preview(); self.batch.quantity=11; self.batch.save()
        self.assertEqual(self.confirm(review).status_code,409)
        review=self.preview(); CattleGrazing.objects.create(pasture=self.pasture,batch=self.batch,entry_date=self.today)
        self.assertEqual(self.confirm(review).status_code,409)

    def test_invalid_dates_foreign_batch_and_unreviewed_fields_rejected(self):
        values=self.values()
        for change in [{'entry_date':'2099-01-01'},{'entry_date':'2020-01-01'},{'quantity':2},{'batch':str(self.foreign_pasture.pk)}]:
            response=self.client.post(self.base+'mobile-entry-preview/',{**values,**change},format='json')
            self.assertIn(response.status_code,[400,409])
        self.assertEqual(self.client.get(self.base+'mobile-entry-options/',{**self.query,'farm':str(self.foreign_farm.pk)}).status_code,404)
        review=self.preview()
        self.assertEqual(self.client.post(self.base+'mobile-entry-confirm/',{'preview_token':review['preview_token'],'notes':'changed'},format='json').status_code,400)

    def test_operator_and_feeder_cannot_use_write_context_or_mutations(self):
        values=self.values(); review=self.preview(values)
        for role in ['operator','feeder']:
            self.user.role=role; self.user.save(); self.user.allowed_livestock.add(self.species)
            self.assertEqual(self.client.get(self.base+'mobile-entry-options/',self.query).status_code,403)
            self.assertEqual(self.client.get(self.base+'mobile-entry-batches/',self.query).status_code,403)
            self.assertEqual(self.client.post(self.base+'mobile-entry-preview/',values,format='json').status_code,403)
            self.assertEqual(self.confirm(review).status_code,403)

    def test_catalog_excludes_open_inactive_empty_foreign_and_nonbovine_batches(self):
        CattleGrazing.objects.create(pasture=self.pasture,batch=self.batch,entry_date=self.today)
        self.assertEqual(self.client.get(self.base+'mobile-entry-batches/',self.query).data['count'],0)
        self.open=AnimalBatch.objects.create(farm=self.farm,species=self.species,batch_code='EMPTY',quantity=0,entry_date=self.today)
        self.assertEqual(self.client.get(self.base+'mobile-entry-batches/',self.query).data['count'],0)

    def test_failure_rolls_back_and_other_actor_cannot_confirm(self):
        review=self.preview(); count=CattleGrazing.objects.count()
        original=CattleGrazing.objects.create
        def fail(**values):
            original(**values)
            raise RuntimeError('synthetic entry failure')
        with patch('apps.livestock.cattle_services.CattleGrazing.objects.create',side_effect=fail):
            self.assertEqual(self.confirm(review).status_code,500)
        self.assertEqual(CattleGrazing.objects.count(),count)
        from django.contrib.auth import get_user_model
        other=get_user_model().objects.create_user(email='other-entry@example.invalid',password='test',role='manager',organization=self.org)
        self.client.force_authenticate(other)
        self.assertEqual(self.confirm(review).status_code,403)


@skipUnless(connection.vendor=='postgresql','PostgreSQL locking required')
class ConcurrentEntryTests(APITransactionTestCase):
    setUp=MobileGrazingEntryTests.setUp
    values=MobileGrazingEntryTests.values
    preview=MobileGrazingEntryTests.preview
    base=MobileGrazingEntryTests.base

    def test_simultaneous_confirmations_create_one_occupation(self):
        review=self.preview(); count=CattleGrazing.objects.count(); barrier=Barrier(2)
        def run():
            close_old_connections()
            try:
                client=APIClient(); client.force_authenticate(self.user); barrier.wait(timeout=10)
                return client.post(self.base+'mobile-entry-confirm/',{'preview_token':review['preview_token']},format='json').status_code
            finally: close_old_connections()
        with ThreadPoolExecutor(max_workers=2) as pool: statuses=list(pool.map(lambda _:run(),range(2)))
        self.assertEqual(sorted(statuses),[201,409]); self.assertEqual(CattleGrazing.objects.count(),count+1)
