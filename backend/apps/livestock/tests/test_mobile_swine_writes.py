"""Mobile swine writes: batch weighing, coverage and pregnancy diagnosis (P11-C)."""
import uuid
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.farms.models import Farm
from apps.livestock.models import (
    Animal, AnimalBatch, Birth, HistoricoEvento, Mating, Pregnancy, Species, WeightRecord,
)
from apps.organizations.models import Organization

BASE = '/api/v1/livestock/'


class SwineMobileBase(APITestCase):
    def setUp(self):
        self.today = timezone.localdate()
        self.org = Organization.objects.create(name='Swine', slug='mobile-swine')
        self.farm = Farm.objects.create(organization=self.org, name='Granja')
        self.species, _ = Species.objects.get_or_create(code='suinos', defaults={'name': 'Suínos'})
        self.user = get_user_model().objects.create_user(
            email='swine@example.invalid', password='test', role='manager', organization=self.org,
        )
        self.client.force_authenticate(self.user)

    def other_org_farm(self):
        org = Organization.objects.create(name='Other', slug='mobile-swine-other')
        return Farm.objects.create(organization=org, name='Outra')


class SwineBatchWeightTests(SwineMobileBase):
    def setUp(self):
        super().setUp()
        self.batch = AnimalBatch.objects.create(
            farm=self.farm, species=self.species, batch_code='L-01', phase='creche',
            quantity=20, entry_date=self.today - timedelta(days=10),
        )

    def post(self, batch=None, **changes):
        body = {
            'request_key': str(uuid.uuid4()), 'phase': 'creche', 'weight_kg': '18.500',
            'weighing_date': str(self.today), 'notes': '',
        } | changes
        target = batch or self.batch
        return self.client.post(f'{BASE}batches/{target.pk}/register-weight/?species=suinos&view=mobile', body, format='json'), body

    def test_records_weight_and_retry_with_same_key_returns_the_same_receipt(self):
        response, body = self.post()
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['batch_id'], str(self.batch.pk))
        self.assertEqual(response.data['weight_kg'], '18.500')
        retry = self.client.post(f'{BASE}batches/{self.batch.pk}/register-weight/?species=suinos&view=mobile', body, format='json')
        self.assertEqual(retry.status_code, 200, retry.data)
        self.assertEqual(retry.data['id'], response.data['id'])
        self.assertEqual(WeightRecord.objects.filter(batch=self.batch).count(), 1)
        self.assertEqual(HistoricoEvento.objects.filter(lote=self.batch, tipo_evento='Pesagem de Lote').count(), 1)
        self.batch.refresh_from_db()
        self.assertEqual(self.batch.phase, 'creche')

    def test_same_key_with_different_command_conflicts(self):
        response, body = self.post()
        self.assertEqual(response.status_code, 201, response.data)
        changed = self.client.post(
            f'{BASE}batches/{self.batch.pk}/register-weight/?species=suinos&view=mobile',
            body | {'weight_kg': '19.000'}, format='json',
        )
        self.assertEqual(changed.status_code, 409)
        self.assertEqual(WeightRecord.objects.count(), 1)

    def test_rejects_stale_phase_future_date_and_unknown_fields(self):
        self.assertEqual(self.post(phase='engorda')[0].status_code, 409)
        self.assertEqual(self.post(weighing_date=str(self.today + timedelta(days=1)))[0].status_code, 400)
        self.assertEqual(self.post(weighing_date=str(self.today - timedelta(days=11)))[0].status_code, 400)
        self.assertEqual(self.post(quantity=3)[0].status_code, 400)
        self.assertFalse(WeightRecord.objects.exists())

    def test_batch_from_another_organization_is_not_found(self):
        foreign = AnimalBatch.objects.create(
            farm=self.other_org_farm(), species=self.species, batch_code='X', phase='creche',
            quantity=5, entry_date=self.today,
        )
        self.assertEqual(self.post(batch=foreign)[0].status_code, 404)
        self.assertFalse(WeightRecord.objects.exists())


