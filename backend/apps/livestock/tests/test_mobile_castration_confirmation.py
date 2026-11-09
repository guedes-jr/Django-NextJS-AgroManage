from unittest.mock import patch
from unittest import skipUnless
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from django.db import connection, close_old_connections
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APITestCase, APITransactionTestCase, APIClient
from apps.livestock.tests import test_mobile_castration as fixtures
from apps.livestock.models import Animal, CattleAnimalProfile, CattleManagement, CattleManagementEntry, HistoricoEvento, WeightRecord, HealthRecord
from apps.inventory.models import MovimentacaoEstoque


class CastrationConfirmationTests(APITestCase):
    base='/api/v1/livestock/cattle/managements/'
    def setUp(self):
        fixtures.MobileCastrationTests.setUp(self)
        self.dairy_male=Animal.objects.create(farm=self.farm,species=self.species,identifier='DAIRY-M',gender='M',cattle_purpose='dairy')
        self.management=CattleManagement.objects.create(farm=self.farm,kind='castration',date=self.today,description='Mixed castration',created_by=self.user)
        for animal in [self.beef,self.dual,self.dairy_male]: CattleManagementEntry.objects.create(management=self.management,animal=animal)
    def review(self):
        response=self.client.get(self.base+f'{self.management.pk}/mobile-castration-review/',self.query)
        self.assertEqual(response.status_code,200,response.data); return response.data
    def confirm(self,review):
        return self.client.post(self.base+f'{self.management.pk}/confirm/?view=mobile-castration',{'preview_token':review['preview_token']},format='json')

    def test_review_no_effect_confirm_marks_all_and_records_history_once(self):
        review=self.review(); self.assertEqual(review['participant_count'],3)
        self.assertEqual(CattleAnimalProfile.objects.count(),1); self.assertFalse(HistoricoEvento.objects.exists())
        response=self.confirm(review); self.assertEqual(response.status_code,200,response.data)
        self.assertEqual(CattleAnimalProfile.objects.filter(animal__in=[self.beef,self.dual,self.dairy_male],is_castrated=True).count(),3)
        self.assertEqual(HistoricoEvento.objects.filter(tipo_evento='Castração').count(),3)
        self.management.refresh_from_db(); self.assertEqual(self.management.status,'confirmed'); self.assertEqual(self.management.confirmed_by,self.user)
        self.assertEqual(self.confirm(review).status_code,409); self.assertEqual(HistoricoEvento.objects.count(),3)
        self.assertFalse(WeightRecord.objects.exists()); self.assertFalse(HealthRecord.objects.exists()); self.assertFalse(MovimentacaoEstoque.objects.exists())

    def test_state_gender_or_entry_changes_invalidate_review(self):
        review=self.review(); CattleAnimalProfile.objects.create(animal=self.beef,is_castrated=True)
        self.assertEqual(self.confirm(review).status_code,409); self.assertFalse(HistoricoEvento.objects.exists())
        CattleAnimalProfile.objects.filter(animal=self.beef).update(is_castrated=False)
        review=self.review(); self.dual.gender='F'; self.dual.save()
        self.assertEqual(self.confirm(review).status_code,409)
        self.dual.gender='M'; self.dual.save(); review=self.review(); self.management.entries.filter(animal=self.dual).update(weight_kg=1)
        self.assertEqual(self.confirm(review).status_code,409)

    def test_tenant_scope_role_actor_and_unreviewed_fields_rejected(self):
        review=self.review()
        self.assertEqual(self.client.get(self.base+f'{self.management.pk}/mobile-castration-review/',{**self.query,'farm':str(self.foreign_farm.pk)}).status_code,404)
        self.assertEqual(self.client.post(self.base+f'{self.management.pk}/confirm/?view=mobile-castration',{'preview_token':review['preview_token'],'entries':[]},format='json').status_code,400)
        from django.contrib.auth import get_user_model
        other=get_user_model().objects.create_user(email='cas-other@example.invalid',password='test',role='manager',organization=self.org)
        self.client.force_authenticate(other); self.assertEqual(self.confirm(review).status_code,403)
        self.client.force_authenticate(self.user)
        for role in ['operator','feeder']:
            self.user.role=role; self.user.save(); self.user.allowed_livestock.add(self.species)
            self.assertEqual(self.client.get(self.base+f'{self.management.pk}/mobile-castration-review/',self.query).status_code,403)
            self.assertEqual(self.confirm(review).status_code,403)

    def test_cancelled_future_or_wrong_kind_cannot_be_confirmed(self):
        review=self.review(); self.management.status='cancelled'; self.management.save()
        self.assertEqual(self.confirm(review).status_code,409)
        self.management.status='draft'; self.management.kind='sanitary'; self.management.save()
        self.assertEqual(self.client.get(self.base+f'{self.management.pk}/mobile-castration-review/',self.query).status_code,409)
        self.assertEqual(self.confirm({'preview_token':'tampered'}).status_code,409)

    def test_history_failure_rolls_back_profiles_events_and_status(self):
        review=self.review(); original=HistoricoEvento.objects.create; calls=[]
        def fail(*args,**kwargs):
            result=original(*args,**kwargs); calls.append(result.pk)
            if len(calls)==2: raise RuntimeError('synthetic castration confirmation failure')
            return result
        with patch('apps.livestock.cattle_services.HistoricoEvento.objects.create',side_effect=fail): self.assertEqual(self.confirm(review).status_code,500)
        self.assertEqual(CattleAnimalProfile.objects.count(),1); self.assertFalse(HistoricoEvento.objects.exists())
        self.management.refresh_from_db(); self.assertEqual(self.management.status,'draft'); self.assertIsNone(self.management.confirmed_at)

    def test_operational_projection_has_no_cost_columns(self):
        with CaptureQueriesContext(connection) as captured:
            review=self.review(); response=self.confirm(review)
        self.assertEqual(response.status_code,200,response.data)
        sql=' '.join(row['sql'].lower() for row in captured)
        for field in ['purchase_price','cost_per_animal','inventory_cost_snapshot']: self.assertNotIn(field,sql)


