from unittest.mock import patch
from unittest import skipUnless
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from django.db import connection, close_old_connections
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APITestCase, APITransactionTestCase, APIClient
from apps.livestock.tests import test_cattle_improvements as fixtures
from apps.livestock.models import Animal, CattlePurposeChange


class MobileClassificationTests(APITestCase):
    base='/api/v1/livestock/cattle/operations/'
    animal=fixtures.CattleImprovementTests.animal
    batch=fixtures.CattleImprovementTests.batch
    def setUp(self):
        fixtures.CattleImprovementTests.setUp(self)
        self.beef.batch=self.source;self.beef.save();self.cow.batch=self.source;self.cow.save()
        self.inactive=self.animal('INACTIVE',batch=self.source,status='sold',cattle_purpose='unknown')
        self.query={'farm':str(self.farm.pk),'production':'beef','view':'mobile'}
    def values(self):return {'farm':str(self.farm.pk),'production':'beef','target_kind':'batches','target':str(self.source.pk),'target_version':self.source.updated_at.isoformat(),'purpose':'dairy'}
    def preview(self,values=None):
        response=self.client.post(self.base+'classification-preview/?view=mobile',values or self.values(),format='json')
        self.assertEqual(response.status_code,200,response.data);return response.data
    def confirm(self,review):return self.client.post(self.base+'classification-confirm/?view=mobile',{'preview_token':review['preview_token']},format='json')
    def test_catalog_includes_unknown_and_scope_pagination(self):
        response=self.client.get(self.base+'classification-targets/',{**self.query,'target_kind':'animals','search':'U1','page_size':1})
        self.assertEqual(response.status_code,200,response.data);self.assertEqual(response.data['count'],1);self.assertEqual(response.data['results'][0]['purpose'],'unknown')
        options=self.client.get(self.base+'classification-options/',self.query);self.assertEqual(options.status_code,200,options.data);self.assertEqual(len(options.data['purposes']),4)
    def test_batch_review_and_atomic_history_preserve_inactive_heads_and_prices(self):
        with CaptureQueriesContext(connection) as captured:review=self.preview();response=self.confirm(review)
        self.assertEqual(response.status_code,200,response.data);self.assertEqual(review['current_quantity'],10);self.assertEqual(len(review['entries']),2)
        self.assertEqual(review['changed_animals'],1);self.assertEqual(review['changed_batches'],1)
        self.source.refresh_from_db();self.beef.refresh_from_db();self.cow.refresh_from_db();self.inactive.refresh_from_db()
        self.assertEqual(self.source.cattle_purpose,'dairy');self.assertEqual(self.beef.cattle_purpose,'dairy');self.assertEqual(self.cow.cattle_purpose,'dairy')
        self.assertEqual(self.inactive.cattle_purpose,'unknown');self.assertEqual(self.source.quantity,10);self.assertEqual(self.source.purchase_value,1000)
        self.assertEqual(CattlePurposeChange.objects.count(),2);self.assertEqual(self.confirm(review).status_code,409)
        sql=' '.join(row['sql'].lower() for row in captured)
        self.assertNotIn('purchase_value',sql);self.assertNotIn('purchase_price',sql)
    def test_unknown_individual_and_incompatible_batch_rule(self):
        values={**self.values(),'target_kind':'animals','target':str(self.unknown.pk),'target_version':self.unknown.updated_at.isoformat()}
        review=self.preview(values);self.assertEqual(review['history_production'],'dairy');self.assertEqual(self.confirm(review).status_code,200)
        incompatible={**values,'target':str(self.beef.pk),'target_version':self.beef.updated_at.isoformat()}
        self.assertEqual(self.client.post(self.base+'classification-preview/?view=mobile',incompatible,format='json').status_code,400)
    def test_changed_participant_membership_or_target_invalidates_review(self):
        review=self.preview();self.beef.notes='Changed';self.beef.save();self.assertEqual(self.confirm(review).status_code,409)
        review=self.preview();self.animal('NEW',batch=self.source,cattle_purpose='beef');self.assertEqual(self.confirm(review).status_code,409)
        review=self.preview();self.source.quantity=9;self.source.save();self.assertEqual(self.confirm(review).status_code,409)
        self.assertFalse(CattlePurposeChange.objects.exists())
    def test_strict_input_tenant_roles_noop_and_signed_actor(self):
        values=self.values()
        for change in [{'purpose':'beef'},{'date':str(self.today)},{'animals':[]},{'purpose':'invalid'}]:self.assertEqual(self.client.post(self.base+'classification-preview/?view=mobile',{**values,**change},format='json').status_code,400)
        self.assertEqual(self.client.post(self.base+'classification-preview/?view=mobile',{**values,'farm':str(self.foreign.pk)},format='json').status_code,404)
        review=self.preview();self.assertEqual(self.confirm({'preview_token':'tampered'}).status_code,409)
        from django.contrib.auth import get_user_model
        other=get_user_model().objects.create_user(email='classification-other@example.invalid',password='test',role='manager',organization=self.org)
        self.client.force_authenticate(other);self.assertEqual(self.confirm(review).status_code,403);self.client.force_authenticate(self.user)
        for role in ['operator','feeder']:
            self.user.role=role;self.user.save();self.user.allowed_livestock.add(self.species);self.assertEqual(self.confirm(review).status_code,403)
    def test_history_failure_rolls_back_batch_animals_and_partial_histories(self):
        review=self.preview()
        with patch('apps.livestock.cattle_improvements.CattlePurposeChange.objects.create',side_effect=RuntimeError('synthetic')):self.assertEqual(self.confirm(review).status_code,500)
        self.source.refresh_from_db();self.beef.refresh_from_db();self.assertEqual(self.source.cattle_purpose,'beef');self.assertEqual(self.beef.cattle_purpose,'beef')
        self.assertFalse(CattlePurposeChange.objects.exists())
    def test_review_limit_prevents_partial_batch_classification(self):
        Animal.objects.bulk_create([Animal(farm=self.farm,species=self.species,identifier=f'LIMIT-{i}',batch=self.source,cattle_purpose='beef') for i in range(999)])
        self.assertEqual(self.client.post(self.base+'classification-preview/?view=mobile',self.values(),format='json').status_code,400)
        self.assertFalse(CattlePurposeChange.objects.exists())


