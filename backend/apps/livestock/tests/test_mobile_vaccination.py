from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.farms.models import Farm
from apps.organizations.models import Organization
from apps.inventory.models import ItemEstoque, LoteEstoque, MovimentacaoEstoque
from apps.finance.models import Transaction, PaymentEvent
from apps.livestock.models import Animal, AnimalBatch, Species, VaccinationRecord, HistoricoEvento


class MobileVaccinationTests(APITestCase):
    base = '/api/v1/livestock/vaccinations/'

    def setUp(self):
        self.today = timezone.localdate()
        self.org = Organization.objects.create(name='Vaccines', slug='mobile-vaccines')
        self.farm = Farm.objects.create(organization=self.org, name='Farm')
        self.species, _ = Species.objects.get_or_create(code='bovinos', defaults={'name': 'Bovinos'})
        self.animal = Animal.objects.create(farm=self.farm, species=self.species, identifier='A')
        self.batch = AnimalBatch.objects.create(farm=self.farm, species=self.species, batch_code='B', quantity=3, entry_date=self.today)
        self.user = get_user_model().objects.create_user(email='vaccine@example.invalid', password='test', role='manager', organization=self.org)
        self.item = ItemEstoque.objects.create(organization=self.org, nome='Vaccine', categoria='vacina', unidade_medida='ml')
        self.lot = self.make_lot('FIRST', '20', self.today + timedelta(days=10))
        self.client.force_authenticate(self.user)

    def make_lot(self, number, quantity, expiry, **changes):
        lot = LoteEstoque(item=self.item, numero_lote=number, quantidade_inicial=quantity, quantidade_atual=quantity,
                          custo_unitario='2', data_entrada=self.today, data_validade=expiry, **changes)
        lot._skip_finance_transaction = True
        lot.save()
        return lot

    def values(self, **changes):
        return dict(dict(target_kind='animal', target=str(self.animal.pk), expected_farm=str(self.farm.pk),
                         vaccine_item=str(self.item.pk), dosage_ml='2.50', application_date=str(self.today), dose_type='unica'), **changes)

    def preview(self, **changes):
        result = self.client.post(self.base + '?view=mobile-preview', self.values(**changes), format='json')
        self.assertEqual(result.status_code, 200, result.data)
        return result.data

    def confirm(self, review):
        return self.client.post(self.base + '?view=mobile-confirm', {'preview_token': review['preview_token']}, format='json')

    def test_individual_review_is_read_only_and_commit_is_exact_without_finance(self):
        review = self.preview()
        self.assertNotIn('cost', str(review))
        self.assertFalse(VaccinationRecord.objects.exists())
        self.assertFalse(MovimentacaoEstoque.objects.exists())
        result = self.confirm(review)
        self.assertEqual(result.status_code, 201, result.data)
        self.lot.refresh_from_db()
        self.assertEqual(self.lot.quantidade_atual, Decimal('17.50'))
        record = VaccinationRecord.objects.get(pk=result.data['id'])
        self.assertEqual(record.dosage_ml, Decimal('2.50'))
        self.assertEqual(record.inventory_cost_snapshot, Decimal('5'))
        self.assertEqual(HistoricoEvento.objects.get().metadata['responsible_id'], str(self.user.pk))
        self.assertFalse(Transaction.objects.exists())
        self.assertFalse(PaymentEvent.objects.exists())
        self.assertEqual(self.confirm(review).status_code, 409)
        self.assertEqual(MovimentacaoEstoque.objects.count(), 1)

    def test_batch_dose_is_per_head_and_changed_headcount_invalidates_review(self):
        review = self.preview(target_kind='batch', target=str(self.batch.pk))
        self.assertEqual(Decimal(review['inventory_quantity']), Decimal('7.50'))
        AnimalBatch.objects.filter(pk=self.batch.pk).update(quantity=4)
        self.assertEqual(self.confirm(review).status_code, 409)
        result = self.confirm(self.preview(target_kind='batch', target=str(self.batch.pk)))
        self.assertEqual(result.status_code, 201, result.data)
        self.assertEqual(VaccinationRecord.objects.get().dosage_ml, Decimal('2.50'))
        self.lot.refresh_from_db()
        self.assertEqual(self.lot.quantidade_atual, Decimal('10'))

    def test_fefo_excludes_expired_and_not_received_stock(self):
        self.make_lot('EXPIRED', '100', self.today - timedelta(days=1))
        future = self.make_lot('FUTURE', '100', None)
        LoteEstoque.objects.filter(pk=future.pk).update(data_entrada=self.today + timedelta(days=1))
        early = self.make_lot('EARLY', '1', self.today)
        review = self.preview()
        self.assertEqual([row['number'] for row in review['lots']], ['EARLY', 'FIRST'])
        self.assertEqual(Decimal(review['available']), Decimal('21'))
        self.assertEqual(self.confirm(review).status_code, 201)
        early.refresh_from_db()
        self.assertEqual(early.quantidade_atual, 0)

    def test_stock_change_invalidates_review_without_partial_write(self):
        review = self.preview()
        LoteEstoque.objects.filter(pk=self.lot.pk).update(quantidade_atual='1')
        self.assertEqual(self.confirm(review).status_code, 409)
        self.assertFalse(VaccinationRecord.objects.exists())
        self.assertFalse(MovimentacaoEstoque.objects.exists())

    def test_conversion_rejects_precision_loss_and_unconfigured_doses(self):
        self.item.unidade_medida = 'l'
        self.item.save()
        result = self.client.post(self.base + '?view=mobile-preview', self.values(), format='json')
        self.assertEqual(result.status_code, 400)
        self.item.unidade_medida = 'dose'
        self.item.volume_por_dose = '2.5 ml'
        self.item.save()
        self.assertEqual(Decimal(self.preview()['quantity_per_head']), Decimal('1'))
        self.item.volume_por_dose = ''
        self.item.save()
        self.assertEqual(self.client.post(self.base + '?view=mobile-preview', self.values(), format='json').status_code, 400)

    def test_dates_and_unknown_fields_are_rejected(self):
        for changes in [dict(application_date=str(self.today + timedelta(days=1))),
                        dict(next_dose_date=str(self.today - timedelta(days=1))), dict(dosage_ml='0'),
                        dict(inventory_cost_snapshot='1'),
                        dict(target_kind='batch', target=str(self.batch.pk), application_date=str(self.today - timedelta(days=1)))]:
            result = self.client.post(self.base + '?view=mobile-preview', self.values(**changes), format='json')
            self.assertEqual(result.status_code, 400, result.data)

    def test_foreign_target_and_readonly_operator_are_blocked(self):
        other = Organization.objects.create(name='Other', slug='vaccine-other')
        farm = Farm.objects.create(organization=other, name='Private')
        animal = Animal.objects.create(farm=farm, species=self.species, identifier='Private')
        self.assertEqual(self.client.post(self.base + '?view=mobile-preview', self.values(target=str(animal.pk)), format='json').status_code, 404)
        self.user.role = 'operator'
        self.user.operator_read_only = True
        self.user.save()
        self.user.allowed_livestock.add(self.species)
        self.assertEqual(self.client.post(self.base + '?view=mobile-preview', self.values(), format='json').status_code, 403)

    def test_audit_failure_rolls_back_stock_and_record(self):
        review = self.preview()
        with patch('apps.livestock.mobile_vaccination.remember_operator_record', side_effect=RuntimeError('synthetic')):
            result = self.confirm(review)
        self.assertEqual(result.status_code, 500)
        self.lot.refresh_from_db()
        self.assertEqual(self.lot.quantidade_atual, Decimal('20'))
        self.assertFalse(VaccinationRecord.objects.exists())
        self.assertFalse(MovimentacaoEstoque.objects.exists())

    def test_native_catalogs_and_operator_ownership(self):
        from apps.accounts.models import OperatorRecordOwnership
        self.user.role = 'operator'
        self.user.save()
        self.user.allowed_livestock.add(self.species)
        options = self.client.get(self.base + 'mobile-options/')
        self.assertEqual(options.status_code, 200, options.data)
        patients = self.client.get(self.base + 'mobile-targets/', {'kind': 'batch'})
        self.assertEqual(patients.status_code, 200, patients.data)
        self.assertEqual(patients.data['results'][0]['head_count'], 3)
        catalog = self.client.get(self.base + 'mobile-vaccines/', {'species': 'bovinos'})
        self.assertEqual(catalog.status_code, 200, catalog.data)
        self.assertTrue(catalog.data['results'][0]['configured'])
        self.assertNotIn('cost', str(catalog.data))
        result = self.confirm(self.preview())
        self.assertEqual(result.status_code, 201, result.data)
        self.assertTrue(OperatorRecordOwnership.objects.filter(user=self.user, object_id=result.data['id']).exists())

    def test_review_cannot_be_confirmed_by_another_user(self):
        review = self.preview()
        user = get_user_model().objects.create_user(email='second-vaccine@example.invalid', password='test', role='manager', organization=self.org)
        self.client.force_authenticate(user)
        self.assertEqual(self.confirm(review).status_code, 403)
        self.assertFalse(VaccinationRecord.objects.exists())