class SwineMatingTests(SwineMobileBase):
    def setUp(self):
        super().setUp()
        self.animal = Animal.objects.create(
            farm=self.farm, species=self.species, identifier='M-01', gender='F', category='Marrã',
            reproductive_status='pronta', entry_date=self.today - timedelta(days=200),
        )

    def post(self, **changes):
        body = {
            'request_key': str(uuid.uuid4()), 'expected_status': 'pronta', 'mating_date': str(self.today),
            'mating_type': 'ai', 'sire_info': 'Sêmen A', 'notes': '',
        } | changes
        return self.client.post(f'{BASE}animals/{self.animal.pk}/register-mating/?species=suinos&view=mobile', body, format='json'), body

    def test_records_coverage_with_server_forecast_and_idempotent_retry(self):
        response, body = self.post()
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['expected_birth_date'], str(self.today + timedelta(days=114)))
        self.animal.refresh_from_db()
        self.assertEqual(self.animal.reproductive_status, 'coberta')
        self.assertEqual(self.animal.previous_phase, 'pronta')
        retry = self.client.post(f'{BASE}animals/{self.animal.pk}/register-mating/?species=suinos&view=mobile', body, format='json')
        self.assertEqual(retry.status_code, 200, retry.data)
        self.assertEqual(retry.data['id'], response.data['id'])
        self.assertEqual(Mating.objects.filter(female=self.animal).count(), 1)
        self.assertEqual(HistoricoEvento.objects.filter(matriz=self.animal, tipo_evento='Cobertura').count(), 1)

    def test_rejects_changed_status_pending_coverage_and_future_date(self):
        self.assertEqual(self.post(expected_status='vazia')[0].status_code, 409)
        self.assertEqual(self.post(mating_date=str(self.today + timedelta(days=1)))[0].status_code, 400)
        self.assertEqual(self.post()[0].status_code, 201)
        self.animal.refresh_from_db()
        self.assertEqual(self.post(expected_status='coberta')[0].status_code, 400)
        self.assertEqual(Mating.objects.filter(female=self.animal).count(), 1)

    def test_non_swine_female_conflicts(self):
        cattle, _ = Species.objects.get_or_create(code='bovinos', defaults={'name': 'Bovinos'})
        self.animal.species = cattle
        self.animal.save(update_fields=['species'])
        self.assertIn(self.post()[0].status_code, (404, 409))
        self.assertFalse(Mating.objects.exists())


class SwineDiagnosisTests(SwineMobileBase):
    def setUp(self):
        super().setUp()
        self.animal = Animal.objects.create(
            farm=self.farm, species=self.species, identifier='M-02', gender='F', category='Matriz',
            reproductive_status='coberta', previous_phase='pronta',
        )
        self.mating = Mating.objects.create(
            female=self.animal, mating_date=self.today - timedelta(days=25), mating_type='natural',
            expected_birth_date=self.today + timedelta(days=89),
        )

    def options(self, species='suinos'):
        return self.client.get(f'{BASE}animals/{self.animal.pk}/mobile-diagnosis/', {'species': species})

    def command(self, result='positive', **changes):
        data = self.options().data
        return {
            'expected_farm': str(self.farm.pk), 'expected_mating': data['mating']['id'],
            'animal_version': data['animal']['version'], 'mating_version': data['mating']['version'],
            'diagnosis_date': str(self.today), 'result': result,
        } | changes

    def post(self, body):
        return self.client.post(f'{BASE}animals/{self.animal.pk}/diagnose-pregnancy/?species=suinos&view=mobile', body, format='json')

    def test_options_expose_pending_coverage_and_require_swine_scope(self):
        response = self.options()
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['mating']['id'], str(self.mating.pk))
        self.assertEqual(response.data['allowed_results'], ['positive', 'negative'])
        self.assertEqual(self.options(species='bovinos').status_code, 404)

    def test_positive_confirms_pregnancy_atomically(self):
        response = self.post(self.command())
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['status'], 'gestante')
        self.animal.refresh_from_db(); self.mating.refresh_from_db()
        self.assertEqual(self.animal.reproductive_status, 'gestante')
        self.assertEqual(self.mating.status, Mating.Status.CONFIRMED)
        pregnancy = Pregnancy.objects.get(female=self.animal)
        self.assertEqual(pregnancy.mating_id, self.mating.pk)
        self.assertEqual(HistoricoEvento.objects.filter(matriz=self.animal, tipo_evento='Diagnóstico de Gestação').count(), 1)

    def test_negative_restores_previous_phase_and_fails_coverage(self):
        response = self.post(self.command('negative'))
        self.assertEqual(response.status_code, 200, response.data)
        self.animal.refresh_from_db(); self.mating.refresh_from_db()
        self.assertEqual(self.animal.reproductive_status, 'pronta')
        self.assertEqual(self.mating.status, Mating.Status.FAILED)
        self.assertFalse(Pregnancy.objects.exists())

    def test_stale_versions_and_repeated_diagnosis_conflict(self):
        body = self.command()
        self.assertEqual(self.post(body | {'expected_mating': str(uuid.uuid4())}).status_code, 409)
        self.assertEqual(self.post(body | {'diagnosis_date': str(self.today + timedelta(days=1))}).status_code, 400)
        self.assertEqual(self.post(body).status_code, 200)
        self.assertEqual(self.post(body).status_code, 409)
        self.assertEqual(Pregnancy.objects.count(), 1)


