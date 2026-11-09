from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch
from unittest import skipUnless
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from django.db import connection, close_old_connections
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APITestCase, APITransactionTestCase, APIClient
from apps.livestock.tests import test_mobile_management as fixtures
from apps.livestock.models import CattleManagement, WeightRecord
from apps.inventory.models import MovimentacaoEstoque


class MobileWeighingConfirmationTests(APITestCase):
    base='/api/v1/livestock/cattle/managements/'
    def setUp(self):
        fixtures.MobileManagementTests.setUp(self)
        self.management.entries.update(weight_kg=Decimal('420.50'))
    def review(self):
        response=self.client.get(self.base+f'{self.management.pk}/mobile-weighing-review/',self.query)
        self.assertEqual(response.status_code,200,response.data)
        return response.data
    def confirm(self, review):
        return self.client.post(self.base+f'{self.management.pk}/confirm/?view=mobile-weighing',{'preview_token':review['preview_token']},format='json')

    def test_review_no_effect_and_confirmation_updates_whole_mixed_management_once(self):
        review=self.review(); self.assertEqual(review['participant_count'],3)
        self.assertFalse(WeightRecord.objects.exists())
        self.assertEqual({entry['cattle_purpose'] for entry in review['entries']},{'beef','dairy','dual'})
        response=self.confirm(review); self.assertEqual(response.status_code,200,response.data)
        self.assertEqual(WeightRecord.objects.count(),3); self.assertFalse(MovimentacaoEstoque.objects.exists())
        self.management.refresh_from_db(); self.assertEqual(self.management.status,'confirmed'); self.assertEqual(self.management.confirmed_by,self.user)
        self.cow.refresh_from_db(); self.assertEqual(self.cow.current_weight_kg,Decimal('420.50'))
        self.assertEqual(self.confirm(review).status_code,409); self.assertEqual(WeightRecord.objects.count(),3)

    def test_historical_confirmation_preserves_more_recent_current_weight(self):
        self.management.date=self.today-timedelta(days=1); self.management.save()
        WeightRecord.objects.create(farm=self.farm,species=self.species,animal=self.cow,weighing_date=self.today,weight_kg=900)
        review=self.review(); row=next(entry for entry in review['entries'] if entry['animal']==str(self.cow.pk))
        self.assertFalse(row['updates_current']); self.assertEqual(row['latest_weight_date'],str(self.today))
        self.assertEqual(self.confirm(review).status_code,200)
        self.cow.refresh_from_db(); self.assertEqual(self.cow.current_weight_kg,Decimal(900)); self.assertEqual(WeightRecord.objects.count(),4)

    def test_new_weight_or_changed_entry_invalidates_review_without_partial_effects(self):
        review=self.review()
        WeightRecord.objects.create(farm=self.farm,species=self.species,animal=self.cow,weighing_date=self.today,weight_kg=600)
        self.assertEqual(self.confirm(review).status_code,409); self.assertEqual(WeightRecord.objects.count(),1)
        review=self.review(); self.management.entries.filter(animal=self.cow).update(weight_kg=450)
        self.assertEqual(self.confirm(review).status_code,409); self.assertEqual(WeightRecord.objects.count(),1)
        self.heifer.status='sold'; self.heifer.save()
        self.assertEqual(self.client.get(self.base+f'{self.management.pk}/mobile-weighing-review/',self.query).status_code,409)

    def test_role_scope_actor_url_and_unsupported_management_rejected(self):
        review=self.review()
        self.assertEqual(self.client.get(self.base+f'{self.management.pk}/mobile-weighing-review/',{**self.query,'farm':str(self.foreign_farm.pk)}).status_code,404)
        self.assertEqual(self.client.get(self.base+f'{self.beef_only.pk}/mobile-weighing-review/',{**self.query,'production':'beef'}).status_code,409)
        self.assertEqual(self.client.post(self.base+f'{self.beef_only.pk}/confirm/?view=mobile-weighing',{'preview_token':review['preview_token']},format='json').status_code,409)
        self.assertEqual(self.client.post(self.base+f'{self.management.pk}/confirm/?view=mobile-weighing',{'preview_token':review['preview_token'],'entries':[]},format='json').status_code,400)
        from django.contrib.auth import get_user_model
        other=get_user_model().objects.create_user(email='weigh-confirm-other@example.invalid',password='test',role='manager',organization=self.org)
        self.client.force_authenticate(other); self.assertEqual(self.confirm(review).status_code,403)
        self.client.force_authenticate(self.user)
        for role in ['operator','feeder']:
            self.user.role=role; self.user.save(); self.user.allowed_livestock.add(self.species)
            self.assertEqual(self.client.get(self.base+f'{self.management.pk}/mobile-weighing-review/',self.query).status_code,403)
            self.assertEqual(self.confirm(review).status_code,403)

    def test_failure_after_weight_write_rolls_back_records_animal_weights_and_status(self):
        review=self.review()
        from apps.livestock.cattle_services import save_cattle_weight
        calls=[]
        def fail(*args,**kwargs):
            result=save_cattle_weight(*args,**kwargs); calls.append(result.pk)
            if len(calls)==2: raise RuntimeError('synthetic weighing confirmation failure')
            return result
        with patch('apps.livestock.cattle_services.save_cattle_weight',side_effect=fail): self.assertEqual(self.confirm(review).status_code,500)
        self.assertFalse(WeightRecord.objects.exists()); self.cow.refresh_from_db(); self.assertIsNone(self.cow.current_weight_kg)
        self.management.refresh_from_db(); self.assertEqual(self.management.status,'draft'); self.assertIsNone(self.management.confirmed_at)

    def test_operational_projection_omits_cost_fields_and_stock_branch(self):
        with CaptureQueriesContext(connection) as captured:
            review=self.review()
            response=self.confirm(review)
        self.assertEqual(response.status_code,200,response.data)
        sql=' '.join(row['sql'].lower() for row in captured)
        for field in ['cost_per_animal','inventory_cost_snapshot','purchase_price']:
            self.assertNotIn(field,sql); self.assertNotIn(field,str(review))


@skipUnless(connection.vendor=='postgresql','PostgreSQL locking required')
class ConcurrentWeighingConfirmationTests(APITransactionTestCase):
    base=MobileWeighingConfirmationTests.base
    setUp=MobileWeighingConfirmationTests.setUp
    review=MobileWeighingConfirmationTests.review
    def run_race(self, legacy=False):
        review=self.review(); barrier=Barrier(2)
        def run(index):
            close_old_connections()
            try:
                client=APIClient(); client.force_authenticate(self.user); barrier.wait(timeout=10)
                url=self.base+f'{self.management.pk}/confirm/'
                return client.post(url if legacy and index==1 else url+'?view=mobile-weighing',{} if legacy and index==1 else {'preview_token':review['preview_token']},format='json').status_code
            finally: close_old_connections()
        with ThreadPoolExecutor(max_workers=2) as pool: statuses=list(pool.map(run,range(2)))
        self.assertEqual(WeightRecord.objects.count(),3)
        self.management.refresh_from_db(); self.assertEqual(self.management.status,'confirmed')
        return statuses
    def test_native_confirmations_apply_one_set_of_weights(self):
        self.assertEqual(sorted(self.run_race()),[200,409])
    def test_native_and_legacy_confirmations_share_lock_and_do_not_duplicate(self):
        self.assertIn(self.run_race(legacy=True),[[200,200],[409,200]])
