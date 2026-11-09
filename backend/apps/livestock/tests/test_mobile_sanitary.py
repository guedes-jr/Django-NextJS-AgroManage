from unittest.mock import patch
from rest_framework.test import APITestCase
from apps.livestock.tests import test_mobile_reproduction as fixtures
from apps.livestock.models import CattleManagement, CattleManagementEntry, HistoricoEvento, HealthRecord, WeightRecord
from apps.inventory.models import MovimentacaoEstoque


class SanitaryDraftTests(APITestCase):
    base='/api/v1/livestock/cattle/managements/'
    def setUp(self):
        fixtures.MobileReproductionTests.setUp(self)
        self.query={'farm':str(self.farm.pk),'production':'dairy'}
    def values(self):
        response=self.client.get(self.base+'mobile-sanitary-animals/',self.query)
        self.assertEqual(response.status_code,200,response.data)
        return {**self.query,'date':str(self.today),'description':'Collective exam','responsible':'Team','notes':'Draft only',
            'treatment_type':'exam','next_procedure_date':None,'milk_withdrawal_until':None,'meat_withdrawal_until':None,
            'entries':[{'animal':row['id'],'animal_version':row['version']} for row in response.data['results']]}
    def save(self,values):
        return self.client.post(self.base+'mobile-sanitary-drafts/',values,format='json')
    def test_active_females_are_eligible_with_pagination_and_segment_scope(self):
        response=self.client.get(self.base+'mobile-sanitary-animals/',{**self.query,'page_size':1})
        self.assertEqual(response.status_code,200,response.data); self.assertEqual(response.data['count'],2)
        self.assertIsNotNone(response.data['next']); self.assertTrue(all(row['status']=='active' for row in response.data['results']))
        self.assertEqual(self.client.get(self.base+'mobile-sanitary-animals/',{**self.query,'search':self.beef.identifier}).data['count'],0)
    def test_documentary_draft_has_no_effects_and_preserves_dates_and_type(self):
        for treatment in ['exam','surgery','other']:
            values=self.values(); values.update(treatment_type=treatment,next_procedure_date=str(self.today),milk_withdrawal_until='2099-01-01')
            response=self.save(values); self.assertEqual(response.status_code,201,response.data)
            row=CattleManagement.objects.get(pk=response.data['id']); self.assertEqual(row.kind,'sanitary'); self.assertEqual(row.status,'draft')
            self.assertEqual(row.treatment_type,treatment); self.assertEqual(row.created_by,self.user); self.assertEqual(str(row.milk_withdrawal_until),'2099-01-01')
            self.assertEqual(row.entries.count(),2); self.assertFalse(row.entries.exclude(weight_kg=None).exists()); self.assertIsNone(row.inventory_lot)
        for model in [HistoricoEvento,HealthRecord,WeightRecord,MovimentacaoEstoque]: self.assertFalse(model.objects.exists())
    def test_strict_input_dates_limits_duplicates_and_no_medication_stock_cost(self):
        values=self.values(); entry=values['entries'][0]
        for change in [{'entries':[]},{'entries':[entry]*2},{'entries':[entry]*1001},{'entries':[{**entry,'weight_kg':'1'}]},
            {'treatment_type':'medication'},{'inventory_lot':str(self.farm.pk)},{'cost_per_animal':'2'},{'date':'2099-01-01'},
            {'notes':'x'*2001},{'next_procedure_date':'2020-01-01'},{'milk_withdrawal_until':'2020-01-01'},{'meat_withdrawal_until':'2020-01-01'}]:
            self.assertEqual(self.save({**values,**change}).status_code,400)
        self.assertFalse(CattleManagement.objects.exists())
    def test_changed_inactive_foreign_or_other_segment_animals_rejected(self):
        values=self.values(); self.cow.notes='Changed'; self.cow.save(); self.assertEqual(self.save(values).status_code,409)
        values=self.values(); self.cow.status='sold'; self.cow.save(); self.assertEqual(self.save(values).status_code,409)
        values=self.values()
        for animal in [self.foreign,self.beef]:
            self.assertEqual(self.save({**values,'entries':[{'animal':str(animal.pk),'animal_version':animal.updated_at.isoformat()}]}).status_code,409)
    def test_tenant_roles_and_animal_chronology_guarded(self):
        values=self.values(); self.assertEqual(self.save({**values,'farm':str(self.foreign_farm.pk)}).status_code,404)
        self.cow.entry_date=self.today; self.cow.save(); values=self.values(); self.assertEqual(self.save({**values,'date':'2020-01-01'}).status_code,400)
        for role in ['operator','feeder']:
            self.user.role=role; self.user.save(); self.user.allowed_livestock.add(self.species)
            self.assertEqual(self.save(values).status_code,403)
            self.assertEqual(self.client.get(self.base+'mobile-sanitary-options/',self.query).status_code,403)
    def test_entry_failure_rolls_back_management_and_entries(self):
        values=self.values(); original=CattleManagementEntry.objects.bulk_create
        def fail(*args,**kwargs):
            original(*args,**kwargs); raise RuntimeError('synthetic')
        with patch.object(CattleManagementEntry.objects,'bulk_create',fail): self.assertEqual(self.save(values).status_code,500)
        self.assertFalse(CattleManagement.objects.exists()); self.assertFalse(CattleManagementEntry.objects.exists())
