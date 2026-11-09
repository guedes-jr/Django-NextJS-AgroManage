from unittest.mock import patch
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APITestCase
from apps.livestock.tests import test_mobile_management as fixtures
from apps.livestock.models import Animal, CattleManagement, CattleManagementEntry, WeightRecord
from apps.inventory.models import MovimentacaoEstoque


class MobileWeighingTests(APITestCase):
    base='/api/v1/livestock/cattle/managements/'
    setUp=fixtures.MobileManagementTests.setUp
    def values(self):
        response=self.client.get(self.base+'mobile-weighing-animals/',self.query)
        self.assertEqual(response.status_code,200,response.data)
        return {'farm':str(self.farm.pk),'production':'dairy','date':str(self.today),'description':'Daily weighing',
            'responsible':'Team','notes':'Draft only','entries':[{'animal':row['id'],'animal_version':row['version'],'weight_kg':'420.50'} for row in response.data['results']]}
    def save(self,values):
        return self.client.post(self.base+'mobile-weighing-drafts/',values,format='json')

    def test_creates_draft_and_entries_without_applying_weights(self):
        values=self.values(); before=self.cow.current_weight_kg
        response=self.save(values); self.assertEqual(response.status_code,201,response.data)
        self.assertEqual(response.data['status'],'draft'); self.assertEqual(response.data['participant_count'],2)
        row=CattleManagement.objects.get(pk=response.data['id']); self.assertEqual(row.created_by,self.user)
        self.assertEqual(row.kind,'weighing'); self.assertEqual(row.entries.count(),2)
        self.assertFalse(WeightRecord.objects.exists()); self.assertFalse(MovimentacaoEstoque.objects.exists())
        self.cow.refresh_from_db(); self.assertEqual(self.cow.current_weight_kg,before)
        self.assertIsNone(row.confirmed_at); self.assertEqual(row.cost_per_animal,0)

    def test_duplicates_precision_limits_and_injected_cost_are_rejected(self):
        values=self.values(); entry=values['entries'][0]
        for change in [{'entries':[]},{'entries':[entry,entry]},{'entries':[entry]*1001},{'entries':[{**entry,'weight_kg':'0'}]},
            {'entries':[{**entry,'weight_kg':'1.001'}]},{'entries':[{**entry,'weight_kg':'1000000'}]},{'cost_per_animal':'10'},{'date':'2099-01-01'}]:
            response=self.save({**values,**change}); self.assertEqual(response.status_code,400,response.data)
        self.assertEqual(CattleManagement.objects.count(),2)

    def test_changed_inactive_foreign_or_wrong_purpose_participants_conflict(self):
        values=self.values(); self.cow.status='sold'; self.cow.save()
        self.assertEqual(self.save(values).status_code,409)
        values['entries']=[{**values['entries'][0],'animal':str(self.foreign.pk)}]
        self.assertEqual(self.save(values).status_code,409)
        values['entries']=[{**values['entries'][0],'animal':str(self.beef.pk)}]
        self.assertEqual(self.save(values).status_code,409)
        values=self.values(); self.heifer.notes='Changed'; self.heifer.save()
        self.assertEqual(self.save(values).status_code,409)

    def test_creation_date_respects_known_entry_and_context_roles(self):
        self.cow.entry_date=self.today; self.cow.save()
        values=self.values(); values['date']='2020-01-01'
        self.assertEqual(self.save(values).status_code,400)
        self.assertEqual(self.client.get(self.base+'mobile-weighing-options/',{**self.query,'farm':str(self.foreign_farm.pk)}).status_code,404)
        for role in ['operator','feeder']:
            self.user.role=role; self.user.save(); self.user.allowed_livestock.add(self.species)
            self.assertEqual(self.client.get(self.base+'mobile-weighing-options/',self.query).status_code,403)
            self.assertEqual(self.client.get(self.base+'mobile-weighing-animals/',self.query).status_code,403)
            self.assertEqual(self.save(values).status_code,403)

    def test_participant_failure_rolls_back_entire_draft(self):
        values=self.values(); before=CattleManagement.objects.count(); entries=CattleManagementEntry.objects.count()
        original=CattleManagementEntry.objects.bulk_create
        def fail(*args,**kwargs):
            original(*args,**kwargs)
            raise RuntimeError('synthetic weighing draft failure')
        with patch('apps.livestock.mobile_weighing.CattleManagementEntry.objects.bulk_create',side_effect=fail):
            self.assertEqual(self.save(values).status_code,500)
        self.assertEqual(CattleManagement.objects.count(),before); self.assertEqual(CattleManagementEntry.objects.count(),entries)
        self.assertFalse(WeightRecord.objects.exists())

    def test_catalog_filters_pagination_and_cost_free_query_count(self):
        options=self.client.get(self.base+'mobile-weighing-options/',self.query)
        self.assertEqual(options.data['max_participants'],1000)
        with CaptureQueriesContext(connection) as small:
            response=self.client.get(self.base+'mobile-weighing-animals/',{**self.query,'page_size':1})
        self.assertEqual(response.data['count'],2); self.assertIsNotNone(response.data['next'])
        for index in range(4): Animal.objects.create(farm=self.farm,species=self.species,identifier=f'NEW-{index}',cattle_purpose='dairy')
        with CaptureQueriesContext(connection) as large:
            response=self.client.get(self.base+'mobile-weighing-animals/',{**self.query,'page_size':1})
        self.assertEqual(response.data['count'],6); self.assertEqual(len(small),len(large))
        self.assertEqual(self.client.get(self.base+'mobile-weighing-animals/',{**self.query,'search':'HEIFER'}).data['count'],1)
        sql=' '.join(row['sql'].lower() for row in large)
        self.assertNotIn('purchase_price',sql); self.assertNotIn('current_weight_kg',sql)
