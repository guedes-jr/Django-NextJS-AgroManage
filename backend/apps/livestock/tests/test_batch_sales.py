from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APITestCase

from apps.farms.models import Farm
from apps.finance.models import Transaction
from apps.livestock.models import AnimalBatch, HistoricoEvento, Species
from apps.organizations.models import Organization


class BatchSalesTests(APITestCase):
    def setUp(self):
        self.org = Organization.objects.create(name='Vendas', slug='sales-test')
        self.user = get_user_model().objects.create_user(email='sales@example.com', password='test-password', full_name='Produtor', organization=self.org)
        farm = Farm.objects.create(name='Fazenda', organization=self.org)
        species = Species.objects.create(name='Suínos', code='suinos')
        self.batch = AnimalBatch.objects.create(farm=farm, species=species, batch_code='007', quantity=120, entry_date=date(2026, 1, 1), status='active', phase='engorda')
        self.client.force_authenticate(self.user)
        self.url = reverse('animalbatch-register-sale', args=[self.batch.pk])
        self.data = dict(mode='partial', quantity=20, weight_kg='1600', price_per_kg='8.50', date='2026-10-01', buyer='Comprador', responsible='Produtor')

    def test_partial_then_full_sale_updates_stock_and_creates_each_revenue_once(self):
        response = self.client.post(self.url, self.data, format='json')
        self.assertEqual(response.status_code, 201)
        self.batch.refresh_from_db()
        self.assertEqual(self.batch.quantity, 100)
        self.assertEqual(self.batch.status, 'active')
        self.assertEqual(Transaction.objects.get(animal_batch=self.batch).amount, Decimal('13600.00'))
        self.data.update(mode='whole', quantity=1, weight_kg='8400')
        response = self.client.post(self.url, self.data, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['quantity'], 100)
        self.batch.refresh_from_db()
        self.assertEqual(self.batch.status, 'sold')
        self.assertEqual(Transaction.objects.filter(animal_batch=self.batch).count(), 2)
        self.assertEqual(HistoricoEvento.objects.filter(lote=self.batch, tipo_evento='Venda de Animais').count(), 2)
        self.assertEqual(self.client.post(self.url, self.data, format='json').status_code, 400)
        history = self.client.get(reverse('animalbatch-sales'))
        self.assertEqual(history.status_code, 200)
        self.assertEqual(len(history.data), 2)

    def test_invalid_partial_quantity_does_not_change_stock_or_finance(self):
        for quantity in [0, 120, 121]:
            self.data['quantity'] = quantity
            self.assertEqual(self.client.post(self.url, self.data, format='json').status_code, 400)
        self.batch.refresh_from_db()
        self.assertEqual(self.batch.quantity, 120)
        self.assertFalse(Transaction.objects.filter(animal_batch=self.batch).exists())

    def test_foreign_tenant_cannot_sell_or_list_sales(self):
        self.client.post(self.url, self.data, format='json')
        other = Organization.objects.create(name='Outra', slug='sales-other')
        user = get_user_model().objects.create_user(email='other-sales@example.com', password='test-password', organization=other)
        self.client.force_authenticate(user)
        self.assertEqual(self.client.post(self.url, self.data, format='json').status_code, 404)
        self.assertEqual(self.client.get(reverse('animalbatch-sales')).data, [])

    def test_invalid_weight_price_and_date_are_rejected(self):
        for field, value in [('weight_kg', '0'), ('price_per_kg', '-1'), ('date', '2025-01-01')]:
            data = dict(self.data, **{field: value})
            self.assertEqual(self.client.post(self.url, data, format='json').status_code, 400)
