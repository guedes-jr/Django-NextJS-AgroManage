from unittest.mock import patch
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APITestCase
from apps.livestock.tests import test_mobile_reproduction as fixtures
from apps.livestock.models import Animal, CattleAnimalProfile, CattleManagement, CattleManagementEntry, HistoricoEvento, WeightRecord
from apps.inventory.models import MovimentacaoEstoque


class MobileCastrationTests(APITestCase):
    base='/api/v1/livestock/cattle/managements/'
    def setUp(self):
        fixtures.MobileReproductionTests.setUp(self)
        self.dual=Animal.objects.create(farm=self.farm,species=self.species,identifier='0002',gender='M',cattle_purpose='dual')
        self.done=Animal.objects.create(farm=self.farm,species=self.species,identifier='DONE',gender='M',cattle_purpose='beef')
        CattleAnimalProfile.objects.create(animal=self.done,is_castrated=True)
        self.query={'farm':str(self.farm.pk),'production':'beef'}
    def values(self):
        response=self.client.get(self.base+'mobile-castration-animals/',self.query)
        self.assertEqual(response.status_code,200,response.data)
        return {**self.query,'date':str(self.today),'description':'Collective castration','responsible':'Team','notes':'Draft only',
            'entries':[{'animal':row['id'],'animal_version':row['version']} for row in response.data['results']]}
    def save(self,values):
        return self.client.post(self.base+'mobile-castration-drafts/',values,format='json')

    def test_catalog_only_active_males_not_already_marked_castrated(self):
        response=self.client.get(self.base+'mobile-castration-animals/',{**self.query,'page_size':1})
        self.assertEqual(response.status_code,200,response.data); self.assertEqual(response.data['count'],2)
        self.assertIsNotNone(response.data['next'])
        self.assertEqual(response.data['results'][0]['gender'],'M'); self.assertFalse(response.data['results'][0]['is_castrated'])
        self.assertEqual(CattleAnimalProfile.objects.count(),1)
        self.assertEqual(self.client.get(self.base+'mobile-castration-animals/',{**self.query,'search':'DONE'}).data['count'],0)

    def test_draft_does_not_change_profiles_history_weights_or_inventory(self):
        values=self.values(); response=self.save(values)
        self.assertEqual(response.status_code,201,response.data); self.assertEqual(response.data['kind'],'castration')
        row=CattleManagement.objects.get(pk=response.data['id']); self.assertEqual(row.status,'draft'); self.assertEqual(row.created_by,self.user)
        self.assertEqual(row.entries.count(),2); self.assertFalse(row.entries.exclude(weight_kg=None).exists())
        self.assertEqual(CattleAnimalProfile.objects.count(),1); self.assertFalse(HistoricoEvento.objects.exists())
        self.assertFalse(WeightRecord.objects.exists()); self.assertFalse(MovimentacaoEstoque.objects.exists())

    def test_duplicates_limits_date_and_injected_fields_rejected(self):
        values=self.values(); entry=values['entries'][0]
        for change in [{'entries':[]},{'entries':[entry,entry]},{'entries':[entry]*1001},{'entries':[{**entry,'weight_kg':'100'}]},
            {'inventory_lot':str(self.farm.pk)},{'date':'2099-01-01'}]:
            self.assertEqual(self.save({**values,**change}).status_code,400)
        self.beef.entry_date=self.today; self.beef.save(); values=self.values(); values['date']='2020-01-01'
        self.assertEqual(self.save(values).status_code,400); self.assertFalse(CattleManagement.objects.exists())

    def test_changed_castration_state_inactive_female_and_foreign_are_rejected(self):
        values=self.values(); CattleAnimalProfile.objects.create(animal=self.beef,is_castrated=True)
        self.assertEqual(self.save(values).status_code,409)
        for animal in [self.cow,self.foreign,self.done]:
            self.assertEqual(self.save({**values,'entries':[{'animal':str(animal.pk),'animal_version':values['entries'][0]['animal_version']}]}).status_code,409)
        values=self.values(); self.dual.status='sold'; self.dual.save()
        self.assertEqual(self.save(values).status_code,409)

    def test_own_farm_and_manager_roles_required(self):
        values=self.values()
        self.assertEqual(self.client.get(self.base+'mobile-castration-options/',{**self.query,'farm':str(self.foreign_farm.pk)}).status_code,404)
        for role in ['operator','feeder']:
            self.user.role=role; self.user.save(); self.user.allowed_livestock.add(self.species)
            self.assertEqual(self.client.get(self.base+'mobile-castration-options/',self.query).status_code,403)
            self.assertEqual(self.client.get(self.base+'mobile-castration-animals/',self.query).status_code,403)
            self.assertEqual(self.save(values).status_code,403)

    def test_failure_rolls_back_and_catalog_projection_avoids_n_plus_one(self):
        values=self.values(); original=CattleManagementEntry.objects.bulk_create
        def fail(*args,**kwargs):
            original(*args,**kwargs)
            raise RuntimeError('synthetic castration draft failure')
        with patch('apps.livestock.mobile_castration.CattleManagementEntry.objects.bulk_create',side_effect=fail):
            self.assertEqual(self.save(values).status_code,500)
        self.assertFalse(CattleManagement.objects.exists()); self.assertFalse(CattleManagementEntry.objects.exists())
        with CaptureQueriesContext(connection) as small: self.client.get(self.base+'mobile-castration-animals/',self.query)
        for index in range(4): Animal.objects.create(farm=self.farm,species=self.species,identifier=f'NEW-{index}',gender='M',cattle_purpose='beef')
        with CaptureQueriesContext(connection) as large: response=self.client.get(self.base+'mobile-castration-animals/',self.query)
        self.assertEqual(response.data['count'],6); self.assertEqual(len(small),len(large))
        self.assertNotIn('purchase_price',' '.join(row['sql'].lower() for row in large))
