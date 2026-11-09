from uuid import uuid4
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APITestCase
from apps.livestock.tests import test_cattle_improvements as fixtures
from apps.livestock.models import CattlePurposeChange, CattleTransfer, CattleOccurrence
from apps.tasks.models import Task


class MobileCattleOperationsTests(APITestCase):
    base='/api/v1/livestock/cattle/operations/'
    animal=fixtures.CattleImprovementTests.animal
    batch=fixtures.CattleImprovementTests.batch
    def setUp(self):
        fixtures.CattleImprovementTests.setUp(self)
        self.source.cattle_purpose='dairy';self.source.save()
        self.query={'production':'dairy','farm':str(self.farm.pk),'view':'mobile'}
        self.change=CattlePurposeChange.objects.create(farm=self.farm,animal=self.beef,previous='dairy',purpose='beef',date=self.today,created_by=self.user)
        self.transfer=CattleTransfer.objects.create(farm=self.farm,source=self.source,destination=self.destination,date=self.today,quantity=3,reason='Mixed transfer',request_key=uuid4(),created_by=self.user,snapshot={'purchase_value_transferred':'300'})
        self.task=Task.objects.create(organization=self.org,farm=self.farm,title='Fence',due_date=self.today,created_by=self.user,assigned_to=self.user)
        self.occurrence=CattleOccurrence.objects.create(farm=self.farm,task=self.task,kind='fence',date=self.today,description='Fence damaged',created_by=self.user)
    def page(self,kind,**changes):
        response=self.client.get(self.base+kind+'/',{**self.query,**changes});self.assertEqual(response.status_code,200,response.data);return response.data
    def test_three_tabs_detail_identity_and_no_read_effects(self):
        for kind,row in [('occurrences',self.occurrence),('purpose-history',self.change),('transfers',self.transfer)]:
            page=self.page(kind);self.assertEqual(page['count'],1);self.assertEqual(page['results'][0]['id'],str(row.pk));self.assertEqual(page['results'][0]['tab'],kind)
            response=self.client.get(self.base+f'{kind}/{row.pk}/mobile/',self.query);self.assertEqual(response.status_code,200,response.data)
            self.assertEqual(response.data['farm'],str(self.farm.pk));self.assertEqual(response.data,page['results'][0])
        self.assertEqual(CattleOccurrence.objects.count(),1);self.assertIsNone(self.occurrence.resolved_at)
    def test_classification_departing_segment_and_current_target_purpose(self):
        row=self.page('purpose-history')['results'][0];self.assertEqual(row['previous'],'dairy');self.assertEqual(row['target']['purpose'],'beef')
        self.assertEqual(self.page('purpose-history',production='beef')['count'],1)
        self.assertEqual(self.page('purpose-history',search='absent')['count'],0)
    def test_farm_occurrence_shared_and_targeted_occurrence_scoped(self):
        task=Task.objects.create(organization=self.org,farm=self.farm,title='Beef')
        CattleOccurrence.objects.create(farm=self.farm,animal=self.beef,task=task,kind='animal',date=self.today,description='Beef occurrence',created_by=self.user)
        self.assertEqual(self.page('occurrences')['count'],1);self.assertEqual(self.page('occurrences',production='beef')['count'],2)
        self.occurrence.resolved_at=timezone.now();self.occurrence.resolution='Repaired';self.occurrence.save()
        self.assertEqual(self.page('occurrences',status='open')['count'],0);self.assertEqual(self.page('occurrences',status='done')['count'],1)
    def test_search_pagination_and_no_financial_columns_or_snapshots(self):
        for index in range(3):CattleTransfer.objects.create(farm=self.farm,source=self.source,destination=self.destination,date=self.today,quantity=1,reason=f'Transfer {index}',request_key=uuid4(),created_by=self.user)
        with CaptureQueriesContext(connection) as captured:page=self.page('transfers',page_size=1)
        self.assertEqual(page['count'],4);self.assertIsNotNone(page['next'])
        self.assertNotIn('snapshot',str(page));self.assertNotIn('purchase_value',' '.join(row['sql'] for row in captured))
        self.assertEqual(self.page('transfers',search='Mixed')['count'],1)
    def test_foreign_relations_and_farm_scope_are_filtered(self):
        task=Task.objects.create(organization=self.foreign.organization,farm=self.foreign,title='Foreign')
        CattleOccurrence.objects.create(farm=self.farm,task=task,kind='other',date=self.today,description='Invalid relation',created_by=self.user)
        self.assertEqual(self.page('occurrences')['count'],1)
        self.assertEqual(self.page('occurrences',farm=str(self.foreign.pk))['count'],0)
        self.assertEqual(self.client.get(self.base+f'occurrences/{self.occurrence.pk}/mobile/',{**self.query,'farm':str(self.foreign.pk)}).status_code,404)
    def test_operator_species_and_manager_only_transfers_are_enforced(self):
        self.user.role='operator';self.user.save();self.user.allowed_livestock.add(self.species)
        self.assertEqual(self.page('occurrences')['count'],1);self.assertEqual(self.page('purpose-history')['count'],1)
        self.assertEqual(self.client.get(self.base+'transfers/',self.query).status_code,403)
        self.assertEqual(self.client.get(self.base+f'transfers/{self.transfer.pk}/mobile/',self.query).status_code,403)
        self.user.allowed_livestock.clear();self.assertEqual(self.client.get(self.base+'occurrences/',self.query).status_code,403)
        self.user.role='feeder';self.user.save();self.user.allowed_livestock.add(self.species)
        self.assertEqual(self.client.get(self.base+'occurrences/',self.query).status_code,403)
    def test_unsupported_tab_invalid_production_and_legacy_read_unchanged(self):
        for path,query in [('costs',self.query),('occurrences',{**self.query,'production':'all'})]:self.assertEqual(self.client.get(self.base+path+'/',query).status_code,400)
        response=self.client.get(self.base+'transfers/',{'farm':str(self.farm.pk)});self.assertEqual(response.status_code,200,response.data)
        self.assertIn('snapshot',response.data['results'][0])
