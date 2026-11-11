from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APITestCase
from apps.farms.models import Farm
from apps.finance.models import FinancialCategory, Transaction
from apps.livestock.models import HealthRecord
from apps.livestock.cattle_services import confirm_cattle_management
from apps.livestock.tests import test_cattle_improvements as fixture

class MobileCattleCostsTests(APITestCase):
    base=fixture.CattleImprovementTests.base
    animal=fixture.CattleImprovementTests.animal
    batch=fixture.CattleImprovementTests.batch
    lot=fixture.CattleImprovementTests.lot
    management=fixture.CattleImprovementTests.management
    def setUp(self):
        fixture.CattleImprovementTests.setUp(self)
        self.beef.batch=self.source;self.beef.save()
        self.category=FinancialCategory.objects.create(organization=self.org,name='Expenses',category_type='expense')
        self.known=HealthRecord.objects.create(farm=self.farm,animal=self.beef,treatment_type='exam',description='Known',application_date=self.today,cost='3.25')
        HealthRecord.objects.create(farm=self.farm,animal=self.beef,treatment_type='exam',description='Missing',application_date=self.today,cost=None)
        Transaction.objects.create(organization=self.org,farm=self.farm,category=self.category,animal_batch=self.source,amount=100,description='Purchase',due_date=self.today)
        Transaction.objects.create(organization=self.org,farm=self.farm,category=self.category,animal_batch=self.source,amount=50,description='Cancelled',due_date=self.today,status='cancelled')
        self.query={'view':'mobile','farm':str(self.farm.pk),'production':'beef','start':str(self.today),'end':str(self.today),'tab':'operations'}
    def report(self,**changes):return self.client.get(self.base+'costs/',{**self.query,**changes})
    def test_known_unknown_and_expenses_are_separate_with_source_counts(self):
        r=self.report();self.assertEqual(r.status_code,200,r.data)
        self.assertEqual(r.data['operational_total'],'3.25');self.assertEqual(r.data['expenses_by_due_date'],'100.00');self.assertEqual(r.data['missing_cost_count'],1);self.assertEqual(r.data['missing_by_source']['health'],1)
        self.assertNotIn('combined_total',r.data);self.assertEqual(r.data['operation_count'],2);self.assertEqual(r.data['expense_count'],1)
        expenses=self.report(tab='expenses');self.assertEqual(expenses.data['results'][0]['description'],'Purchase');self.assertEqual(expenses.data['results'][0]['amount'],'100.00')
    def test_scope_dates_farm_batch_and_source_pagination(self):
        self.assertEqual(self.report(farm=str(self.foreign.pk)).status_code,404)
        self.assertEqual(self.report(batch=str(self.source.pk),production='dairy').status_code,404)
        self.assertEqual(self.report(batch=str(self.source.pk)).data['operational_total'],'3.25')
        for changes in [{'start':'invalid'},{'end':str(self.today+timedelta(days=1))},{'start':str(self.today-timedelta(days=367))},{'production':'all'},{'page':0}]:self.assertEqual(self.report(**changes).status_code,400)
        for index in range(22):HealthRecord.objects.create(farm=self.farm,animal=self.beef,treatment_type='exam',description=f'Extra {index}',application_date=self.today,cost=1)
        first=self.report();second=self.report(page=2);self.assertEqual(first.data['count'],24);self.assertTrue(first.data['next']);self.assertEqual(len(second.data['results']),4);self.assertEqual(second.data['operational_total'],'25.25')
        self.assertEqual(self.report(page=3).status_code,404)
    def test_foreign_related_rows_and_unallocated_overhead_are_excluded(self):
        HealthRecord.objects.create(farm=self.foreign,animal=self.beef,treatment_type='exam',description='Foreign relation',application_date=self.today,cost=999)
        foreign_category=FinancialCategory.objects.create(organization=self.foreign.organization,name='Foreign',category_type='expense')
        Transaction.objects.create(organization=self.org,category=foreign_category,animal_batch=self.source,amount=999,description='Invalid category',due_date=self.today)
        Transaction.objects.create(organization=self.org,category=self.category,farm=self.foreign,animal_batch=self.source,amount=999,description='Invalid farm',due_date=self.today)
        Transaction.objects.create(organization=self.org,category=self.category,farm=self.farm,species=self.species,amount=999,description='Unallocated',due_date=self.today)
        r=self.report();self.assertEqual(r.data['operational_total'],'3.25');self.assertEqual(r.data['expenses_by_due_date'],'100.00')
    def test_existing_allocation_is_preserved_and_generated_health_not_double_counted(self):
        lot=self.lot(custo_unitario=None);management=self.management(lot);confirm_cattle_management(management,self.user)
        r=self.report();self.assertEqual(r.status_code,200,r.data);self.assertEqual(r.data['operational_total'],'4.25');self.assertEqual(r.data['missing_cost_count'],2);self.assertEqual(r.data['operation_count'],4)
        legacy=self.client.get(self.base+'costs/',{k:v for k,v in self.query.items() if k!='view'})
        self.assertEqual(Decimal(legacy.data['operational_total']),Decimal(r.data['operational_total']))
    def test_native_limits_reject_instead_of_partial_totals(self):
        with patch('apps.livestock.cattle_analytics.NATIVE_COST_MAX_ENTRIES',1):self.assertEqual(self.report().status_code,400)
        with patch('apps.livestock.cattle_analytics.NATIVE_COST_MAX_ANIMALS',0):self.assertEqual(self.report().status_code,400)
    def test_options_choices_and_readonly_report_no_writes(self):
        r=self.client.get(self.base+'cost-options/',self.query);self.assertEqual(r.status_code,200,r.data);self.assertEqual(r.data['today'],str(self.today))
        choices=self.client.get(self.base+'cost-batches/',{**self.query,'search':'SRC'});self.assertEqual(choices.data['count'],1)
        with CaptureQueriesContext(connection) as captured:self.report()
        self.assertFalse(any(q['sql'].lstrip().upper().startswith(('INSERT','UPDATE','DELETE')) for q in captured))
    def test_operator_feeder_and_missing_farm_denied_before_financial_queries(self):
        self.assertEqual(self.client.get(self.base+'costs/',{'view':'mobile','production':'beef','start':str(self.today),'end':str(self.today)}).status_code,400)
        self.user.role='operator';self.user.allowed_livestock.add(self.species);self.user.save()
        with patch('apps.livestock.mobile_cattle_costs.cattle_cost_report') as calculate:self.assertEqual(self.report().status_code,403);calculate.assert_not_called()
        self.user.role='feeder';self.user.save();self.assertEqual(self.report().status_code,403)
