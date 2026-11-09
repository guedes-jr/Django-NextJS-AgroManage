from decimal import Decimal
from unittest.mock import patch
from unittest import skipUnless
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from django.db import connection, close_old_connections
from rest_framework.test import APITestCase, APITransactionTestCase, APIClient
from apps.livestock.tests import test_mobile_collective_medication as fixtures
from apps.livestock.models import Animal, CattleManagement, CattleManagementEntry, HealthRecord, CattleMilkRecord
from apps.inventory.models import MovimentacaoEstoque
from apps.finance.models import Transaction, PaymentEvent


class CollectiveMedicationConfirmationTests(APITestCase):
    base=fixtures.CollectiveMedicationDraftTests.base
    def setUp(self):
        fixtures.CollectiveMedicationDraftTests.setUp(self)
        response=fixtures.CollectiveMedicationDraftTests.save(self,fixtures.CollectiveMedicationDraftTests.values(self))
        self.assertEqual(response.status_code,201,response.data)
        self.management=CattleManagement.objects.get(pk=response.data['id'])
        self.beef=Animal.objects.create(farm=self.farm,species=self.species,identifier='C',gender='M',cattle_purpose='beef')
        CattleManagementEntry.objects.create(management=self.management,animal=self.beef)
        self.query={'farm':str(self.farm.pk),'production':'dairy'}
    def review(self,pk=None):
        response=self.client.get(self.base+f'{pk or self.management.pk}/mobile-collective-medication-review/',self.query)
        self.assertEqual(response.status_code,200,response.data);return response.data
    def confirm(self,review,pk=None):
        return self.client.post(self.base+f'{pk or self.management.pk}/confirm/?view=mobile-collective-medication',{'preview_token':review['preview_token']},format='json')
    def test_whole_mixed_review_no_effect_and_exact_stock_health_once(self):
        review=self.review();self.assertEqual(review['participant_count'],3);self.assertEqual(review['total_quantity'],'7.50');self.assertEqual(review['remaining'],'12.50')
        self.assertNotIn('cost',str(review));self.assertFalse(MovimentacaoEstoque.objects.exists());self.assertFalse(HealthRecord.objects.exists())
        response=self.confirm(review);self.assertEqual(response.status_code,200,response.data)
        self.lot.refresh_from_db();self.assertEqual(self.lot.quantidade_atual,Decimal('12.50'))
        self.management.refresh_from_db();self.assertEqual(self.management.inventory_cost_snapshot,Decimal('15.00'))
        self.assertEqual(self.management.status,'confirmed');self.assertEqual(HealthRecord.objects.filter(cattle_management=self.management).count(),3)
        self.assertEqual(MovimentacaoEstoque.objects.get().quantidade,Decimal('7.50'));self.assertEqual(self.confirm(review).status_code,409)
        self.assertFalse(Transaction.objects.exists());self.assertFalse(PaymentEvent.objects.exists())
    def test_stock_unit_cost_and_carencia_changes_invalidate_review(self):
        for target,field,value in [(self.lot,'quantidade_atual',Decimal('19')),(self.lot,'custo_unitario',Decimal('3')),
            (self.item,'unidade_medida','l'),(self.item,'carencia_dias',5)]:
            review=self.review();old=getattr(target,field);setattr(target,field,value);target.save()
            self.assertEqual(self.confirm(review).status_code,409)
            setattr(target,field,old);target.save()
        self.assertFalse(HealthRecord.objects.exists());self.assertFalse(MovimentacaoEstoque.objects.exists())
    def test_metadata_entries_or_animal_change_invalidates_review(self):
        review=self.review();self.management.notes='Changed';self.management.save();self.assertEqual(self.confirm(review).status_code,409)
        review=self.review();self.beef.status='sold';self.beef.save();self.assertEqual(self.confirm(review).status_code,409)
        self.beef.status='active';self.beef.save();review=self.review();self.management.entries.filter(animal=self.beef).update(weight_kg=1)
        self.assertEqual(self.confirm(review).status_code,409)
    def test_usable_milk_on_other_participant_after_review_blocks_all_effects(self):
        review=self.review();CattleMilkRecord.objects.create(animal=self.other,date=self.today,session='morning',liters=5)
        self.assertEqual(self.confirm(review).status_code,409);self.assertFalse(HealthRecord.objects.exists())
        self.lot.refresh_from_db();self.assertEqual(self.lot.quantidade_atual,Decimal('20'))
    def test_signed_token_scope_roles_and_strict_command(self):
        review=self.review();self.assertEqual(self.confirm({'preview_token':'tampered'}).status_code,409)
        self.assertEqual(self.client.post(self.base+f'{self.management.pk}/confirm/?view=mobile-collective-medication',{'preview_token':review['preview_token'],'quantity':'1'},format='json').status_code,400)
        self.assertEqual(self.client.get(self.base+f'{self.management.pk}/mobile-collective-medication-review/',{**self.query,'farm':str(self.item.pk)}).status_code,404)
        from django.contrib.auth import get_user_model
        actor=get_user_model().objects.create_user(email='other-collective@example.invalid',password='test',role='manager',organization=self.org)
        self.client.force_authenticate(actor);self.assertEqual(self.confirm(review).status_code,403);self.client.force_authenticate(self.user)
        for role in ['operator','feeder']:
            self.user.role=role;self.user.save();self.user.allowed_livestock.add(self.species);self.assertEqual(self.confirm(review).status_code,403)
    def test_nonstock_documentary_or_cancelled_drafts_not_supported(self):
        review=self.review();self.management.status='cancelled';self.management.save();self.assertEqual(self.confirm(review).status_code,409)
        self.management.status='draft';self.management.inventory_quantity_per_animal=None;self.management.save()
        self.assertEqual(self.client.get(self.base+f'{self.management.pk}/mobile-collective-medication-review/',self.query).status_code,409)
    def test_failure_after_second_health_record_restores_stock_movement_and_status(self):
        review=self.review();original=HealthRecord.objects.create;calls=[]
        def fail(*args,**kwargs):
            row=original(*args,**kwargs);calls.append(row.pk)
            if len(calls)==2:raise RuntimeError('synthetic')
            return row
        with patch('apps.livestock.cattle_services.HealthRecord.objects.create',side_effect=fail):self.assertEqual(self.confirm(review).status_code,500)
        self.lot.refresh_from_db();self.assertEqual(self.lot.quantidade_atual,Decimal('20'))
        self.assertFalse(HealthRecord.objects.exists());self.assertFalse(MovimentacaoEstoque.objects.exists())
        self.management.refresh_from_db();self.assertEqual(self.management.status,'draft');self.assertIsNone(self.management.inventory_movement)


