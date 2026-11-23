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

    def transition_options(self, resource, pk, action):
        response = self.client.get(f'{BASE}{resource}/{pk}/{action}/?species=suinos')
        self.assertEqual(response.status_code, 200, response.data)
        return {
            'request_key': str(uuid.uuid4()), 'expected_farm': response.data['farm'],
            'version': response.data['version'], 'date': str(self.today),
        }, response.data

    def test_mobile_loss_replays_receipt_and_blocks_other_keys_and_web_replay(self):
        body, _ = self.transition_options('pregnancies', self.pregnancy.pk, 'mobile-loss')
        body.update(reason='REABSORCAO', notes='Registro de teste')
        url = self.url('registrar-perda')
        saved = self.client.post(url, body, format='json')
        self.assertEqual(saved.status_code, 201, saved.data)
        replay = self.client.post(url, body, format='json')
        self.assertEqual(replay.status_code, 200, replay.data)
        self.assertEqual(replay.data, saved.data)
        self.assertEqual(self.client.post(url, body | {'notes': 'Changed'}, format='json').status_code, 409)
        self.assertEqual(self.client.post(url, body | {'request_key': str(uuid.uuid4())}, format='json').status_code, 409)
        self.assertEqual(self.client.post(self.url('registrar-perda', view=False), {}, format='json').status_code, 409)
        self.pregnancy.refresh_from_db()
        self.animal.refresh_from_db()
        self.assertEqual(self.pregnancy.status, Pregnancy.Status.LOST)
        self.assertEqual(self.animal.reproductive_status, Animal.ReproductiveStatus.AGUARDANDO_COBERTURA)
        self.assertEqual(HistoricoEvento.objects.filter(matriz=self.animal, tipo_evento='Perda Gestacional').count(), 1)

    def test_mobile_loss_checks_tenant_operator_and_date(self):
        body, _ = self.transition_options('pregnancies', self.pregnancy.pk, 'mobile-loss')
        body.update(reason='ABORTO', notes='')
        url = self.url('registrar-perda')
        self.assertEqual(self.client.post(url, body | {'date': '2000-01-01'}, format='json').status_code, 400)
        self.assertEqual(self.client.post(url, body | {'version': 'stale'}, format='json').status_code, 409)
        operator = get_user_model().objects.create_user(
            email='swine-operator@example.invalid', password='test', role='operator', organization=self.org,
            operator_read_only=True,
        )
        operator.allowed_livestock.add(self.species)
        self.client.force_authenticate(operator)
        self.assertEqual(self.client.post(url, body, format='json').status_code, 403)
        operator.operator_read_only = False
        operator.save(update_fields=['operator_read_only'])
        other = get_user_model().objects.create_user(
            email='swine-other@example.invalid', password='test', role='manager',
            organization=self.other_org_farm().organization,
        )
        self.client.force_authenticate(other)
        self.assertEqual(self.client.post(url, body, format='json').status_code, 404)
        self.assertEqual(self.client.get(self.url('mobile-loss')).status_code, 404)
        self.assertFalse(HistoricoEvento.objects.filter(tipo_evento='Perda Gestacional').exists())

    def test_mobile_weaning_moves_reviewed_litter_and_replays_receipt(self):
        birth_response = self.client.post(self.url('record-birth'), self.command(), format='json')
        self.assertEqual(birth_response.status_code, 201, birth_response.data)
        birth = Birth.objects.get(pk=birth_response.data['id'])
        body, options = self.transition_options('births', birth.pk, 'mobile-weaning')
        body.update(quantity=options['quantity'], weight='6.50')
        url = f'{BASE}births/{birth.pk}/desmamar/?species=suinos'
        mobile_url = url + '&view=mobile'
        self.assertEqual(self.client.post(mobile_url, body | {'quantity': 1}, format='json').status_code, 409)
        saved = self.client.post(mobile_url, body, format='json')
        self.assertEqual(saved.status_code, 201, saved.data)
        replay = self.client.post(mobile_url, body, format='json')
        self.assertEqual(replay.status_code, 200, replay.data)
        self.assertEqual(replay.data, saved.data)
        legacy = self.client.post(url, {'weaning_date': str(self.today), 'weaned_quantity': 12}, format='json')
        self.assertEqual(legacy.status_code, 400, legacy.data)
        batch = AnimalBatch.objects.get(pk=birth.batch_id)
        self.assertEqual(batch.phase, AnimalBatch.Phase.CRECHE)
        self.assertEqual(batch.quantity, 12)
        self.assertEqual(birth.litter.weaned_quantity, 12)
        self.assertEqual(HistoricoEvento.objects.filter(lote=batch, tipo_evento='Desmame').count(), 1)

    def test_partial_weaning_is_visible_in_both_clients_until_full_weaning(self):
        created = self.client.post(self.url('record-birth'), self.command(), format='json')
        self.assertEqual(created.status_code, 201, created.data)
        birth = Birth.objects.get(pk=created.data['id'])
        url = f'{BASE}births/{birth.pk}/desmamar/?species=suinos'
        mobile = url + '&view=mobile'
        command, _ = self.transition_options('births', birth.pk, 'mobile-weaning')
        first = command | {'quantity': 4, 'weight': None, 'weaning_type': 'parcial'}
        result = self.client.post(mobile, first, format='json')
        self.assertEqual(result.status_code, 201, result.data)
        self.assertEqual(result.data['remaining'], 8)
        self.assertEqual(self.client.post(mobile, first, format='json').data, result.data)
        for suffix in ('', '&view=mobile'):
            display = self.client.get(f'{BASE}maternidades/?species=suinos{suffix}')
            self.assertEqual(display.status_code, 200, display.data)
            self.assertContains(display, str(birth.pk))
            self.assertContains(display, '"vivos_atual":8')
        self.animal.refresh_from_db()
        self.assertEqual(self.animal.reproductive_status, Animal.ReproductiveStatus.LACTANTE)

        second = self.client.post(url, {
            'weaning_date': str(self.today), 'weaned_quantity': 3, 'weaning_type': 'parcial',
        }, format='json')
        self.assertEqual(second.status_code, 200, second.data)
        command, options = self.transition_options('births', birth.pk, 'mobile-weaning')
        self.assertEqual(options['quantity'], 5)
        final = self.client.post(mobile, command | {'quantity': 5, 'weight': None}, format='json')
        self.assertEqual(final.status_code, 201, final.data)
        self.assertEqual(final.data['remaining'], 0)
        for suffix in ('', '&view=mobile'):
            display = self.client.get(f'{BASE}maternidades/?species=suinos{suffix}')
            self.assertNotContains(display, str(birth.pk))
        self.assertEqual(AnimalBatch.objects.filter(mother=self.animal, phase='creche').count(), 3)
        self.animal.refresh_from_db()
        self.assertEqual(self.animal.reproductive_status, Animal.ReproductiveStatus.AGUARDANDO_COBERTURA)


