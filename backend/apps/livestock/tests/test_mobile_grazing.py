from datetime import timedelta
from django.contrib.auth import get_user_model
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APITestCase
from apps.organizations.models import Organization
from apps.farms.models import Farm
from apps.livestock.models import Species, AnimalBatch, CattlePasture, CattleGrazing
from apps.inventory.models import MovimentacaoEstoque


class MobileGrazingTests(APITestCase):
    base = '/api/v1/livestock/cattle/grazings/'

    def setUp(self):
        self.today = timezone.localdate()
        self.org = Organization.objects.create(name='Grazing', slug='mobile-grazing')
        other = Organization.objects.create(name='Other', slug='grazing-private')
        self.farm = Farm.objects.create(organization=self.org, name='Farm')
        self.foreign_farm = Farm.objects.create(organization=other, name='Private')
        self.species, _ = Species.objects.get_or_create(code='bovinos', defaults={'name': 'Bovinos'})
        self.pasture = CattlePasture.objects.create(farm=self.farm, name='North', area_ha=10)
        self.foreign_pasture = CattlePasture.objects.create(farm=self.foreign_farm, name='Private', area_ha=10)
        self.batch = AnimalBatch.objects.create(farm=self.farm, species=self.species, batch_code='0001', name='Dairy herd', cattle_purpose='dairy', quantity=12, entry_date=self.today-timedelta(days=30))
        self.open = CattleGrazing.objects.create(pasture=self.pasture, batch=self.batch, entry_date=self.today-timedelta(days=3), notes='Water and shade')
        self.closed = CattleGrazing.objects.create(pasture=self.pasture, batch=self.batch, entry_date=self.today-timedelta(days=10), exit_date=self.today-timedelta(days=5))
        self.user = get_user_model().objects.create_user(email='grazing@example.invalid', password='test', role='manager', organization=self.org)
        self.client.force_authenticate(self.user)
        self.query = {'farm': str(self.farm.pk), 'pasture': str(self.pasture.pk)}

    def test_paginated_filters_and_current_quantity_preserve_dates(self):
        response = self.client.get(self.base+'mobile/', {**self.query, 'page_size': 1})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['count'], 2)
        self.assertIsNotNone(response.data['next'])
        row = response.data['results'][0]
        self.assertEqual(row['id'], str(self.open.pk))
        self.assertEqual(row['current_quantity'], 12)
        self.assertEqual(row['batch_code'], '0001')
        self.assertEqual(row['entry_date'], str(self.open.entry_date))
        self.assertIsNone(row['exit_date'])
        self.assertEqual(self.client.get(self.base+'mobile/', {**self.query, 'state':'closed'}).data['results'][0]['id'], str(self.closed.pk))
        self.assertEqual(self.client.get(self.base+'mobile/', {**self.query, 'state':'open', 'search':'Dairy'}).data['count'], 1)
        self.assertEqual(self.client.get(self.base+'mobile/', {**self.query, 'search':'missing'}).data['count'], 0)
        self.assertFalse(MovimentacaoEstoque.objects.exists())
        self.assertEqual(CattleGrazing.objects.count(), 2)

    def test_detail_tenant_farm_pasture_and_inconsistent_batch_are_scoped(self):
        detail = self.base+f'{self.open.pk}/mobile/'
        response = self.client.get(detail, self.query)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['notes'], 'Water and shade')
        self.assertEqual(self.client.get(detail, {**self.query, 'farm':str(self.foreign_farm.pk)}).status_code, 404)
        self.assertEqual(self.client.get(self.base+'mobile/', {'farm':str(self.foreign_farm.pk), 'pasture':str(self.foreign_pasture.pk)}).status_code, 404)
        sibling = CattlePasture.objects.create(farm=self.farm, name='South', area_ha=5)
        self.assertEqual(self.client.get(detail, {**self.query, 'pasture':str(sibling.pk)}).status_code, 404)
        self.batch.farm = self.foreign_farm; self.batch.save(update_fields=['farm'])
        self.assertEqual(self.client.get(detail, self.query).status_code, 404)

    def test_invalid_context_and_states_return_validation_errors(self):
        for values in [{}, {'farm':str(self.farm.pk)}, {**self.query,'pasture':'name'}, {**self.query,'state':'active'}, {**self.query,'search':'x'*101}]:
            self.assertEqual(self.client.get(self.base+'mobile/', values).status_code, 400)

    def test_readonly_operator_allowed_but_species_and_feeder_are_rejected(self):
        self.user.role='operator'; self.user.operator_read_only=True; self.user.save()
        self.user.allowed_livestock.add(self.species)
        self.assertEqual(self.client.get(self.base+'mobile/', self.query).status_code, 200)
        self.user.allowed_livestock.clear()
        self.assertEqual(self.client.get(self.base+'mobile/', self.query).status_code, 403)
        self.user.role='feeder'; self.user.save(); self.user.allowed_livestock.add(self.species)
        self.assertEqual(self.client.get(self.base+'mobile/', self.query).status_code, 403)

    def test_closed_history_keeps_inactive_batches_and_all_productive_purposes(self):
        self.batch.cattle_purpose='beef'; self.batch.status='sold'; self.batch.quantity=0; self.batch.save()
        response=self.client.get(self.base+'mobile/', {**self.query,'state':'closed'})
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['results'][0]['batch_purpose'], 'beef')
        self.assertEqual(response.data['results'][0]['batch_status'], 'sold')
        self.assertEqual(response.data['results'][0]['current_quantity'], 0)

    def test_projection_has_no_financial_fields_or_per_row_queries(self):
        with CaptureQueriesContext(connection) as small:
            self.client.get(self.base+'mobile/', self.query)
        for offset in range(4):
            CattleGrazing.objects.create(pasture=self.pasture, batch=self.batch, entry_date=self.today-timedelta(days=20+offset), exit_date=self.today-timedelta(days=19+offset))
        with CaptureQueriesContext(connection) as large:
            response=self.client.get(self.base+'mobile/', self.query)
        self.assertEqual(response.data['count'], 6)
        self.assertEqual(len(small), len(large))
        self.assertEqual(set(response.data['results'][0]), {'id','farm','farm_name','pasture','pasture_name','batch','batch_code','batch_purpose','batch_status','current_quantity','entry_date','exit_date','notes'})
        selects=' '.join(query['sql'].lower() for query in large)
        self.assertNotIn('purchase_price', selects)
        self.assertNotIn('sale_price', selects)
