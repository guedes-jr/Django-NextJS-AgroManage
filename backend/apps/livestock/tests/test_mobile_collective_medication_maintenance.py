from unittest.mock import patch
from unittest import skipUnless
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from decimal import Decimal
from django.db import connection, close_old_connections
from rest_framework.test import APITestCase, APITransactionTestCase, APIClient
from apps.livestock.tests import test_mobile_collective_medication_confirmation as fixtures
from apps.livestock.models import CattleManagementEntry, HealthRecord
from apps.inventory.models import MovimentacaoEstoque, LoteEstoque


class CollectiveMedicationMaintenanceTests(APITestCase):
    base=fixtures.CollectiveMedicationConfirmationTests.base
    setUp=fixtures.CollectiveMedicationConfirmationTests.setUp
    def values(self):
        response=self.client.get(self.base+f'{self.management.pk}/mobile-collective-medication-edit/',self.query)
        self.assertEqual(response.status_code,200,response.data);row=response.data
        return {**self.query,'expected_version':row['version'],**row['values'],'inventory_lot':row['lot']['id'],'expected_unit':row['lot']['unit'],
            **{key:row['values'][key] or None for key in ['next_procedure_date','milk_withdrawal_until','meat_withdrawal_until']},
            'entries':[{'animal':entry['id'],'animal_version':entry['version']} for entry in row['entries']]}
    def edit(self,values):
        return self.client.patch(self.base+f'{self.management.pk}/?view=mobile-collective-medication',values,format='json')
    def cancellation(self,values):
        return {key:values[key] for key in ['farm','production','expected_version']}|{'reason':'Schedule replaced'}
    def cancel(self,values):
        return self.client.post(self.base+f'{self.management.pk}/cancel/?view=mobile-collective-medication',self.cancellation(values),format='json')
    def test_edit_changes_lot_and_quantity_preserving_mixed_participants_without_stock_effects(self):
        values=self.values();self.assertEqual(len(values['entries']),3)
        lot=LoteEstoque(item=self.item,numero_lote='OTHER',quantidade_inicial=10,quantidade_atual=10,data_entrada=self.today,custo_unitario=2)
        lot._skip_finance_transaction=True;lot.save()
        response=self.edit({**values,'inventory_lot':str(lot.pk),'quantity':'3.00','description':'Revised medication'})
        self.assertEqual(response.status_code,200,response.data);self.assertEqual(response.data['total_quantity'],'9.00')
        self.management.refresh_from_db();self.assertEqual(self.management.inventory_lot_id,lot.pk);self.assertEqual(self.management.entries.count(),3)
        self.assertEqual(set(self.management.entries.values_list('animal_id',flat=True)),{self.animal.pk,self.other.pk,self.beef.pk})
        self.lot.refresh_from_db();lot.refresh_from_db();self.assertEqual(self.lot.quantidade_atual,Decimal('20'));self.assertEqual(lot.quantidade_atual,Decimal('10'))
        self.assertFalse(HealthRecord.objects.exists());self.assertFalse(MovimentacaoEstoque.objects.exists());self.assertEqual(self.edit(values).status_code,409)
    def test_stock_unit_dates_duplicate_and_injected_fields_are_rejected(self):
        values=self.values()
        for change in [{'quantity':'7.00'},{'expected_unit':'l'},{'milk_withdrawal_until':None},{'date':'2099-01-01'},
            {'entries':[values['entries'][0]]*2},{'cost_per_animal':1},{'treatment_type':'exam'}]:
            self.assertEqual(self.edit({**values,**change}).status_code,400)
        self.assertEqual(self.edit({**values,'entries':[row for row in values['entries'] if row['animal']==str(self.beef.pk)]}).status_code,409)
        self.assertFalse(HealthRecord.objects.exists())
    def test_inactive_animal_and_unavailable_stock_remain_readable_and_cancellable(self):
        self.beef.status='sold';self.beef.save();self.lot.ativo=False;self.lot.quantidade_atual=0;self.lot.save()
        values=self.values();self.assertEqual(self.edit(values).status_code,409);self.assertEqual(self.cancel(values).status_code,200)
        self.management.refresh_from_db();self.assertEqual(self.management.status,'cancelled');self.assertEqual(self.management.entries.count(),3)
        self.assertFalse(MovimentacaoEstoque.objects.exists())
    def test_version_reason_and_confirmed_immutability(self):
        values=self.values()
        for reason in ['', ' ', 'x'*301]:
            self.assertEqual(self.client.post(self.base+f'{self.management.pk}/cancel/?view=mobile-collective-medication',{**self.cancellation(values),'reason':reason},format='json').status_code,400)
        review=fixtures.CollectiveMedicationConfirmationTests.review(self);self.assertEqual(self.edit(values).status_code,200)
        self.assertEqual(fixtures.CollectiveMedicationConfirmationTests.confirm(self,review).status_code,409);self.assertEqual(self.cancel(values).status_code,409)
        values=self.values();review=fixtures.CollectiveMedicationConfirmationTests.review(self)
        self.assertEqual(fixtures.CollectiveMedicationConfirmationTests.confirm(self,review).status_code,200)
        self.assertEqual(self.edit(values).status_code,409);self.assertEqual(self.cancel(values).status_code,409)
        self.assertEqual(HealthRecord.objects.count(),3);self.assertEqual(MovimentacaoEstoque.objects.count(),1)
    def test_failure_restores_original_entries_and_stock_link(self):
        values=self.values();before=set(self.management.entries.values_list('id',flat=True));original=CattleManagementEntry.objects.bulk_create
        def fail(*args,**kwargs):original(*args,**kwargs);raise RuntimeError('synthetic')
        with patch.object(CattleManagementEntry.objects,'bulk_create',fail):self.assertEqual(self.edit({**values,'quantity':'3.00'}).status_code,500)
        self.management.refresh_from_db();self.assertEqual(self.management.inventory_quantity_per_animal,Decimal('2.50'))
        self.assertEqual(set(self.management.entries.values_list('id',flat=True)),before);self.assertFalse(MovimentacaoEstoque.objects.exists())
    def test_tenant_role_and_foreign_stock_are_guarded(self):
        values=self.values();self.assertEqual(self.edit({**values,'farm':str(self.item.pk)}).status_code,404)
        self.assertEqual(self.edit({**values,'inventory_lot':str(self.item.pk)}).status_code,400)
        for role in ['operator','feeder']:
            self.user.role=role;self.user.save();self.user.allowed_livestock.add(self.species)
            self.assertEqual(self.edit(values).status_code,403);self.assertEqual(self.cancel(values).status_code,403)