@skipUnless(connection.vendor=='postgresql','PostgreSQL locking required')
class ClassificationConcurrencyTests(APITransactionTestCase):
    base=MobileClassificationTests.base
    setUp=MobileClassificationTests.setUp
    animal=MobileClassificationTests.animal
    batch=MobileClassificationTests.batch
    values=MobileClassificationTests.values
    preview=MobileClassificationTests.preview
    def race(self,legacy=False,individual=False):
        first=self.preview();second=first
        if individual:second=self.preview({**self.values(),'production':'dairy','target_kind':'animals','target':str(self.cow.pk),'target_version':self.cow.updated_at.isoformat(),'purpose':'beef'})
        gate=Barrier(2)
        def write(index):
            close_old_connections()
            try:
                client=APIClient();client.force_authenticate(self.user);gate.wait(timeout=10)
                if index and legacy:return client.post(self.base+'classify/',{'animals':[],'batches':[str(self.source.pk)],'purpose':'dual'},format='json').status_code
                return client.post(self.base+'classification-confirm/?view=mobile',{'preview_token':(second if index else first)['preview_token']},format='json').status_code
            finally:close_old_connections()
        with ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(write,[0,1]))
        return sorted(results)
    def test_native_confirm_applies_once(self):self.assertEqual(self.race(),[200,409]);self.assertEqual(CattlePurposeChange.objects.count(),2)
    def test_native_legacy_farm_lock_order_compatible(self):self.assertIn(self.race(legacy=True),[[200,200],[200,409]])
    def test_individual_and_batch_reviews_serialize_without_partial_changes(self):self.assertEqual(self.race(individual=True),[200,409])
