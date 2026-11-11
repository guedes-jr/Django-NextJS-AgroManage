from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest import skipUnless
from unittest.mock import patch
from uuid import uuid4
from django.db import connection, close_old_connections
from rest_framework.test import APITestCase, APIClient, APITransactionTestCase
from apps.livestock.tests import test_mobile_cattle_import as fixture
from apps.livestock.models import Animal, Breed, WeightRecord, CattleAnimalProfile, CattlePurposeChange, Species

class MobileCattleImportConfirmationTests(APITestCase):
    base=fixture.MobileCattleImportTests.base
    animal=fixture.MobileCattleImportTests.animal
    batch=fixture.MobileCattleImportTests.batch
    setUp=fixture.MobileCattleImportTests.setUp
    csv=fixture.MobileCattleImportTests.csv
    def values(self):return {'farm':str(self.farm.pk),'production':'dairy','csv':self.csv()}
    def post(self,kind,v):return self.client.post(self.base+kind+'/?view=mobile',v,format='json')
    def review(self,v=None):
        r=self.post('import-review',v or self.values());self.assertEqual(r.status_code,200,r.data);return r.data
    def confirm(self,r,**changes):return self.post('import-confirm',{'csv':self.csv(),'preview_token':r['preview_token'],'accepted':True,**changes})
    def check(self,r,**changes):return self.post('import-check',{'csv':self.csv(),'preview_token':r['preview_token'],**changes})
    def test_review_then_atomic_creation_profiles_weights_and_purpose(self):
        r=self.review();self.assertFalse(Animal.objects.filter(identifier='NEW').exists())
        response=self.confirm(r);self.assertEqual(response.status_code,201,response.data);self.assertEqual(response.data['count'],1)
        animal=Animal.objects.get(identifier='NEW');self.assertEqual(animal.species.code,'bovinos');self.assertEqual(animal.cattle_purpose,'dairy')
        self.assertEqual(WeightRecord.objects.filter(animal=animal).count(),1);self.assertTrue(CattleAnimalProfile.objects.filter(animal=animal).exists());self.assertTrue(CattlePurposeChange.objects.filter(animal=animal).exists())
        self.assertEqual(self.confirm(r).status_code,409);self.assertEqual(Animal.objects.filter(identifier='NEW').count(),1)
    def test_invalid_review_or_changed_csv_cannot_write(self):
        self.assertEqual(self.post('import-review',{**self.values(),'csv':self.csv('C1')}).status_code,400)
        r=self.review();self.assertEqual(self.confirm(r,csv=self.csv('OTHER')).status_code,409);self.assertEqual(self.confirm(r,accepted=False).status_code,400)
        self.assertEqual(self.confirm(r,farm=str(self.foreign.pk)).status_code,400);self.assertFalse(Animal.objects.filter(identifier='NEW').exists())
    def test_intervening_identifier_conflicts_and_check_does_not_prove_batch_origin(self):
        r=self.review();other=Species.objects.create(code='suinos',name='Suínos');self.animal('NEW',species=other)
        self.assertEqual(self.confirm(r).status_code,409)
        result=self.check(r);self.assertEqual(result.status_code,200,result.data);self.assertEqual(result.data['found'],1);self.assertFalse(result.data['proves_import']);self.assertTrue(result.data['read_only']);self.assertEqual(result.data['rows'][0]['species'],'suinos')
    def test_check_missing_then_present_stays_readonly(self):
        r=self.review();self.assertEqual(self.check(r).data['missing'],1)
        self.assertEqual(self.confirm(r).status_code,201);self.assertEqual(self.check(r).data['found'],1)
        self.assertEqual(Animal.objects.filter(identifier='NEW').count(),1)
    def test_signature_actor_role_and_check_expiry_window(self):
        import time
        from apps.accounts.models import User
        r=self.review();self.assertEqual(self.confirm({**r,'preview_token':r['preview_token']+'x'}).status_code,400)
        now=time.time()
        with patch('django.core.signing.time.time',return_value=now+1800):
            self.assertEqual(self.confirm(r).status_code,400);self.assertEqual(self.check(r).status_code,200)
        other=User.objects.create_user(email='import-actor@example.invalid',password='test',organization=self.org,role='admin');self.client.force_authenticate(other);self.assertEqual(self.confirm(r).status_code,403);self.assertEqual(self.check(r).status_code,403)
        self.user.role='operator';self.user.allowed_livestock.add(self.species);self.user.save();self.client.force_authenticate(self.user);self.assertEqual(self.check(r).status_code,403)
    def test_partial_creation_failure_rolls_back_animals_breeds_weights_history(self):
        text=self.csv()+'\nSECOND;F;Vaca;'+str(self.today)+';Outra raça;400;beef'
        r=self.review({**self.values(),'csv':text});original=CattleAnimalProfile.objects.create;calls=0
        def create(**kwargs):
            nonlocal calls
            calls+=1
            if calls==2:raise RuntimeError('synthetic')
            return original(**kwargs)
        before=(Breed.objects.count(),WeightRecord.objects.count(),CattlePurposeChange.objects.count())
        with patch.object(CattleAnimalProfile.objects,'create',side_effect=create):self.assertEqual(self.confirm(r,csv=text).status_code,500)
        self.assertFalse(Animal.objects.filter(identifier__in=['NEW','SECOND']).exists());self.assertEqual(before,(Breed.objects.count(),WeightRecord.objects.count(),CattlePurposeChange.objects.count()))

@skipUnless(connection.vendor=='postgresql','PostgreSQL row locks required')
class CattleImportConfirmationConcurrencyTests(APITransactionTestCase):
    base=MobileCattleImportConfirmationTests.base
    animal=MobileCattleImportConfirmationTests.animal
    batch=MobileCattleImportConfirmationTests.batch
    setUp=MobileCattleImportConfirmationTests.setUp
    csv=MobileCattleImportConfirmationTests.csv
    values=MobileCattleImportConfirmationTests.values
    post=MobileCattleImportConfirmationTests.post
    review=MobileCattleImportConfirmationTests.review
    def race(self,legacy=False):
        r=self.review();gate=Barrier(2)
        def send(index):
            close_old_connections()
            try:
                client=APIClient();client.force_authenticate(self.user);gate.wait(timeout=10)
                if legacy and index:return client.post(self.base+'import-confirm/',{'farm':str(self.farm.pk),'rows':[{'identifier':'NEW','gender':'F','category':'Vaca','cattle_purpose':'dairy','entry_date':str(self.today)}]},format='json').status_code
                return client.post(self.base+'import-confirm/?view=mobile',{'csv':self.csv(),'preview_token':r['preview_token'],'accepted':True},format='json').status_code
            finally:close_old_connections()
        with ThreadPoolExecutor(max_workers=2) as pool:result=sorted(pool.map(send,[0,1]))
        self.assertIn(result,[[201,400],[201,409]] if legacy else [[201,409]])
        self.assertEqual(Animal.objects.filter(identifier='NEW').count(),1)
    def test_same_review_creates_once(self):self.race()
    def test_native_legacy_serialize_without_duplicate(self):self.race(True)