class SwineBirthTests(SwineMobileBase):
    def setUp(self):
        super().setUp()
        self.animal = Animal.objects.create(
            farm=self.farm, species=self.species, identifier='M-03', gender='F', category='Marrã',
            reproductive_status='gestante',
        )
        self.mating = Mating.objects.create(
            female=self.animal, mating_date=self.today - timedelta(days=115), mating_type='ai',
            expected_birth_date=self.today - timedelta(days=1), status=Mating.Status.CONFIRMED,
        )
        self.pregnancy = Pregnancy.objects.create(
            female=self.animal, mating=self.mating, start_date=self.mating.mating_date,
            expected_birth_date=self.mating.expected_birth_date, status=Pregnancy.Status.ONGOING,
        )

    def url(self, action, view=True):
        return f'{BASE}pregnancies/{self.pregnancy.pk}/{action}/?species=suinos' + ('&view=mobile' if view else '')

    def command(self, **changes):
        data = self.client.get(self.url('mobile-birth', view=False)).data
        return {
            'request_key': str(uuid.uuid4()), 'expected_farm': str(self.farm.pk),
            'expected_pregnancy': data['pregnancy']['id'], 'animal_version': data['animal']['version'],
            'pregnancy_version': data['pregnancy']['version'], 'birth_date': str(self.today),
            'live_born': 12, 'stillborn': 1, 'mummified': 0, 'avg_weight_kg': '1.45',
            'expected_weaning_days': data['default_weaning_days'], 'notes': '',
        } | changes

    def test_options_describe_ongoing_pregnancy(self):
        response = self.client.get(self.url('mobile-birth', view=False))
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['pregnancy']['id'], str(self.pregnancy.pk))
        self.assertEqual(response.data['birth_order'], 1)
        self.assertEqual(self.client.get(f'{BASE}pregnancies/{self.pregnancy.pk}/mobile-birth/?species=bovinos').status_code, 404)

    def test_records_birth_closes_pregnancy_creates_litter_batch_and_is_idempotent(self):
        body = self.command()
        response = self.client.post(self.url('record-birth'), body, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['status'], 'lactante')
        self.assertEqual(response.data['birth_order'], 1)
        self.pregnancy.refresh_from_db(); self.animal.refresh_from_db()
        self.assertEqual(self.pregnancy.status, Pregnancy.Status.COMPLETED)
        self.assertEqual(self.animal.category, 'Matriz')
        self.assertEqual(self.animal.birth_count, 1)
        batch = AnimalBatch.objects.get(pk=response.data['batch'])
        self.assertEqual(batch.quantity, 12)
        retry = self.client.post(self.url('record-birth'), body, format='json')
        self.assertEqual(retry.status_code, 200, retry.data)
        self.assertEqual(retry.data['id'], response.data['id'])
        self.assertEqual(Birth.objects.count(), 1)
        self.assertEqual(HistoricoEvento.objects.filter(matriz=self.animal, tipo_evento='Parto').count(), 1)
        changed = self.client.post(self.url('record-birth'), body | {'live_born': 11}, format='json')
        self.assertEqual(changed.status_code, 409)

    def test_rejects_stale_context_invalid_counts_and_dates(self):
        body = self.command()
        self.assertEqual(self.client.post(self.url('record-birth'), body | {'pregnancy_version': '2020-01-01T00:00:00Z'}, format='json').status_code, 409)
        self.assertEqual(self.client.post(self.url('record-birth'), body | {'live_born': 0, 'stillborn': 0}, format='json').status_code, 400)
        self.assertEqual(self.client.post(self.url('record-birth'), body | {'birth_date': str(self.today + timedelta(days=1))}, format='json').status_code, 400)
        self.assertEqual(self.client.post(self.url('record-birth'), body | {'birth_date': str(self.mating.mating_date - timedelta(days=1))}, format='json').status_code, 400)
        self.assertEqual(self.client.post(self.url('record-birth', view=False), body, format='json').status_code, 404)
        self.assertFalse(Birth.objects.exists())
