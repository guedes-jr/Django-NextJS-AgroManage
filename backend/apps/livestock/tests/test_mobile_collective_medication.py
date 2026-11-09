from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch
from rest_framework.test import APITestCase
from apps.livestock.tests import test_mobile_medication as fixtures
from apps.livestock.models import Animal, CattleManagement, CattleManagementEntry, HealthRecord, CattleMilkRecord
from apps.inventory.models import MovimentacaoEstoque
from apps.finance.models import Transaction


class CollectiveMedicationDraftTests(APITestCase):
    base=fixtures.MobileMedicationTests.base
    def setUp(self):
        fixtures.MobileMedicationTests.setUp(self)
        self.animal.cattle_purpose='dairy'; self.animal.save()
        self.other=Animal.objects.create(farm=self.farm,species=self.species,identifier='B',gender='F',cattle_purpose='dual')
    def values(self):
        base=fixtures.MobileMedicationTests.values(self)
        return {key:value for key,value in base.items() if key not in ['animal','expected_farm']}|{'farm':str(self.farm.pk),'production':'dairy',
            'treatment_type':'medication','next_procedure_date':None,'entries':[{'animal':str(a.pk),'animal_version':a.updated_at.isoformat()} for a in [self.animal,self.other]]}
    def save(self,values):
        return self.client.post(self.base+'mobile-collective-medication-drafts/',values,format='json')
    def test_draft_preserves_product_quantity_and_participants_without_reservation(self):
        values=self.values()
        for _ in range(2):
            response=self.save(values); self.assertEqual(response.status_code,201,response.data)
            self.assertEqual(response.data['total_quantity'],'5.00'); self.assertEqual(response.data['unit'],'ml')
            record=CattleManagement.objects.get(pk=response.data['id']); self.assertEqual(record.status,'draft')
            self.assertEqual(record.inventory_lot,self.lot); self.assertEqual(record.inventory_quantity_per_animal,Decimal('2.50'))
            self.assertEqual(record.entries.count(),2); self.assertFalse(record.entries.exclude(weight_kg=None).exists())
            self.assertEqual(record.created_by,self.user); self.assertIsNone(record.inventory_movement)
        self.lot.refresh_from_db(); self.assertEqual(self.lot.quantidade_atual,Decimal('20'))
        self.assertFalse(HealthRecord.objects.exists()); self.assertFalse(MovimentacaoEstoque.objects.exists()); self.assertFalse(Transaction.objects.exists())
    def test_total_stock_unit_carencia_and_dates_are_authoritative(self):
        values=self.values()
        for change in [{'quantity':'10.01'},{'quantity':'0'},{'quantity':'1.001'},{'expected_unit':'l'},
            {'milk_withdrawal_until':None},{'meat_withdrawal_until':str(self.today)},{'date':'2099-01-01'},
            {'next_procedure_date':'2000-01-01'},{'treatment_type':'exam'},{'cost_per_animal':'1'}]:
            self.assertEqual(self.save({**values,**change}).status_code,400)
        self.assertFalse(CattleManagement.objects.exists())
    def test_every_participant_milk_is_checked_and_legacy_stock_dates_guarded(self):
        values=self.values(); milk=CattleMilkRecord.objects.create(animal=self.other,date=self.today,session='morning',liters=5)
        self.assertEqual(self.save(values).status_code,400); milk.delete()
        self.lot.data_validade=self.today-timedelta(days=1); self.lot.save()
        self.assertEqual(self.save(values).status_code,400); self.assertFalse(CattleManagement.objects.exists())
    def test_versions_duplicates_segments_and_foreign_scope_rejected(self):
        values=self.values(); self.other.status='sold'; self.other.save(); self.assertEqual(self.save(values).status_code,409)
        self.other.status='active'; self.other.save(); values=self.values()
        self.assertEqual(self.save({**values,'entries':[values['entries'][0]]*2}).status_code,400)
        self.assertEqual(self.save({**values,'production':'beef'}).status_code,409)
        self.item.organization=fixtures.Organization.objects.create(name='Other',slug='collective-other'); self.item.save()
        self.assertEqual(self.save(values).status_code,400)
    def test_roles_and_birth_chronology(self):
        values=self.values(); self.other.birth_date=self.today; self.other.save(); values=self.values()
        self.assertEqual(self.save({**values,'date':str(self.today-timedelta(days=1))}).status_code,400)
        for role in ['operator','feeder']:
            self.user.role=role; self.user.save(); self.user.allowed_livestock.add(self.species)
            self.assertEqual(self.save(values).status_code,403)
    def test_entry_failure_rolls_back_draft_and_leaves_stock_unchanged(self):
        values=self.values(); original=CattleManagementEntry.objects.bulk_create
        def fail(*args,**kwargs):original(*args,**kwargs);raise RuntimeError('synthetic')
        with patch.object(CattleManagementEntry.objects,'bulk_create',fail):self.assertEqual(self.save(values).status_code,500)
        self.assertFalse(CattleManagement.objects.exists());self.assertFalse(CattleManagementEntry.objects.exists())
        self.lot.refresh_from_db();self.assertEqual(self.lot.quantidade_atual,Decimal('20'))