class SwinePhaseTransferTests(SwineMobileBase):
    def test_advances_full_batch_through_phases_with_stable_receipt(self):
        batch = AnimalBatch.objects.create(
            farm=self.farm, species=self.species, batch_code='TRANS-01', phase='creche',
            quantity=20, entry_date=self.today - timedelta(days=10),
        )
        path = f'{BASE}batches/{batch.pk}'
        options = self.client.get(f'{path}/mobile-transfer/?species=suinos')
        self.assertEqual(options.status_code, 200, options.data)
        self.assertEqual(options.data['destination'], 'crescimento')
        command = {
            'request_key': str(uuid.uuid4()), 'expected_farm': options.data['farm'],
            'version': options.data['version'], 'date': str(self.today),
            'quantity': 20, 'weight': '24.50', 'destination': 'crescimento',
        }
        url = f'{path}/change-phase/?species=suinos&view=mobile'
        self.assertEqual(self.client.post(url, command | {'destination': 'engorda'}, format='json').status_code, 409)
        self.assertEqual(self.client.post(url, command | {'quantity': 19}, format='json').status_code, 409)
        saved = self.client.post(url, command, format='json')
        self.assertEqual(saved.status_code, 201, saved.data)
        self.assertEqual(saved.data['destination'], 'crescimento')
        self.assertEqual(self.client.post(url, command, format='json').data, saved.data)
        batch.refresh_from_db()
        self.assertEqual(batch.phase, 'crescimento')
        self.assertEqual(batch.quantity, 20)
        self.assertEqual(batch.historicos.filter(tipo_evento='Transferência de Fase').count(), 1)

        options = self.client.get(f'{path}/mobile-transfer/?species=suinos')
        self.assertEqual(options.data['destination'], 'engorda')
        next_command = command | {
            'request_key': str(uuid.uuid4()), 'version': options.data['version'],
            'destination': 'engorda', 'weight': None,
        }
        advanced = self.client.post(url, next_command, format='json')
        self.assertEqual(advanced.status_code, 201, advanced.data)
        self.assertEqual(advanced.data['destination'], 'engorda')
        self.assertEqual(self.client.post(url, command, format='json').data, saved.data)
        self.assertEqual(self.client.get(f'{path}/mobile-transfer/?species=suinos').status_code, 409)

    def test_operator_cannot_transfer_batch(self):
        batch = AnimalBatch.objects.create(
            farm=self.farm, species=self.species, batch_code='TRANS-02', phase='creche',
            quantity=20, entry_date=self.today - timedelta(days=10),
        )
        operator = get_user_model().objects.create_user(
            email='operator-transfer@example.invalid', password='test', role='operator', organization=self.org,
        )
        operator.allowed_livestock.add(self.species)
        self.client.force_authenticate(operator)
        path = f'{BASE}batches/{batch.pk}'
        self.assertEqual(self.client.get(f'{path}/mobile-transfer/?species=suinos').status_code, 403)
        self.assertEqual(self.client.post(f'{path}/change-phase/?species=suinos&view=mobile', {}, format='json').status_code, 403)