@skipUnless(connection.vendor=='postgresql','PostgreSQL locking required')
class CollectiveMedicationConcurrencyTests(APITransactionTestCase):
    base=CollectiveMedicationConfirmationTests.base
    setUp=CollectiveMedicationConfirmationTests.setUp
    review=CollectiveMedicationConfirmationTests.review
    def race(self,legacy=False,distinct=False):
        first=self.review();other=self.management
        if distinct:
            other=CattleManagement.objects.create(farm=self.farm,kind='sanitary',treatment_type='medication',date=self.today,description='Other',created_by=self.user,
                inventory_lot=self.lot,inventory_quantity_per_animal='2.50',milk_withdrawal_until=self.management.milk_withdrawal_until,meat_withdrawal_until=self.management.meat_withdrawal_until)
            for animal in [self.animal,self.other,self.beef]:CattleManagementEntry.objects.create(management=other,animal=animal)
        second=self.review(other.pk);gate=Barrier(2)
        def write(index):
            close_old_connections()
            try:
                client=APIClient();client.force_authenticate(self.user);gate.wait(timeout=10)
                pk=other.pk if index else self.management.pk
                return client.post(self.base+f'{pk}/confirm/'+('' if legacy and index else '?view=mobile-collective-medication'),
                    {} if legacy and index else {'preview_token':(second if index else first)['preview_token']},format='json').status_code
            finally:close_old_connections()
        with ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(write,[0,1]))
        self.assertEqual(HealthRecord.objects.count(),3);self.assertEqual(MovimentacaoEstoque.objects.count(),1)
        self.lot.refresh_from_db();self.assertEqual(self.lot.quantidade_atual,Decimal('12.50'));return sorted(results)
    def test_native_confirm_applies_once(self):self.assertEqual(self.race(),[200,409])
    def test_web_native_same_management_applies_once(self):self.assertIn(self.race(legacy=True),[[200,200],[200,409]])
    def test_distinct_drafts_same_lot_invalidate_second_review(self):self.assertEqual(self.race(distinct=True),[200,409])
