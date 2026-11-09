from datetime import timedelta
from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase
from apps.organizations.models import Organization
from apps.farms.models import Farm
from apps.inventory.models import MovimentacaoEstoque
from apps.finance.models import Transaction
from apps.livestock.models import Animal, Species, Mating, Pregnancy, HistoricoEvento


class MobileDiagnosisTests(APITestCase):
    base = '/api/v1/livestock/cattle/animals/'
    def setUp(self):
        self.today = timezone.localdate()
        self.org = Organization.objects.create(name='Diagnosis', slug='mobile-diagnosis')
        self.farm = Farm.objects.create(organization=self.org, name='Farm')
        self.species, _ = Species.objects.get_or_create(code='bovinos', defaults={'name': 'Bovinos'})
        self.animal = Animal.objects.create(farm=self.farm, species=self.species, identifier='COW', gender='F', cattle_purpose='dairy', reproductive_status='coberta')
        self.mating = Mating.objects.create(female=self.animal, mating_date=self.today-timedelta(days=30), expected_birth_date=self.today+timedelta(days=250))
        self.user = get_user_model().objects.create_user(email='diagnosis@example.invalid', password='test', role='manager', organization=self.org)
        self.client.force_authenticate(self.user)

    def options(self):
        response = self.client.get(self.base+f'{self.animal.pk}/mobile-diagnosis/', {'production': 'dairy', 'farm': str(self.farm.pk)})
        self.assertEqual(response.status_code, 200, response.data)
        return response.data

    def values(self, **changes):
        option = self.options()
        return dict(dict(expected_farm=str(self.farm.pk), expected_mating=str(self.mating.pk), animal_version=option['animal']['version'],
            mating_version=option['mating']['version'], diagnosis_date=str(self.today), result='positive'), **changes)

    def save(self, values):
        return self.client.post(self.base+f'{self.animal.pk}/diagnose-pregnancy/?production=dairy&view=mobile', values, format='json')

    def test_positive_uses_existing_transition_prediction_and_event_without_stock_finance(self):
        values = self.values()
        self.assertFalse(Pregnancy.objects.exists())
        response = self.save(values)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['mating'], str(self.mating.pk))
        self.assertEqual(response.data['status'], 'gestante')
        self.assertEqual(Pregnancy.objects.get().expected_birth_date, self.mating.expected_birth_date)
        self.mating.refresh_from_db(); self.assertEqual(self.mating.status, 'confirmed')
        self.assertEqual(HistoricoEvento.objects.filter(tipo_evento='Diagnóstico de Gestação').count(), 1)
        self.assertEqual(HistoricoEvento.objects.get(tipo_evento='Diagnóstico de Gestação').metadata['responsible_id'], str(self.user.pk))
        self.assertFalse(MovimentacaoEstoque.objects.exists()); self.assertFalse(Transaction.objects.exists())
        self.assertEqual(self.save(values).status_code, 409)

    def test_negative_restores_previous_phase_without_creating_pregnancy(self):
        self.animal.previous_phase = 'descanso'; self.animal.save()
        response = self.save(self.values(result='negative'))
        self.assertEqual(response.status_code, 200, response.data)
        self.animal.refresh_from_db(); self.mating.refresh_from_db()
        self.assertEqual(self.animal.reproductive_status, 'descanso'); self.assertEqual(self.animal.previous_phase, '')
        self.assertEqual(self.mating.status, 'failed'); self.assertFalse(Pregnancy.objects.exists())

    def test_dates_unknown_fields_and_changed_versions_are_rejected(self):
        for change in [{'diagnosis_date': str(self.today+timedelta(days=1))}, {'diagnosis_date': str(self.mating.mating_date-timedelta(days=1))}, {'result': 'maybe'}, {'cost': '100'}]:
            response = self.save(self.values(**change)); self.assertEqual(response.status_code, 400, response.data)
        values = self.values(); self.mating.notes = 'Changed'; self.mating.save()
        self.assertEqual(self.save(values).status_code, 409)
        values = self.values(); self.animal.notes = 'Changed'; self.animal.save()
        self.assertEqual(self.save(values).status_code, 409)
        self.assertFalse(Pregnancy.objects.exists())

    def test_wrong_scope_and_readonly_or_feeder_cannot_write(self):
        self.assertEqual(self.client.get(self.base+f'{self.animal.pk}/mobile-diagnosis/', {'production': 'beef'}).status_code, 404)
        values = self.values(expected_farm=str(self.org.pk))
        self.assertEqual(self.save(values).status_code, 409)
        self.user.role = 'operator'; self.user.allowed_livestock.add(self.species); self.user.save()
        values = self.values(); self.assertEqual(self.save(values).status_code, 200)
        self.user.operator_read_only = True; self.user.save()
        self.assertEqual(self.save(values).status_code, 403)
        self.user.role = 'feeder'; self.user.operator_read_only = False; self.user.save()
        self.assertEqual(self.save(values).status_code, 403)

    def test_missing_prediction_disables_positive_and_ambiguous_legacy_coverage_blocks(self):
        self.mating.expected_birth_date = None; self.mating.save()
        self.assertEqual(self.options()['allowed_results'], ['negative'])
        self.assertEqual(self.save(self.values()).status_code, 400)
        Mating.objects.create(female=self.animal, mating_date=self.mating.mating_date)
        self.assertEqual(self.client.get(self.base+f'{self.animal.pk}/mobile-diagnosis/', {'production': 'dairy'}).status_code, 409)

    def test_event_failure_rolls_back_status_pregnancy_and_mating(self):
        values = self.values()
        with patch.object(HistoricoEvento.objects, 'create', side_effect=RuntimeError('synthetic diagnosis failure')):
            response = self.save(values)
        self.assertEqual(response.status_code, 500)
        self.animal.refresh_from_db(); self.mating.refresh_from_db()
        self.assertEqual(self.animal.reproductive_status, 'coberta'); self.assertEqual(self.mating.status, 'pending_dg')
        self.assertFalse(Pregnancy.objects.exists())


from unittest import skipUnless
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from django.db import connection, close_old_connections, connections
from rest_framework.test import APITransactionTestCase, APIClient


@skipUnless(connection.vendor == 'postgresql', 'Requires PostgreSQL row locks')
class ConcurrentDiagnosisTests(APITransactionTestCase):
    base = MobileDiagnosisTests.base
    setUp = MobileDiagnosisTests.setUp
    options = MobileDiagnosisTests.options
    values = MobileDiagnosisTests.values

    def test_concurrent_diagnoses_create_one_event_and_pregnancy(self):
        body = self.values()
        user_id, animal_id = self.user.pk, self.animal.pk
        barrier = Barrier(2)
        def send():
            close_old_connections()
            try:
                client = APIClient(); client.force_authenticate(get_user_model().objects.get(pk=user_id))
                barrier.wait(timeout=15)
                return client.post(self.base+f'{animal_id}/diagnose-pregnancy/?production=dairy&view=mobile', body, format='json').status_code
            finally:
                connections.close_all()
        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = [pool.submit(send) for _ in range(2)]
            results = [future.result(timeout=30) for future in futures]
        self.assertEqual(sorted(results), [200, 409])
        self.assertEqual(Pregnancy.objects.count(), 1)
        self.assertEqual(HistoricoEvento.objects.filter(tipo_evento='Diagnóstico de Gestação').count(), 1)
