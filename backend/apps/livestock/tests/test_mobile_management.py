from decimal import Decimal
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APITestCase
from apps.livestock.tests import test_mobile_reproduction as fixtures
from apps.livestock.models import CattleManagement, CattleManagementEntry, WeightRecord
from apps.inventory.models import MovimentacaoEstoque


class MobileManagementTests(APITestCase):
    base='/api/v1/livestock/cattle/managements/'
    def setUp(self):
        fixtures.MobileReproductionTests.setUp(self)
        self.management=CattleManagement.objects.create(farm=self.farm,kind='weighing',date=self.today,
            description='Mixed weighing',responsible='Field team',created_by=self.user,cost_per_animal=Decimal('99.99'))
        for animal in [self.cow,self.heifer,self.beef]:
            CattleManagementEntry.objects.create(management=self.management,animal=animal,weight_kg=Decimal('420.50') if animal==self.cow else None)
        self.beef_only=CattleManagement.objects.create(farm=self.farm,kind='sanitary',status='confirmed',date=self.today,
            description='Beef medication',created_by=self.user,treatment_type='medication',next_procedure_date=self.today,
            milk_withdrawal_until=self.today,follow_up_status='done',follow_up_note='Completed')
        CattleManagementEntry.objects.create(management=self.beef_only,animal=self.beef)
        self.query={'production':'dairy','farm':str(self.farm.pk)}

    def test_segment_counts_mixed_participants_and_scoped_detail(self):
        response=self.client.get(self.base+'mobile/',self.query)
        self.assertEqual(response.status_code,200,response.data); self.assertEqual(response.data['count'],1)
        row=response.data['results'][0]; self.assertEqual(row['participant_count'],3); self.assertEqual(row['segment_count'],2)
        response=self.client.get(self.base+f'{self.management.pk}/mobile-participants/',{**self.query,'page_size':1})
        self.assertEqual(response.status_code,200,response.data); self.assertEqual(response.data['count'],3)
        self.assertIsNotNone(response.data['next'])
        detail=self.client.get(self.base+f'{self.beef_only.pk}/mobile/',{**self.query,'production':'beef'})
        self.assertEqual(detail.status_code,200,detail.data); self.assertEqual(detail.data['follow_up_note'],'Completed')
        self.assertIn('timezone',detail.data); self.assertEqual(detail.data['milk_withdrawal_until'],str(self.today))
        self.assertEqual(self.client.get(self.base+f'{self.beef_only.pk}/mobile/',self.query).status_code,404)

    def test_kind_status_description_and_participant_search(self):
        self.assertEqual(self.client.get(self.base+'mobile/',{**self.query,'kind':'sanitary'}).data['count'],0)
        self.assertEqual(self.client.get(self.base+'mobile/',{**self.query,'status':'confirmed'}).data['count'],0)
        self.assertEqual(self.client.get(self.base+'mobile/',{**self.query,'search':'Field team'}).data['count'],1)
        response=self.client.get(self.base+f'{self.management.pk}/mobile-participants/',{**self.query,'participant_search':'COW'})
        self.assertEqual(response.data['count'],1); self.assertEqual(response.data['results'][0]['weight_kg'],'420.50')
        self.assertEqual(response.data['results'][0]['identifier'],'COW')

    def test_tenant_farm_invalid_participants_and_validation(self):
        self.assertEqual(self.client.get(self.base+'mobile/',{**self.query,'farm':str(self.foreign_farm.pk)}).data['count'],0)
        self.assertEqual(self.client.get(self.base+f'{self.management.pk}/mobile/',{**self.query,'farm':str(self.foreign_farm.pk)}).status_code,404)
        for values in [{},{**self.query,'kind':'other'},{**self.query,'status':'pending'},{**self.query,'farm':'farm'},{**self.query,'search':'x'*101}]:
            self.assertEqual(self.client.get(self.base+'mobile/',values).status_code,400)
        CattleManagementEntry.objects.create(management=self.management,animal=self.foreign)
        self.assertEqual(self.client.get(self.base+f'{self.management.pk}/mobile/',self.query).status_code,404)
        self.assertEqual(self.client.get(self.base+f'{self.management.pk}/mobile-participants/',self.query).status_code,404)

    def test_manager_only_preserves_legacy_access(self):
        self.assertEqual(self.client.get(self.base,{'production':'dairy'}).status_code,200)
        for role in ['operator','feeder']:
            self.user.role=role; self.user.save(); self.user.allowed_livestock.add(self.species)
            self.assertEqual(self.client.get(self.base+'mobile/',self.query).status_code,403)
            self.assertEqual(self.client.get(self.base+f'{self.management.pk}/mobile/',self.query).status_code,403)
            self.assertEqual(self.client.get(self.base+f'{self.management.pk}/mobile-participants/',self.query).status_code,403)

    def test_projection_has_no_financial_columns_and_reads_do_not_write(self):
        with CaptureQueriesContext(connection) as captured:
            response=self.client.get(self.base+f'{self.management.pk}/mobile/',self.query)
            participants=self.client.get(self.base+f'{self.management.pk}/mobile-participants/',self.query)
        sql=' '.join(row['sql'].lower() for row in captured)
        for field in ['cost_per_animal','inventory_cost_snapshot','purchase_price']:
            self.assertNotIn(field,sql); self.assertNotIn(field,str(response.data)); self.assertNotIn(field,str(participants.data))
        self.management.refresh_from_db(); self.assertEqual(self.management.status,'draft')
        self.assertFalse(WeightRecord.objects.exists()); self.assertFalse(MovimentacaoEstoque.objects.exists())

    def test_list_and_participant_queries_do_not_grow_per_row(self):
        with CaptureQueriesContext(connection) as small: self.client.get(self.base+'mobile/',self.query)
        for offset in range(4):
            row=CattleManagement.objects.create(farm=self.farm,kind='castration',date=self.today,description=f'Extra {offset}',created_by=self.user)
            CattleManagementEntry.objects.create(management=row,animal=self.heifer)
        with CaptureQueriesContext(connection) as large: response=self.client.get(self.base+'mobile/',self.query)
        self.assertEqual(response.data['count'],5); self.assertEqual(len(small),len(large))
        self.assertEqual(self.client.get(self.base+f'{self.management.pk}/mobile-participants/',{**self.query,'participant_search':'x'*101}).status_code,400)
