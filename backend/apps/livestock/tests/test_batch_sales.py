from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APITestCase

from apps.farms.models import Farm
from apps.finance.models import Transaction
from apps.livestock.models import AnimalBatch, BatchPhaseHistory, FeedingRecord, HistoricoEvento, Species
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
        for quantity in [0, 121]:
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

    def test_partial_sales_keep_phase_open_and_final_sale_freezes_aggregated_sheet(self):
        phase = BatchPhaseHistory.objects.create(batch=self.batch, phase='engorda', quantity=120,
            avg_weight_kg=Decimal('60'), entry_date=date(2026, 1, 1))
        FeedingRecord.objects.create(batch=self.batch, farm=self.batch.farm,
            date=date(2026, 5, 1), quantity_kg=Decimal('5600'), feed_type='Ração')
        self.assertEqual(self.client.post(self.url, self.data, format='json').status_code, 201)
        phase.refresh_from_db()
        self.assertIsNone(phase.exit_date)
        self.assertEqual(phase.avg_weight_kg, Decimal('60'))
        self.assertFalse(self.batch.historicos.filter(tipo_evento='Fechamento de Venda do Lote').exists())
        data = dict(self.data, mode='whole', weight_kg='8400', date='2026-10-02')
        self.assertEqual(self.client.post(self.url, data, format='json').status_code, 201)
        detail = self.client.get(reverse('animalbatch-detail', args=[self.batch.pk]))
        summary = detail.data['sale_summary']
        self.assertEqual(summary['quantity'], 120)
        self.assertEqual(Decimal(summary['total_weight_kg']), Decimal('10000'))
        self.assertEqual(Decimal(summary['amount']), Decimal('85000'))
        self.assertAlmostEqual(float(summary['avg_weight_kg']), 10000 / 120)
        self.assertAlmostEqual(float(summary['feed_conversion']), 2)
        self.assertAlmostEqual(float(summary['daily_weight_gain']), (10000 / 120 - 60) / 274)
        phase.refresh_from_db()
        self.assertEqual(phase.exit_date, date(2026, 10, 2))
        self.assertEqual(phase.quantity, 120)
        rows = self.client.get(reverse('animalbatch-history', args=[self.batch.pk])).data
        phase_rows = [row for row in rows if row['type'] == 'phase' and row['phase'] == 'engorda']
        self.assertEqual(len(phase_rows), 1)
        self.assertEqual(phase_rows[0]['entry_quantity'], 120)
        self.assertEqual(phase_rows[0]['entry_weight_kg'], 60)
        self.assertFalse(phase_rows[0]['is_current'])
        self.assertEqual(self.client.delete(reverse('animalbatch-detail', args=[self.batch.pk])).status_code, 400)
        from apps.reports.services import LivestockReportService
        report = LivestockReportService.get_inventory(self.org, {'species': 'suinos'})
        self.assertIn(str(self.batch.pk), [str(item['id']) for item in report['items']])

    def test_whole_sale_without_partials_closes_phase_on_sale_date(self):
        BatchPhaseHistory.objects.create(batch=self.batch, phase='engorda', quantity=120,
            avg_weight_kg=Decimal('60'), entry_date=date(2026, 1, 1))
        data = dict(self.data, mode='whole', weight_kg='12000')
        self.assertEqual(self.client.post(self.url, data, format='json').status_code, 201)
        detail = self.client.get(reverse('animalbatch-detail', args=[self.batch.pk])).data
        self.assertEqual(detail['sale_summary']['exit_date'], '2026-10-01')
        self.assertEqual(Decimal(detail['sale_summary']['avg_weight_kg']), Decimal('100'))

    def test_final_sale_cannot_predate_partial_sale(self):
        self.client.post(self.url, self.data, format='json')
        data = dict(self.data, mode='whole', date='2026-09-30')
        self.assertEqual(self.client.post(self.url, data, format='json').status_code, 400)
        self.batch.refresh_from_db()
        self.assertEqual(self.batch.status, 'active')
        self.assertEqual(Transaction.objects.filter(animal_batch=self.batch).count(), 1)

    def test_sales_history_keeps_legacy_sales_when_events_lack_reference(self):
        from apps.finance.models import FinancialCategory
        category = FinancialCategory.objects.create(organization=self.org, name='Venda de Animais', category_type='revenue')
        legacy = Transaction.objects.create(organization=self.org, animal_batch=self.batch,
            category=category, description='Venda antiga', amount=Decimal('800'), due_date=date(2026, 1, 2),
            reference=f'SALE-BATCH-{self.batch.pk}', status='paid')
        HistoricoEvento.objects.create(farm=self.batch.farm, lote=self.batch, tipo_evento='Venda de Animais',
            descricao='Venda sem referência', data_evento=date(2026, 1, 3),
            metadata={'batch_code': '007', 'quantity': 1, 'weight_kg': '100', 'amount': '900'})
        response = self.client.get(reverse('animalbatch-sales'))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 2)
        self.assertIn(str(legacy.pk), [item['id'] for item in response.data])

    def test_selling_remaining_balance_in_partial_mode_finalizes_batch(self):
        self.batch.quantity = 10
        self.batch.save()
        BatchPhaseHistory.objects.create(batch=self.batch, phase='engorda', quantity=10,
            avg_weight_kg=Decimal('60'), entry_date=date(2026, 1, 1))
        data = dict(self.data, quantity=5, weight_kg='500')
        self.assertEqual(self.client.post(self.url, data, format='json').status_code, 201)
        self.batch.refresh_from_db()
        self.assertEqual(self.batch.quantity, 5)
        self.assertEqual(self.batch.status, 'active')
        response = self.client.post(self.url, data, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['mode'], 'whole')
        self.batch.refresh_from_db()
        self.assertEqual(self.batch.status, 'sold')
        detail = self.client.get(reverse('animalbatch-detail', args=[self.batch.pk])).data
        self.assertEqual(detail['sale_summary']['quantity'], 10)
        self.assertEqual(Decimal(detail['sale_summary']['total_weight_kg']), Decimal('1000'))
        self.assertEqual(Transaction.objects.filter(animal_batch=self.batch).count(), 2)
        self.assertEqual(self.batch.phase_histories.get().exit_date, date(2026, 10, 1))

    def test_financial_details_list_actual_batch_costs_and_hide_foreign_lots(self):
        from apps.finance.models import FinancialCategory
        from apps.inventory.models import ConsumoRacao, ItemEstoque
        category = FinancialCategory.objects.create(organization=self.org, name='Compra de Animais', category_type='expense')
        Transaction.objects.create(organization=self.org, animal_batch=self.batch,
            category=category, description='Compra do lote', amount=Decimal('1000'), due_date=date(2026, 1, 1), status='paid')
        Transaction.objects.create(organization=self.org, animal_batch=self.batch,
            category=category, description='Cancelado', amount=Decimal('9000'), due_date=date(2026, 1, 1), status='cancelled')
        feed = ItemEstoque.objects.create(organization=self.org, nome='Ração', categoria='racao', unidade_medida='kg')
        ConsumoRacao.objects.create(organization=self.org, farm=self.batch.farm, lote_animal=self.batch,
            item_estoque=feed, data_inicio=date(2026, 1, 2), data_fim=date(2026, 1, 3), quantidade=Decimal('200'), custo_total=Decimal('354'))
        url = reverse('animalbatch-financial-details', args=[self.batch.pk])
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(Decimal(response.data['total']), Decimal('1354'))
        self.assertEqual(response.data['totals']['Ração'], '354.00')
        self.assertEqual(len(response.data['entries']), 2)
        other = Organization.objects.create(name='Outra custos', slug='other-costs')
        user = get_user_model().objects.create_user(email='other-costs@example.com', password='test-password', organization=other)
        self.client.force_authenticate(user)
        self.assertEqual(self.client.get(url).status_code, 404)

    def test_financial_details_preserve_source_costs_and_missing_costs(self):
        from apps.livestock.models import VaccinationRecord
        source = AnimalBatch.objects.create(farm=self.batch.farm, species=self.batch.species,
            batch_code='ORIGEM', quantity=120, entry_date=date(2026, 1, 1), status='finished')
        self.batch.source_batches.add(source)
        VaccinationRecord.objects.create(farm=self.batch.farm, species=self.batch.species,
            batch=source, vaccine_name='Vacina origem', application_date=date(2026, 1, 2), inventory_cost_snapshot=Decimal('12'))
        VaccinationRecord.objects.create(farm=self.batch.farm, species=self.batch.species,
            batch=self.batch, vaccine_name='Vacina sem custo', application_date=date(2026, 1, 3))
        response = self.client.get(reverse('animalbatch-financial-details', args=[self.batch.pk]))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(Decimal(response.data['total']), Decimal('12'))
        self.assertEqual(response.data['missing_cost_count'], 1)
        self.assertEqual(len(response.data['entries']), 2)
        self.assertEqual(Decimal(response.data['cost_per_animal']), Decimal('0.1'))
