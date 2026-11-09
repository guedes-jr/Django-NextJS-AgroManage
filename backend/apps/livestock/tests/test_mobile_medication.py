from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase
from apps.organizations.models import Organization
from apps.farms.models import Farm
from apps.inventory.models import ItemEstoque, LoteEstoque, MovimentacaoEstoque
from apps.finance.models import Transaction, PaymentEvent
from apps.livestock.models import Animal, Species, CattleManagement, HealthRecord, CattleMilkRecord


class MobileMedicationTests(APITestCase):
    base = '/api/v1/livestock/cattle/managements/'

    def setUp(self):
        self.today = timezone.localdate()
        self.org = Organization.objects.create(name='Medication', slug='mobile-medication')
        self.farm = Farm.objects.create(organization=self.org, name='Farm')
        self.species, _ = Species.objects.get_or_create(code='bovinos', defaults={'name': 'Bovinos'})
        self.animal = Animal.objects.create(farm=self.farm, species=self.species, identifier='A', gender='F')
        self.user = get_user_model().objects.create_user(email='medication@example.invalid', password='test', role='manager', organization=self.org)
        self.item = ItemEstoque.objects.create(organization=self.org, nome='Medicine', categoria='medicamento', unidade_medida='ml', carencia_dias=3)
        self.lot = LoteEstoque(item=self.item, numero_lote='MED-1', quantidade_inicial='20', quantidade_atual='20', custo_unitario='2', data_entrada=self.today)
        self.lot._skip_finance_transaction = True
        self.lot.save()
        self.client.force_authenticate(self.user)

    def values(self, **changes):
        return dict(dict(animal=str(self.animal.pk), expected_farm=str(self.farm.pk), inventory_lot=str(self.lot.pk), expected_unit='ml', quantity='2.50', date=str(self.today), description='Medication performed', responsible='Professional', notes='Recorded', milk_withdrawal_until=str(self.today+timedelta(days=3)), meat_withdrawal_until=str(self.today+timedelta(days=3))), **changes)

    def preview(self, **changes):
        response = self.client.post(self.base+'mobile-medication-preview/', self.values(**changes), format='json')
        self.assertEqual(response.status_code, 200, response.data)
        return response.data

    def confirm(self, review):
        return self.client.post(self.base+'mobile-medication-confirm/', {'preview_token': review['preview_token']}, format='json')

    def test_review_commit_uses_existing_management_and_exact_stock_once_without_payment(self):
        review = self.preview()
        self.assertNotIn('cost', str(review))
        self.assertFalse(CattleManagement.objects.exists())
        self.assertFalse(MovimentacaoEstoque.objects.exists())
        response = self.confirm(review)
        self.assertEqual(response.status_code, 201, response.data)
        management = CattleManagement.objects.get(pk=response.data['management'])
        self.assertEqual(management.status, 'confirmed')
        self.assertEqual(management.created_by, self.user)
        self.assertEqual(management.confirmed_by, self.user)
        self.assertEqual(HealthRecord.objects.get(pk=response.data['id']).cattle_management, management)
        self.lot.refresh_from_db()
        self.assertEqual(self.lot.quantidade_atual, Decimal('17.50'))
        self.assertEqual(self.confirm(review).status_code, 409)
        self.assertEqual(MovimentacaoEstoque.objects.count(), 1)
        self.assertFalse(Transaction.objects.exists())
        self.assertFalse(PaymentEvent.objects.exists())

    def test_withdrawal_and_usable_milk_conflict_are_enforced_before_any_write(self):
        for changes in [dict(milk_withdrawal_until=None), dict(meat_withdrawal_until=str(self.today)), dict(expected_unit='l'), dict(quantity='21'), dict(quantity='0'), dict(cost_per_animal='100')]:
            response = self.client.post(self.base+'mobile-medication-preview/', self.values(**changes), format='json')
            self.assertEqual(response.status_code, 400, response.data)
        CattleMilkRecord.objects.create(animal=self.animal, date=self.today, session='morning', liters='5')
        self.assertEqual(self.client.post(self.base+'mobile-medication-preview/', self.values(), format='json').status_code, 400)
        self.assertFalse(CattleManagement.objects.exists())

    def test_changed_stock_context_or_carencia_invalidates_review(self):
        for target, changes in [(self.lot, {'quantidade_atual': Decimal('19')}), (self.item, {'carencia_dias': 5}), (self.animal, {'status': 'sold'})]:
            review = self.preview()
            old = {key: getattr(target, key) for key in changes}
            for key, value in changes.items(): setattr(target, key, value)
            target.save()
            self.assertEqual(self.confirm(review).status_code, 409)
            for key, value in old.items(): setattr(target, key, value)
            target.save()
        self.assertFalse(HealthRecord.objects.exists())
        self.assertFalse(MovimentacaoEstoque.objects.exists())

    def test_expired_future_received_and_foreign_lots_are_rejected(self):
        for changes in [{'data_validade': self.today-timedelta(days=1)}, {'data_entrada': self.today+timedelta(days=1)}]:
            LoteEstoque.objects.filter(pk=self.lot.pk).update(**changes)
            self.assertEqual(self.client.post(self.base+'mobile-medication-preview/', self.values(), format='json').status_code, 400)
            LoteEstoque.objects.filter(pk=self.lot.pk).update(data_validade=None, data_entrada=self.today)
        foreign = Organization.objects.create(name='Other', slug='medication-other')
        self.item.organization = foreign
        self.item.save()
        self.assertEqual(self.client.post(self.base+'mobile-medication-preview/', self.values(), format='json').status_code, 400)
        self.assertEqual(self.client.get(self.base+'mobile-medication-lots/').data['count'], 0)

    def test_operator_and_feeder_cannot_access_managerial_application(self):
        for role in ['operator', 'feeder']:
            self.user.role = role
            self.user.save()
            self.user.allowed_livestock.add(self.species)
            for path in ['mobile-medication-options/', 'mobile-medication-lots/']:
                self.assertEqual(self.client.get(self.base+path).status_code, 403)
            self.assertEqual(self.client.post(self.base+'mobile-medication-preview/', self.values(), format='json').status_code, 403)

    def test_failure_after_stock_consumption_rolls_back_every_effect(self):
        review = self.preview()
        with patch.object(HealthRecord.objects, 'create', side_effect=RuntimeError('synthetic health failure')):
            response = self.confirm(review)
        self.assertEqual(response.status_code, 500)
        self.lot.refresh_from_db()
        self.assertEqual(self.lot.quantidade_atual, Decimal('20'))
        self.assertFalse(CattleManagement.objects.exists())
        self.assertFalse(MovimentacaoEstoque.objects.exists())

    def test_catalog_is_cost_free_and_accepts_secondary_medication_category(self):
        ItemEstoque.objects.filter(pk=self.item.pk).update(categoria='outros', categorias=['outros', 'medicamento'])
        response = self.client.get(self.base+'mobile-medication-lots/')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['count'], 1)
        self.assertNotIn('cost', str(response.data))
        self.assertEqual(response.data['results'][0]['withdrawal_days'], 3)
        self.preview()

    def test_application_projection_keeps_trace_without_financial_fields(self):
        response = self.confirm(self.preview())
        self.assertEqual(response.status_code, 201, response.data)
        detail = self.client.get(f"/api/v1/livestock/clinical/records/{response.data['id']}/mobile/", {'kind': 'health'})
        self.assertEqual(detail.status_code, 200, detail.data)
        self.assertEqual(detail.data['application']['management'], response.data['management'])
        self.assertEqual(detail.data['application']['quantity'], '2.50')
        self.assertEqual(detail.data['application']['milk_until'], str(self.today+timedelta(days=3)))
        self.assertNotIn('cost', str(detail.data))

    def test_cross_user_review_and_foreign_animal_are_rejected(self):
        review = self.preview()
        other_user = get_user_model().objects.create_user(email='other-medication@example.invalid', password='test', role='manager', organization=self.org)
        self.client.force_authenticate(other_user)
        self.assertEqual(self.confirm(review).status_code, 403)
        foreign_org = Organization.objects.create(name='Private', slug='medication-private')
        foreign_farm = Farm.objects.create(organization=foreign_org, name='Private')
        foreign = Animal.objects.create(farm=foreign_farm, species=self.species, identifier='Private')
        response = self.client.post(self.base+'mobile-medication-preview/', self.values(animal=str(foreign.pk)), format='json')
        self.assertEqual(response.status_code, 404)
        self.assertFalse(CattleManagement.objects.exists())

    def test_inconsistent_legacy_management_or_stock_tenant_is_not_exposed(self):
        other = Organization.objects.create(name='Hidden', slug='medication-hidden')
        other_farm = Farm.objects.create(organization=other, name='Hidden')
        foreign = CattleManagement.objects.create(farm=other_farm, kind='sanitary', date=self.today, description='Private', created_by=self.user)
        linked = HealthRecord.objects.create(farm=self.farm, animal=self.animal, cattle_management=foreign, application_date=self.today, description='Inconsistent')
        path = f'/api/v1/livestock/clinical/records/{linked.pk}/mobile/'
        self.assertEqual(self.client.get(path, {'kind': 'health'}).status_code, 404)
        response = self.confirm(self.preview())
        self.item.organization = other
        self.item.save()
        path = f"/api/v1/livestock/clinical/records/{response.data['id']}/mobile/"
        self.assertEqual(self.client.get(path, {'kind': 'health'}).status_code, 404)


