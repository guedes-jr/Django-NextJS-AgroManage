from datetime import timedelta
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APITestCase
from apps.farms.models import Farm
from apps.livestock.tests import test_cattle_improvements as fixture
from apps.livestock.models import CattleMilkRecord, CattleMilkDailyTotal, Animal

class MobileMilkTrendsTests(APITestCase):
    base=fixture.CattleImprovementTests.base
    animal=fixture.CattleImprovementTests.animal
    batch=fixture.CattleImprovementTests.batch
    def setUp(self):
        fixture.CattleImprovementTests.setUp(self)
        self.farm_b=Farm.objects.create(organization=self.org,name='Segunda')
        for offset,liters,discard in [(2,20,2),(1,10,1),(0,15,0)]:CattleMilkRecord.objects.create(animal=self.cow,date=self.today-timedelta(days=offset),session='morning',liters=liters,discarded_liters=discard)
        CattleMilkDailyTotal.objects.create(farm=self.farm_b,date=self.today-timedelta(days=1),liters=100,discarded_liters=10)
        self.query={'view':'mobile','production':'dairy','start':str(self.today-timedelta(days=5)),'end':str(self.today),'drop_percent':'20'}
    def report(self,**changes):return self.client.get(self.base+'milk-trends/',{**self.query,**changes})
    def test_scoped_totals_sessions_drop_and_historical_purpose(self):
        self.cow.cattle_purpose='beef';self.cow.save()
        r=self.report(farm=str(self.farm.pk),animal=str(self.cow.pk));self.assertEqual(r.status_code,200,r.data)
        self.assertEqual((r.data['produced'],r.data['discarded'],r.data['usable']),('45.00','3.00','42.00'))
        self.assertEqual(r.data['drop_alert']['drop_percent'],'50.00');self.assertEqual(r.data['sessions'][0]['liters'],'45.00');self.assertEqual(r.data['animal']['purpose'],'beef')
        choices=self.client.get(self.base+'milk-trend-animals/',self.query);self.assertEqual(choices.status_code,200,choices.data);self.assertEqual(choices.data['results'][0]['purpose'],'beef')
    def test_daily_total_is_not_distributed_and_mixed_farms_do_not_invent_cows(self):
        r=self.report();self.assertEqual(r.data['produced'],'145.00');self.assertEqual(r.data['discarded'],'13.00')
        self.assertTrue(r.data['series'][1]['aggregate']);self.assertIsNone(r.data['series'][1]['milked_cows']);self.assertEqual(r.data['sessions'][0]['liters'],'45.00')
        total=self.report(farm=str(self.farm_b.pk));self.assertEqual(total.data['sessions'],[]);self.assertEqual(total.data['produced'],'100.00')
    def test_empty_and_missing_days_are_not_zero_drop(self):
        r=self.report(animal=str(self.unknown.pk));self.assertEqual(r.data['series'],[]);self.assertEqual(r.data['produced'],'0.00')
        CattleMilkRecord.objects.filter(animal=self.cow,date=self.today-timedelta(days=2)).update(date=self.today-timedelta(days=3))
        r=self.report(farm=str(self.farm.pk));self.assertIsNone(r.data['drop_alert']);self.assertEqual(r.data['days_with_records'],3)
    def test_tenant_farm_species_and_validation(self):
        self.assertEqual(self.report(farm=str(self.foreign.pk)).status_code,404)
        self.assertEqual(self.report(farm=str(self.farm_b.pk),animal=str(self.cow.pk)).status_code,404)
        for change in [{'production':'beef'},{'end':str(self.today+timedelta(days=1))},{'start':str(self.today-timedelta(days=367))},{'drop_percent':'0.5'},{'drop_percent':'100.01'},{'animal':'invalid'}]:self.assertEqual(self.report(**change).status_code,400)
        foreign=self.animal('FOREIGN',farm=self.foreign,cattle_purpose='dairy');self.assertEqual(self.report(animal=str(foreign.pk)).status_code,404)
    def test_options_picker_pagination_search_and_no_financial_reads_or_writes(self):
        with CaptureQueriesContext(connection) as queries:r=self.report(farm=str(self.farm.pk))
        self.assertEqual(r.status_code,200)
        sql=' '.join(q['sql'] for q in queries)
        for field in ['purchase_value','cost_snapshot','custo_unitario']:self.assertNotIn(field,sql)
        self.assertFalse(any(q['sql'].lstrip().upper().startswith(('INSERT','UPDATE','DELETE')) for q in queries))
        opts=self.client.get(self.base+'milk-trend-options/',{'view':'mobile','production':'dairy','farm':str(self.farm.pk)});self.assertEqual(opts.data['today'],str(self.today));self.assertEqual(opts.data['end'],str(self.today))
        second=self.animal('MILK2',cattle_purpose='unknown');CattleMilkRecord.objects.create(animal=second,date=self.today,session='evening',liters=1)
        choices=self.client.get(self.base+'milk-trend-animals/',{**self.query,'page_size':1});self.assertEqual(choices.data['count'],2);self.assertIsNotNone(choices.data['next'])
        self.assertEqual(self.client.get(self.base+'milk-trend-animals/',{**self.query,'search':'missing'}).data['count'],0)
    def test_readonly_operator_supported_feeder_and_unscoped_operator_denied(self):
        self.user.role='operator';self.user.save();self.assertEqual(self.report().status_code,403)
        self.user.allowed_livestock.add(self.species);self.user.operator_read_only=True;self.user.save();self.assertEqual(self.report().status_code,200)
        self.user.role='feeder';self.user.save();self.assertEqual(self.report().status_code,403)
        self.client.force_authenticate(None);self.assertIn(self.report().status_code,[401,403])
