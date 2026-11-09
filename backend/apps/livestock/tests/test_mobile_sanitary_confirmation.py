from unittest.mock import patch
from unittest import skipUnless
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from django.db import connection, close_old_connections
from rest_framework.test import APITestCase, APITransactionTestCase, APIClient
from apps.livestock.tests import test_mobile_castration_confirmation as fixtures
from apps.livestock.models import CattleManagement, CattleManagementEntry, HealthRecord, HistoricoEvento, WeightRecord, CattleMilkRecord
from apps.inventory.models import MovimentacaoEstoque


class SanitaryConfirmationTests(APITestCase):
    base='/api/v1/livestock/cattle/managements/'
    def setUp(self):
        fixtures.CastrationConfirmationTests.setUp(self)
        self.management.kind='sanitary'; self.management.treatment_type='exam'; self.management.next_procedure_date=self.today
        self.management.milk_withdrawal_until=self.today; self.management.save()
    def review(self):
        response=self.client.get(self.base+f'{self.management.pk}/mobile-sanitary-review/',self.query)
        self.assertEqual(response.status_code,200,response.data); return response.data
    def confirm(self,review):
        return self.client.post(self.base+f'{self.management.pk}/confirm/?view=mobile-sanitary',{'preview_token':review['preview_token']},format='json')
    def test_review_no_effect_confirmation_records_all_mixed_participants_once(self):
        review=self.review(); self.assertEqual(review['participant_count'],3); self.assertEqual(review['treatment_type'],'exam')
        self.assertEqual(review['milk_withdrawal_until'],str(self.today)); self.assertFalse(HealthRecord.objects.exists())
        response=self.confirm(review); self.assertEqual(response.status_code,200,response.data)
        self.assertEqual(set(HealthRecord.objects.values_list('animal_id',flat=True)),{self.beef.pk,self.dual.pk,self.dairy_male.pk})
        self.assertTrue(all(row.treatment_type=='exam' and row.cost==0 and row.cattle_management_id==self.management.pk for row in HealthRecord.objects.all()))
        self.management.refresh_from_db(); self.assertEqual(self.management.status,'confirmed'); self.assertEqual(self.management.confirmed_by,self.user)
        self.assertEqual(self.confirm(review).status_code,409); self.assertEqual(HealthRecord.objects.count(),3)
        for model in [HistoricoEvento,WeightRecord,MovimentacaoEstoque]: self.assertFalse(model.objects.exists())
    def test_changed_metadata_participant_state_and_entry_invalidate_token(self):
        review=self.review(); self.management.meat_withdrawal_until=self.today; self.management.save()
        self.assertEqual(self.confirm(review).status_code,409)
        review=self.review(); self.beef.status='sold'; self.beef.save(); self.assertEqual(self.confirm(review).status_code,409)
        self.beef.status='active'; self.beef.save(); review=self.review()
        self.management.entries.filter(animal=self.beef).update(weight_kg=1); self.assertEqual(self.confirm(review).status_code,409)
        self.assertFalse(HealthRecord.objects.exists())
    def test_used_milk_before_review_or_after_review_blocks_confirmation(self):
        review=self.review()
        milk=CattleMilkRecord.objects.create(animal=self.dairy_male,date=self.today,session='morning',liters=10,discarded_liters=0)
        self.assertEqual(self.confirm(review).status_code,409)
        self.assertEqual(self.client.get(self.base+f'{self.management.pk}/mobile-sanitary-review/',self.query).status_code,409)
        milk.discarded_liters=10; milk.save(); self.assertEqual(self.confirm(self.review()).status_code,200)
    def test_unsupported_kind_medication_cost_stock_date_and_cancelled_are_rejected(self):
        review=self.review()
        for change in [{'treatment_type':'medication'},{'cost_per_animal':1},{'inventory_quantity_per_animal':1},{'date':'2099-01-01'},
            {'status':'cancelled'},{'kind':'castration'},{'next_procedure_date':'2000-01-01'}]:
            with self.subTest(change=change):
                old={key:getattr(self.management,key) for key in change}
                for key,value in change.items(): setattr(self.management,key,value)
                self.management.save(); self.assertIn(self.client.get(self.base+f'{self.management.pk}/mobile-sanitary-review/',self.query).status_code,[404,409])
                for key,value in old.items(): setattr(self.management,key,value)
                self.management.save()
        self.assertEqual(self.confirm(review).status_code,409); self.assertFalse(HealthRecord.objects.exists())
    def test_tenant_role_actor_and_strict_signed_token(self):
        review=self.review()
        self.assertEqual(self.client.get(self.base+f'{self.management.pk}/mobile-sanitary-review/',{**self.query,'farm':str(self.foreign_farm.pk)}).status_code,404)
        self.assertEqual(self.client.post(self.base+f'{self.management.pk}/confirm/?view=mobile-sanitary',{'preview_token':review['preview_token'],'entries':[]},format='json').status_code,400)
        self.assertEqual(self.confirm({'preview_token':'tampered'}).status_code,409)
        from django.contrib.auth import get_user_model
        other=get_user_model().objects.create_user(email='san-other@example.invalid',password='test',role='manager',organization=self.org)
        self.client.force_authenticate(other); self.assertEqual(self.confirm(review).status_code,403); self.client.force_authenticate(self.user)
        for role in ['operator','feeder']:
            self.user.role=role; self.user.save(); self.user.allowed_livestock.add(self.species)
            self.assertEqual(self.confirm(review).status_code,403)
    def test_health_failure_rolls_back_all_records_and_confirmation(self):
        review=self.review(); original=HealthRecord.objects.create; calls=[]
        def fail(*args,**kwargs):
            result=original(*args,**kwargs); calls.append(result.pk)
            if len(calls)==2: raise RuntimeError('synthetic health confirmation failure')
            return result
        with patch('apps.livestock.cattle_services.HealthRecord.objects.create',side_effect=fail): self.assertEqual(self.confirm(review).status_code,500)
        self.assertFalse(HealthRecord.objects.exists()); self.management.refresh_from_db(); self.assertEqual(self.management.status,'draft')
        self.assertIsNone(self.management.confirmed_at)


@skipUnless(connection.vendor=='postgresql','PostgreSQL locking required')
class ConcurrentSanitaryTests(APITransactionTestCase):
    base=SanitaryConfirmationTests.base
    setUp=SanitaryConfirmationTests.setUp
    review=SanitaryConfirmationTests.review
    def race(self,legacy=False):
        review=self.review(); gate=Barrier(2)
        def write(index):
            close_old_connections()
            try:
                client=APIClient(); client.force_authenticate(self.user); gate.wait(timeout=10)
                return client.post(self.base+f'{self.management.pk}/confirm/'+('' if legacy and index else '?view=mobile-sanitary'),
                    {} if legacy and index else {'preview_token':review['preview_token']},format='json').status_code
            finally: close_old_connections()
        with ThreadPoolExecutor(max_workers=2) as pool: results=list(pool.map(write,[0,1]))
        self.assertEqual(HealthRecord.objects.count(),3)
        return sorted(results)
    def test_native_same_draft_applies_once(self): self.assertEqual(self.race(),[200,409])
    def test_web_native_share_lock_and_apply_once(self): self.assertIn(self.race(legacy=True),[[200,200],[200,409]])