class SwineMortalityTests(SwineMobileBase):
    def test_reviewed_mortality_reduces_balance_and_last_death_closes_batch(self):
        batch = AnimalBatch.objects.create(
            farm=self.farm, species=self.species, batch_code='MORT-01', phase='creche',
            quantity=3, entry_date=self.today - timedelta(days=2),
        )
        path = f'{BASE}batches/{batch.pk}'
        options_url = f'{path}/mobile-mortality/?species=suinos'
        url = f'{path}/registrar-mortalidade/?species=suinos&view=mobile'
        options = self.client.get(options_url)
        self.assertEqual(options.status_code, 200, options.data)
        body = {
            'request_key': str(uuid.uuid4()), 'expected_farm': options.data['farm'],
            'version': options.data['version'], 'date': str(self.today),
            'quantity': 2, 'cause': 'Causa de teste', 'notes': '',
        }
        self.assertEqual(self.client.post(url, body | {'quantity': 4}, format='json').status_code, 400)
        saved = self.client.post(url, body, format='json')
        self.assertEqual(saved.status_code, 201, saved.data)
        self.assertEqual(saved.data['remaining'], 1)
        self.assertEqual(self.client.post(url, body, format='json').data, saved.data)
        self.assertEqual(self.client.post(url, body | {'request_key': str(uuid.uuid4())}, format='json').status_code, 409)

        options = self.client.get(options_url)
        closed = self.client.post(url, body | {
            'request_key': str(uuid.uuid4()), 'version': options.data['version'], 'quantity': 1,
        }, format='json')
        self.assertEqual(closed.status_code, 201, closed.data)
        self.assertEqual(closed.data['remaining'], 0)
        self.assertEqual(self.client.get(options_url).status_code, 409)
        batch.refresh_from_db()
        self.assertEqual(batch.status, AnimalBatch.Status.DEAD)
        self.assertEqual(batch.exit_date, self.today)
        self.assertEqual(batch.historicos.filter(tipo_evento='Mortalidade de Lote').count(), 2)