@skipUnless(connection.vendor=='postgresql','PostgreSQL locking required')
class ConcurrentCastrationTests(APITransactionTestCase):
    base=CastrationConfirmationTests.base
    setUp=CastrationConfirmationTests.setUp
    review=CastrationConfirmationTests.review
    def race(self,legacy=False,distinct=False):
        first=self.review(); other=self.management
        if distinct:
            other=CattleManagement.objects.create(farm=self.farm,kind='castration',date=self.today,description='Other castration',created_by=self.user)
            for animal in [self.beef,self.dual,self.dairy_male]: CattleManagementEntry.objects.create(management=other,animal=animal)
            response=self.client.get(self.base+f'{other.pk}/mobile-castration-review/',self.query); self.assertEqual(response.status_code,200,response.data); second=response.data
        else: second=first
        barrier=Barrier(2)
        def run(index):
            close_old_connections()
            try:
                client=APIClient(); client.force_authenticate(self.user); barrier.wait(timeout=10)
                target=other if index else self.management
                url=self.base+f'{target.pk}/confirm/'
                return client.post(url if legacy and index else url+'?view=mobile-castration',{} if legacy and index else {'preview_token':(second if index else first)['preview_token']},format='json').status_code
            finally: close_old_connections()
        with ThreadPoolExecutor(max_workers=2) as pool: statuses=list(pool.map(run,range(2)))
        self.assertEqual(HistoricoEvento.objects.filter(tipo_evento='Castração').count(),3)
        return statuses
    def test_native_confirmations_do_not_duplicate_history(self): self.assertEqual(sorted(self.race()),[200,409])
    def test_native_and_legacy_share_management_lock(self): self.assertIn(self.race(legacy=True),[[200,200],[409,200]])
    def test_distinct_drafts_for_same_animals_cannot_both_confirm(self): self.assertEqual(sorted(self.race(distinct=True)),[200,409])
