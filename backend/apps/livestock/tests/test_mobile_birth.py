from datetime import timedelta
from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase
from apps.accounts.models import OperatorRecordOwnership
from apps.organizations.models import Organization
from apps.farms.models import Farm
from apps.livestock.models import Animal, Species, Mating, Pregnancy, Birth, WeightRecord, CattleAnimalProfile, HistoricoEvento
from apps.inventory.models import MovimentacaoEstoque
from apps.finance.models import Transaction

class MobileBirthTests(APITestCase):
    base = '/api/v1/livestock/cattle/animals/'
    def setUp(self):
        self.today = timezone.localdate()
        self.org = Organization.objects.create(name='Birth', slug='mobile-birth')
        self.farm = Farm.objects.create(organization=self.org, name='Farm')
        self.species, _ = Species.objects.get_or_create(code='bovinos', defaults={'name':'Bovinos'})
        self.animal = Animal.objects.create(farm=self.farm, species=self.species, identifier='COW', gender='F', category='Novilha', cattle_purpose='dairy', reproductive_status='gestante')
        self.mating = Mating.objects.create(female=self.animal, mating_date=self.today-timedelta(days=283), expected_birth_date=self.today, status='confirmed', sire_info='Reported semen')
        self.pregnancy = Pregnancy.objects.create(female=self.animal, mating=self.mating, start_date=self.mating.mating_date, expected_birth_date=self.today)
        self.user = get_user_model().objects.create_user(email='birth@example.invalid', password='test', role='manager', organization=self.org)
        self.client.force_authenticate(self.user)
    def values(self, **changes):
        response = self.client.get(self.base+f'{self.animal.pk}/mobile-birth/', {'production':'dairy'})
        self.assertEqual(response.status_code, 200, response.data)
        return dict(dict(expected_farm=str(self.farm.pk), animal_version=response.data['animal']['version'], expected_pregnancy=str(self.pregnancy.pk), pregnancy_version=response.data['pregnancy']['version'], date=str(self.today), outcome='alive', calf_identifier='0001', calf_gender='F', calf_purpose='dairy', weight_kg='32.50', notes='Recorded birth'), **changes)
    def preview(self, body):
        result = self.client.post(self.base+f'{self.animal.pk}/record-birth/?production=dairy&view=mobile-preview', body, format='json')
        self.assertEqual(result.status_code, 200, result.data)
        return result.data
    def confirm(self, review):
        return self.client.post(self.base+f'{self.animal.pk}/record-birth/?production=dairy&view=mobile-confirm', {'preview_token':review['preview_token']}, format='json')
    def test_alive_review_has_no_effect_and_confirm_creates_linked_calf_weight_and_lactation(self):
        review = self.preview(self.values())
        self.assertFalse(Birth.objects.exists()); self.assertEqual(Animal.objects.count(), 1)
        result = self.confirm(review); self.assertEqual(result.status_code, 201, result.data)
        calf = Animal.objects.get(pk=result.data['calf_id'])
        self.assertEqual(calf.identifier, '0001'); self.assertEqual(calf.dam_ref, self.animal)
        self.assertEqual(calf.cattle_purpose, 'dairy'); self.assertEqual(calf.sire_name, 'Reported semen')
        self.assertEqual(WeightRecord.objects.get(animal=calf).weight_kg, calf.initial_weight_kg)
        self.animal.refresh_from_db(); self.pregnancy.refresh_from_db()
        self.assertEqual(self.pregnancy.status, 'completed'); self.assertEqual(self.animal.reproductive_status, 'lactante')
        self.assertEqual(self.animal.category, 'Vaca'); self.assertEqual(self.animal.birth_count, 1)
        self.assertTrue(CattleAnimalProfile.objects.get(animal=self.animal).is_lactating)
        self.assertEqual(self.confirm(review).status_code, 409)
        self.assertFalse(MovimentacaoEstoque.objects.exists()); self.assertFalse(Transaction.objects.exists())
    def test_stillborn_has_no_live_calf_or_weight_record(self):
        result = self.confirm(self.preview(self.values(outcome='stillborn', calf_identifier='', calf_gender=None, calf_purpose=None, weight_kg=None)))
        self.assertEqual(result.status_code, 201, result.data); self.assertIsNone(result.data['calf_id'])
        self.assertEqual(Animal.objects.count(), 1); self.assertFalse(WeightRecord.objects.exists())
        self.assertEqual(Birth.objects.get().stillborn, 1)
    def test_strict_origin_identifier_date_and_precision_validation(self):
        for change in [{'calf_identifier':''}, {'calf_gender':None}, {'calf_purpose':None}, {'outcome':'stillborn'}, {'weight_kg':'0'}, {'weight_kg':'1.001'}, {'date':str(self.today+timedelta(days=1))}, {'date':str(self.mating.mating_date-timedelta(days=1))}, {'cost':'12'}]:
            result = self.client.post(self.base+f'{self.animal.pk}/record-birth/?production=dairy&view=mobile-preview', self.values(**change), format='json')
            self.assertEqual(result.status_code, 400, result.data)
        Animal.objects.create(farm=self.farm, species=self.species, identifier='0001')
        self.assertEqual(self.client.post(self.base+f'{self.animal.pk}/record-birth/?production=dairy&view=mobile-preview', self.values(), format='json').status_code, 400)
    def test_changed_pregnancy_or_new_duplicate_identifier_blocks_confirmation(self):
        review = self.preview(self.values())
        self.pregnancy.notes = 'Changed'; self.pregnancy.save()
        self.assertEqual(self.confirm(review).status_code, 409)
        review = self.preview(self.values())
        Animal.objects.create(farm=self.farm, species=self.species, identifier='0001')
        self.assertEqual(self.confirm(review).status_code, 409); self.assertFalse(Birth.objects.exists())
    def test_operator_ownership_readonly_and_scope(self):
        self.assertEqual(self.client.get(self.base+f'{self.animal.pk}/mobile-birth/', {'production':'beef'}).status_code, 404)
        self.user.role='operator'; self.user.allowed_livestock.add(self.species); self.user.save()
        result = self.confirm(self.preview(self.values(calf_purpose='dual')))
        self.assertEqual(result.status_code, 201, result.data)
        for record_id in [result.data['birth_id'], result.data['calf_id']]:
            self.assertTrue(OperatorRecordOwnership.objects.filter(user=self.user, object_id=record_id).exists())
        self.user.operator_read_only=True; self.user.save()
        self.assertEqual(self.client.get(self.base+f'{self.animal.pk}/mobile-birth/', {'production':'dairy'}).status_code, 403)
    def test_failure_in_owner_record_rolls_back_birth_calf_weight_and_pregnancy(self):
        self.user.role='operator'; self.user.allowed_livestock.add(self.species); self.user.save()
        review = self.preview(self.values())
        with patch.object(OperatorRecordOwnership.objects, 'get_or_create', side_effect=RuntimeError('synthetic birth ownership failure')):
            result = self.confirm(review)
        self.assertEqual(result.status_code, 500)
        self.pregnancy.refresh_from_db(); self.animal.refresh_from_db()
        self.assertEqual(self.pregnancy.status, 'ongoing'); self.assertEqual(self.animal.reproductive_status, 'gestante')
        self.assertFalse(Birth.objects.exists()); self.assertEqual(Animal.objects.count(), 1)
        self.assertFalse(WeightRecord.objects.exists()); self.assertFalse(CattleAnimalProfile.objects.exists())
        self.assertFalse(HistoricoEvento.objects.filter(tipo_evento='Parto bovino').exists())
    def test_calf_explicit_beef_purpose_is_visible_in_the_beef_native_roster(self):
        result = self.confirm(self.preview(self.values(calf_purpose='beef')))
        self.assertEqual(result.status_code, 201, result.data)
        page = self.client.get(self.base, {'production':'beef','view':'operational'})
        self.assertEqual(page.status_code, 200, page.data)
        self.assertIn(result.data['calf_id'], [str(row['id']) for row in page.data['results']])
    def test_foreign_mating_link_and_other_review_actor_are_rejected(self):
        review = self.preview(self.values())
        other_user = get_user_model().objects.create_user(email='other-birth@example.invalid', password='test', role='manager', organization=self.org)
        self.client.force_authenticate(other_user)
        self.assertEqual(self.confirm(review).status_code, 403)
        foreign = Organization.objects.create(name='Other birth', slug='birth-other')
        farm = Farm.objects.create(organization=foreign, name='Other')
        female = Animal.objects.create(farm=farm, species=self.species, identifier='PRIVATE', gender='F')
        Mating.objects.filter(pk=self.mating.pk).update(female=female)
        response = self.client.get(self.base+f'{self.animal.pk}/mobile-birth/', {'production':'dairy'})
        self.assertEqual(response.status_code, 409)
        self.assertFalse(Birth.objects.exists())


