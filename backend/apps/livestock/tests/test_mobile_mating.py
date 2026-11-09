from datetime import timedelta
from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase
from apps.accounts.models import OperatorRecordOwnership
from apps.organizations.models import Organization
from apps.farms.models import Farm
from apps.livestock.models import Animal, Species, Mating, HistoricoEvento, CattleAnimalProfile
from apps.inventory.models import MovimentacaoEstoque
from apps.finance.models import Transaction

class MobileMatingTests(APITestCase):
    base = '/api/v1/livestock/cattle/animals/'
    def setUp(self):
        self.today = timezone.localdate()
        self.org = Organization.objects.create(name='Mating', slug='mobile-mating')
        self.farm = Farm.objects.create(organization=self.org, name='Farm')
        self.species, _ = Species.objects.get_or_create(code='bovinos', defaults={'name': 'Bovinos'})
        self.animal = Animal.objects.create(farm=self.farm, species=self.species, identifier='COW', gender='F', cattle_purpose='dairy', reproductive_status='lactante')
        self.sire = Animal.objects.create(farm=self.farm, species=self.species, identifier='BULL', gender='M', cattle_purpose='beef')
        self.user = get_user_model().objects.create_user(email='mating@example.invalid', password='test', role='manager', organization=self.org)
        self.client.force_authenticate(self.user)
    def values(self, **changes):
        response = self.client.get(self.base+f'{self.animal.pk}/mobile-mating/', {'production': 'dairy'})
        self.assertEqual(response.status_code, 200, response.data)
        return dict(dict(expected_farm=str(self.farm.pk), animal_version=response.data['animal']['version'], mating_date=str(self.today), mating_type='ai', sire=None, expected_sire_farm=None, sire_version=None, sire_info='Reported semen', expected_diagnosis_date=str(self.today+timedelta(days=30)), notes='Recorded'), **changes)
    def preview(self, body):
        response = self.client.post(self.base+f'{self.animal.pk}/register-mating/?production=dairy&view=mobile-preview', body, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        return response.data
    def confirm(self, review):
        return self.client.post(self.base+f'{self.animal.pk}/register-mating/?production=dairy&view=mobile-confirm', {'preview_token': review['preview_token']}, format='json')
    def test_ai_preview_is_read_only_and_commit_preserves_lactation_and_server_prediction(self):
        review = self.preview(self.values())
        self.assertFalse(Mating.objects.exists()); self.assertFalse(CattleAnimalProfile.objects.exists())
        self.assertEqual(review['expected_birth_date'], str(self.today+timedelta(days=283)))
        response = self.confirm(review)
        self.assertEqual(response.status_code, 201, response.data)
        self.animal.refresh_from_db()
        self.assertEqual(self.animal.reproductive_status, 'coberta'); self.assertEqual(self.animal.previous_phase, 'lactante')
        self.assertTrue(CattleAnimalProfile.objects.get(animal=self.animal).is_lactating)
        self.assertEqual(Mating.objects.get().expected_diagnosis_date, self.today+timedelta(days=30))
        self.assertEqual(self.confirm(review).status_code, 409)
        self.assertFalse(MovimentacaoEstoque.objects.exists()); self.assertFalse(Transaction.objects.exists())
    def test_natural_selects_real_male_and_rejects_changed_sire(self):
        values = self.values(mating_type='natural', sire=str(self.sire.pk), expected_sire_farm=str(self.farm.pk), sire_version=self.sire.updated_at.isoformat(), sire_info='')
        review = self.preview(values)
        self.sire.status = 'sold'; self.sire.save()
        self.assertEqual(self.confirm(review).status_code, 409)
        self.sire.status = 'active'; self.sire.save()
        values['sire_version'] = self.sire.updated_at.isoformat()
        self.assertEqual(self.confirm(self.preview(values)).status_code, 201)
        self.assertEqual(Mating.objects.get().sire, self.sire)
    def test_strict_fields_dates_and_origin_requirements(self):
        for changes in [{'sire_info': ''}, {'mating_type': 'natural'}, {'mating_date': str(self.today+timedelta(days=1))}, {'expected_diagnosis_date': str(self.today-timedelta(days=1))}, {'status':'confirmed'}, {'semen_quantity': '1'}]:
            response = self.client.post(self.base+f'{self.animal.pk}/register-mating/?production=dairy&view=mobile-preview', self.values(**changes), format='json')
            self.assertEqual(response.status_code, 400, response.data)
    def test_operator_ownership_and_readonly_guard(self):
        self.user.role = 'operator'; self.user.allowed_livestock.add(self.species); self.user.save()
        response = self.confirm(self.preview(self.values()))
        self.assertEqual(response.status_code, 201, response.data)
        self.assertTrue(OperatorRecordOwnership.objects.filter(user=self.user, object_id=response.data['id']).exists())
        self.user.operator_read_only = True; self.user.save()
        self.assertEqual(self.client.get(self.base+'mobile-mating-sires/').status_code, 403)
    def test_foreign_farm_species_and_inactive_sire_are_not_offered(self):
        other = Organization.objects.create(name='Other', slug='mating-other')
        foreign_farm = Farm.objects.create(organization=other, name='Other')
        Animal.objects.create(farm=foreign_farm, species=self.species, identifier='PRIVATE', gender='M')
        response = self.client.get(self.base+'mobile-mating-sires/')
        self.assertEqual(response.status_code, 200, response.data); self.assertEqual(response.data['count'], 1)
        self.assertEqual(self.client.get(self.base+f'{self.animal.pk}/mobile-mating/', {'production':'beef'}).status_code, 404)
    def test_failure_rolls_back_profile_mating_event_and_status(self):
        review = self.preview(self.values())
        with patch.object(HistoricoEvento.objects, 'create', side_effect=RuntimeError('synthetic mating failure')):
            response = self.confirm(review)
        self.assertEqual(response.status_code, 500)
        self.animal.refresh_from_db(); self.assertEqual(self.animal.reproductive_status, 'lactante')
        self.assertFalse(Mating.objects.exists()); self.assertFalse(CattleAnimalProfile.objects.exists())
    def test_native_coverage_can_proceed_to_native_diagnosis_with_lactation_preserved(self):
        response = self.confirm(self.preview(self.values(mating_type='iatf')))
        self.assertEqual(response.status_code, 201, response.data)
        option = self.client.get(self.base+f'{self.animal.pk}/mobile-diagnosis/', {'production':'dairy'}).data
        self.assertEqual(option['mating']['id'], response.data['id'])
        diagnosis = self.client.post(self.base+f'{self.animal.pk}/diagnose-pregnancy/?production=dairy&view=mobile', {
            'expected_farm':str(self.farm.pk), 'expected_mating':option['mating']['id'],
            'animal_version':option['animal']['version'], 'mating_version':option['mating']['version'],
            'diagnosis_date':str(self.today), 'result':'positive'}, format='json')
        self.assertEqual(diagnosis.status_code, 200, diagnosis.data)
        self.assertTrue(CattleAnimalProfile.objects.get(animal=self.animal).is_lactating)
        self.assertFalse(MovimentacaoEstoque.objects.exists())

    def test_review_actor_and_foreign_sire_are_revalidated(self):
        review = self.preview(self.values())
        other_user = get_user_model().objects.create_user(email='other-mating@example.invalid', password='test', role='manager', organization=self.org)
        self.client.force_authenticate(other_user)
        self.assertEqual(self.confirm(review).status_code, 403)
        foreign = Organization.objects.create(name='Foreign sire', slug='mating-foreign-sire')
        foreign_farm = Farm.objects.create(organization=foreign, name='Private')
        sire = Animal.objects.create(farm=foreign_farm, species=self.species, identifier='PRIVATE', gender='M')
        body = self.values(mating_type='natural', sire=str(sire.pk), expected_sire_farm=str(foreign_farm.pk), sire_version=sire.updated_at.isoformat(), sire_info='')
        response = self.client.post(self.base+f'{self.animal.pk}/register-mating/?production=dairy&view=mobile-preview', body, format='json')
        self.assertEqual(response.status_code, 409)
        self.assertFalse(Mating.objects.exists())


from unittest import skipUnless
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from django.db import connection, close_old_connections, connections
from rest_framework.test import APITransactionTestCase, APIClient

@skipUnless(connection.vendor == 'postgresql', 'Requires PostgreSQL row locks')
class ConcurrentMatingTests(APITransactionTestCase):
    base = MobileMatingTests.base
    setUp = MobileMatingTests.setUp
    values = MobileMatingTests.values
    preview = MobileMatingTests.preview
    def test_concurrent_confirmation_creates_one_mating_and_event(self):
        review = self.preview(self.values())
        user_id, animal_id = self.user.pk, self.animal.pk
        barrier = Barrier(2)
        def send():
            close_old_connections()
            try:
                client = APIClient(); client.force_authenticate(get_user_model().objects.get(pk=user_id))
                barrier.wait(timeout=15)
                return client.post(self.base+f'{animal_id}/register-mating/?production=dairy&view=mobile-confirm', {'preview_token':review['preview_token']}, format='json').status_code
            finally:
                connections.close_all()
        with ThreadPoolExecutor(max_workers=2) as workers:
            futures = [workers.submit(send) for _ in range(2)]
            results = [future.result(timeout=30) for future in futures]
        self.assertEqual(sorted(results), [201, 409])
        self.assertEqual(Mating.objects.count(), 1)
        self.assertEqual(HistoricoEvento.objects.filter(tipo_evento='Cobertura').count(), 1)