@skipUnless(connection.vendor=='postgresql','PostgreSQL locking required')
class CollectiveMedicationMaintenanceConcurrencyTests(APITransactionTestCase):
    base=CollectiveMedicationMaintenanceTests.base
    setUp=CollectiveMedicationMaintenanceTests.setUp
    values=CollectiveMedicationMaintenanceTests.values
    cancellation=CollectiveMedicationMaintenanceTests.cancellation
    def race(self,cancelling=False):
        values=self.values();review=fixtures.CollectiveMedicationConfirmationTests.review(self);gate=Barrier(2)
        def write(index):
            close_old_connections()
            try:
                client=APIClient();client.force_authenticate(self.user);gate.wait(timeout=10)
                if index:return client.post(self.base+f'{self.management.pk}/confirm/?view=mobile-collective-medication',{'preview_token':review['preview_token']},format='json').status_code
                if cancelling:return client.post(self.base+f'{self.management.pk}/cancel/?view=mobile-collective-medication',self.cancellation(values),format='json').status_code
                return client.patch(self.base+f'{self.management.pk}/?view=mobile-collective-medication',values,format='json').status_code
            finally:close_old_connections()
        with ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(write,[0,1]))
        self.assertEqual(sorted(results),[200,409]);self.assertIn(HealthRecord.objects.count(),[0,3]);self.assertIn(MovimentacaoEstoque.objects.count(),[0,1])
    def test_edit_versus_confirmation(self):self.race()
    def test_cancel_versus_confirmation(self):self.race(cancelling=True)
