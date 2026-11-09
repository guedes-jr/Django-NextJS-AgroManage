from unittest.mock import patch
from unittest import skipUnless
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from django.db import connection, close_old_connections
from rest_framework.test import APITestCase, APITransactionTestCase, APIClient
from apps.livestock.tests import test_mobile_grazing as fixtures
from apps.livestock.models import CattleGrazing


class MobileGrazingExitTests(APITestCase):
    base='/api/v1/livestock/cattle/grazings/'
    setUp=fixtures.MobileGrazingTests.setUp

    def values(self):
        response=self.client.get(self.base+f'{self.open.pk}/mobile-exit-options/',self.query)
        self.assertEqual(response.status_code,200,response.data)
        return {**self.query,'grazing_version':response.data['occupation']['version'],'exit_date':str(self.today)}

    def preview(self, values=None):
        response=self.client.post(self.base+f'{self.open.pk}/close/?view=mobile-preview',values or self.values(),format='json')
        self.assertEqual(response.status_code,200,response.data)
        return response.data

    def confirm(self, review):
        return self.client.post(self.base+f'{self.open.pk}/close/?view=mobile-confirm',{'preview_token':review['preview_token']},format='json')

    def test_review_no_effect_confirm_closes_only_selected_occupation_and_replay_conflicts(self):
        review=self.preview(); self.open.refresh_from_db(); self.assertIsNone(self.open.exit_date)
        response=self.confirm(review); self.assertEqual(response.status_code,200,response.data)
        self.open.refresh_from_db(); self.assertEqual(self.open.exit_date,self.today)
        self.assertEqual(CattleGrazing.objects.count(),2)
        self.batch.refresh_from_db(); self.assertEqual(self.batch.quantity,12)
        self.assertEqual(self.confirm(review).status_code,409)

    def test_future_early_unknown_fields_and_closed_occupation_rejected(self):
        values=self.values()
        for change in [{'exit_date':'2099-01-01'},{'exit_date':'2020-01-01'},{'notes':'not supported'}]:
            self.assertEqual(self.client.post(self.base+f'{self.open.pk}/close/?view=mobile-preview',{**values,**change},format='json').status_code,400)
        self.assertEqual(self.client.get(self.base+f'{self.closed.pk}/mobile-exit-options/',self.query).status_code,409)
        self.assertEqual(self.confirm({'preview_token':'invalid'}).status_code,409)

    def test_changed_batch_and_concurrent_legacy_close_invalidate_review(self):
        review=self.preview(); self.batch.quantity=10; self.batch.save()
        self.assertEqual(self.confirm(review).status_code,409)
        review=self.preview()
        response=self.client.post(self.base+f'{self.open.pk}/close/',{'exit_date':str(self.today)},format='json')
        self.assertEqual(response.status_code,200,response.data)
        self.assertEqual(self.confirm(review).status_code,409)

    def test_same_farm_and_actor_required_operator_and_feeder_forbidden(self):
        values=self.values(); review=self.preview(values)
        self.assertEqual(self.client.get(self.base+f'{self.open.pk}/mobile-exit-options/',{**self.query,'farm':str(self.foreign_farm.pk)}).status_code,404)
        self.assertEqual(self.client.post(self.base+f'{self.closed.pk}/close/?view=mobile-confirm',{'preview_token':review['preview_token']},format='json').status_code,409)
        from django.contrib.auth import get_user_model
        other=get_user_model().objects.create_user(email='exit-other@example.invalid',password='test',role='manager',organization=self.org)
        self.client.force_authenticate(other); self.assertEqual(self.confirm(review).status_code,403)
        self.client.force_authenticate(self.user)
        for role in ['operator','feeder']:
            self.user.role=role; self.user.save(); self.user.allowed_livestock.add(self.species)
            self.assertEqual(self.client.get(self.base+f'{self.open.pk}/mobile-exit-options/',self.query).status_code,403)
            self.assertEqual(self.confirm(review).status_code,403)

    def test_inactive_batch_and_restricted_pasture_can_still_exit(self):
        self.batch.status='sold'; self.batch.quantity=0; self.batch.save()
        self.pasture.availability='blocked'; self.pasture.save()
        response=self.confirm(self.preview()); self.assertEqual(response.status_code,200,response.data)
        self.batch.refresh_from_db(); self.assertEqual(self.batch.status,'sold'); self.assertEqual(self.batch.quantity,0)

    def test_failure_after_save_rolls_back_exit(self):
        review=self.preview(); original=CattleGrazing.save
        def fail(row,*args,**kwargs):
            original(row,*args,**kwargs)
            raise RuntimeError('synthetic exit failure')
        with patch.object(CattleGrazing,'save',fail): self.assertEqual(self.confirm(review).status_code,500)
        self.open.refresh_from_db(); self.assertIsNone(self.open.exit_date)


@skipUnless(connection.vendor=='postgresql','PostgreSQL locking required')
class ConcurrentExitTests(APITransactionTestCase):
    base=MobileGrazingExitTests.base
    setUp=MobileGrazingExitTests.setUp
    values=MobileGrazingExitTests.values
    preview=MobileGrazingExitTests.preview
    def test_simultaneous_confirmations_close_once(self):
        review=self.preview(); barrier=Barrier(2)
        def run():
            close_old_connections()
            try:
                client=APIClient(); client.force_authenticate(self.user); barrier.wait(timeout=10)
                return client.post(self.base+f'{self.open.pk}/close/?view=mobile-confirm',{'preview_token':review['preview_token']},format='json').status_code
            finally: close_old_connections()
        with ThreadPoolExecutor(max_workers=2) as pool: statuses=list(pool.map(lambda _:run(),range(2)))
        self.assertEqual(sorted(statuses),[200,409]); self.open.refresh_from_db(); self.assertEqual(self.open.exit_date,self.today)