from unittest import skipUnless
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from django.db import connection, close_old_connections, connections
from rest_framework.test import APITransactionTestCase, APIClient


@skipUnless(connection.vendor == 'postgresql', 'Requires PostgreSQL row locks')
class ConcurrentMedicationTests(APITransactionTestCase):
    base = MobileMedicationTests.base
    setUp = MobileMedicationTests.setUp
    values = MobileMedicationTests.values
    preview = MobileMedicationTests.preview

    def test_same_review_confirmed_concurrently_has_one_stock_effect(self):
        review = self.preview()
        user_id = self.user.pk
        barrier = Barrier(2)
        def send():
            close_old_connections()
            try:
                client = APIClient()
                client.force_authenticate(get_user_model().objects.get(pk=user_id))
                barrier.wait(timeout=15)
                return client.post(self.base+'mobile-medication-confirm/', {'preview_token': review['preview_token']}, format='json').status_code
            finally:
                connections.close_all()
        with ThreadPoolExecutor(max_workers=2) as workers:
            futures = [workers.submit(send) for _ in range(2)]
            results = [future.result(timeout=30) for future in futures]
        self.assertEqual(sorted(results), [201, 409])
        self.assertEqual(CattleManagement.objects.count(), 1)
        self.assertEqual(HealthRecord.objects.count(), 1)
        self.assertEqual(MovimentacaoEstoque.objects.count(), 1)
        self.lot.refresh_from_db()
        self.assertEqual(self.lot.quantidade_atual, Decimal('17.50'))