class SwineSaleTests(SwineMobileBase):
    def test_partial_and_full_sale_share_ledger_and_replay_receipt(self):
        from apps.finance.models import Transaction

        batch = AnimalBatch.objects.create(
            farm=self.farm, species=self.species, batch_code='SALE-01', phase='engorda',
            quantity=5, entry_date=self.today - timedelta(days=10),
        )
        path = f'{BASE}batches/{batch.pk}'
        choices = f'{path}/mobile-sale/?species=suinos'
        url = f'{path}/register-sale/?species=suinos&view=mobile'
        options = self.client.get(choices)
        self.assertEqual(options.status_code, 200, options.data)
        body = {
            'request_key': str(uuid.uuid4()), 'expected_farm': options.data['farm'],
            'version': options.data['version'], 'date': str(self.today), 'due_date': str(self.today),
            'quantity': 2, 'weight_kg': '200.500', 'price_per_kg': '4.35', 'buyer': 'Comprador', 'notes': '',
        }
        self.assertEqual(self.client.post(url, body | {'due_date': str(self.today - timedelta(days=1))}, format='json').status_code, 400)
        saved = self.client.post(url, body, format='json')
        self.assertEqual(saved.status_code, 201, saved.data)
        self.assertEqual(saved.data['amount'], '872.18')
        self.assertEqual(saved.data['remaining'], 3)
        self.assertEqual(self.client.post(url, body, format='json').data, saved.data)
        self.assertEqual(self.client.post(url, body | {'buyer': 'Outro'}, format='json').status_code, 409)
        self.assertEqual(self.client.post(url, body | {'request_key': str(uuid.uuid4())}, format='json').status_code, 409)

        options = self.client.get(choices)
        closed = self.client.post(url, body | {
            'request_key': str(uuid.uuid4()), 'version': options.data['version'], 'quantity': 3,
        }, format='json')
        self.assertEqual(closed.status_code, 201, closed.data)
        self.assertEqual(closed.data['remaining'], 0)
        batch.refresh_from_db()
        self.assertEqual(batch.status, AnimalBatch.Status.SOLD)
        self.assertEqual(Transaction.objects.filter(animal_batch=batch, status='pending').count(), 2)
        self.assertEqual(batch.historicos.filter(tipo_evento='Venda de Animais').count(), 2)
        sales_url = f'{BASE}batches/sales/?species=suinos'
        sales = self.client.get(sales_url)
        self.assertEqual(sales.status_code, 200, sales.data)
        self.assertEqual(len(sales.data), 2)
        self.assertTrue(all('mobile_sale' not in row for row in sales.data))

        operator = get_user_model().objects.create_user(
            email='operator-sale@example.invalid', password='test', role='operator', organization=self.org,
        )
        operator.allowed_livestock.add(self.species)
        self.client.force_authenticate(operator)
        self.assertEqual(self.client.get(choices).status_code, 403)
        self.assertEqual(self.client.get(sales_url).status_code, 403)
        self.assertEqual(self.client.post(url, body, format='json').status_code, 403)
        detail = self.client.get(f'{path}/?species=suinos&view=mobile')
        self.assertEqual(detail.status_code, 200, detail.data)
        self.assertNotIn('sale_summary', detail.data)
        self.assertNotIn('sale_value', detail.data)
        history = self.client.get(f'{path}/history/?species=suinos&view=mobile')
        self.assertEqual(history.status_code, 200, history.data)
        sales = [row for row in history.data['results'] if row['type'] == 'sale']
        self.assertEqual(len(sales), 2)
        self.assertTrue(all('amount' not in row and 'buyer' not in row and 'mobile_sale' not in row for row in sales))


class SwineCloseBalanceTests(SwineMobileBase):
    def test_mobile_close_uses_web_adjustment_and_replays_same_receipt(self):
        from apps.finance.models import Transaction

        batch = AnimalBatch.objects.create(
            farm=self.farm, species=self.species, batch_code='CLOSE-01', phase='engorda',
            quantity=5, entry_date=self.today - timedelta(days=10),
        )
        path = f'{BASE}batches/{batch.pk}'
        options = self.client.get(f'{path}/mobile-close/?species=suinos')
        self.assertEqual(options.status_code, 200, options.data)
        command = {
            'request_key': str(uuid.uuid4()), 'expected_farm': options.data['farm'],
            'version': options.data['version'], 'date': str(self.today),
            'quantity': 5, 'reason': 'Saldo conferido',
        }
        url = f'{path}/close-balance/?species=suinos&view=mobile'
        self.assertEqual(self.client.post(url, command | {'quantity': 4}, format='json').status_code, 409)
        saved = self.client.post(url, command, format='json')
        self.assertEqual(saved.status_code, 201, saved.data)
        self.assertEqual(saved.data['remaining'], 0)
        self.assertEqual(saved.data['status'], 'finished')
        self.assertEqual(self.client.post(url, command, format='json').data, saved.data)
        self.assertEqual(self.client.post(url, command | {'reason': 'Outro'}, format='json').status_code, 409)
        self.assertEqual(batch.historicos.filter(tipo_evento='Encerramento de Saldo').count(), 1)
        self.assertFalse(Transaction.objects.filter(animal_batch=batch).exists())
        for suffix in ('', '&view=mobile'):
            history = self.client.get(f'{path}/history/?species=suinos{suffix}')
            self.assertEqual(history.status_code, 200, history.data)
            rows = history.data['results'] if suffix else history.data
            adjustment = next(row for row in rows if row['type'] == 'balance_close')
            self.assertEqual(adjustment['quantity'], 5)
        batch.refresh_from_db()
        self.assertEqual(batch.quantity, 0)
        self.assertEqual(batch.exit_date, self.today)