from unittest import skipUnless
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from django.db import connection, close_old_connections, connections
from rest_framework.test import APITransactionTestCase, APIClient

@skipUnless(connection.vendor == 'postgresql', 'Requires PostgreSQL row locks')
class ConcurrentBirthTests(APITransactionTestCase):
    base = MobileBirthTests.base
    setUp = MobileBirthTests.setUp
    values = MobileBirthTests.values
    preview = MobileBirthTests.preview
    def test_concurrent_confirmations_create_one_birth_and_calf(self):
        review = self.preview(self.values())
        user_id, animal_id = self.user.pk, self.animal.pk
        barrier = Barrier(2)
        def send():
            close_old_connections()
            try:
                client = APIClient(); client.force_authenticate(get_user_model().objects.get(pk=user_id))
                barrier.wait(timeout=15)
                return client.post(self.base+f'{animal_id}/record-birth/?production=dairy&view=mobile-confirm', {'preview_token':review['preview_token']}, format='json').status_code
            finally:
                connections.close_all()
        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = [pool.submit(send) for _ in range(2)]
            results = [future.result(timeout=30) for future in futures]
        self.assertEqual(sorted(results), [201, 409])
        self.assertEqual(Birth.objects.count(), 1); self.assertEqual(Animal.objects.count(), 2)
        self.assertEqual(WeightRecord.objects.count(), 1)
        self.assertEqual(HistoricoEvento.objects.filter(tipo_evento='Parto bovino').count(), 1)
