from datetime import timedelta
from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase
from apps.organizations.models import Organization
from apps.farms.models import Farm
from apps.livestock.models import Animal, AnimalBatch, Species, ClinicalRecord, HealthRecord, VaccinationRecord, SanitaryAlert
from apps.inventory.models import MovimentacaoEstoque
from apps.accounts.models import OperatorRecordOwnership

class MobileClinicTests(APITestCase):
    base='/api/v1/livestock/clinical/records/'
    def setUp(self):
        self.org=Organization.objects.create(name='Clinic',slug='mobile-clinic')
        self.other=Organization.objects.create(name='Other',slug='mobile-clinic-other')
        self.farm=Farm.objects.create(organization=self.org,name='Farm A')
        self.foreign_farm=Farm.objects.create(organization=self.other,name='Private farm')
        self.bovine,_=Species.objects.get_or_create(code='bovinos',defaults={'name':'Bovinos'})
        self.swine,_=Species.objects.get_or_create(code='suinos',defaults={'name':'Suínos'})
        self.animal=Animal.objects.create(farm=self.farm,species=self.bovine,identifier='A-001')
        self.pig=Animal.objects.create(farm=self.farm,species=self.swine,identifier='P-001')
        self.foreign=Animal.objects.create(farm=self.foreign_farm,species=self.bovine,identifier='Private')
        self.user=get_user_model().objects.create_user(email='clinic@example.invalid',password='test',role='manager',organization=self.org)
        self.today=timezone.localdate()
        self.clinical=ClinicalRecord.objects.create(farm=self.farm,animal=self.animal,record_date=self.today,clinical_notes='Observation',treatment_cost='123')
        self.health=HealthRecord.objects.create(farm=self.farm,animal=self.animal,application_date=self.today,description='Exam',cost='250')
        self.vaccine=VaccinationRecord.objects.create(farm=self.farm,species=self.bovine,animal=self.animal,vaccine_name='Recorded vaccine',application_date=self.today)
        self.alert=SanitaryAlert.objects.create(farm=self.farm,title='Alert',alert_type='other',severity='high',description='Observation',recommended_actions='Recorded instruction')
        self.alert.affected_animals.add(self.animal)
        self.client.force_authenticate(self.user)

    def values(self,**changes):
        return dict(dict(animal=str(self.animal.pk),expected_farm=str(self.farm.pk),record_date=str(self.today),record_type='consultation',clinical_notes='New observation',severity='mild',outcome='pending',veterinarian='Vet'),**changes)

    def test_pages_details_filters_are_cost_free_and_do_not_mutate(self):
        before=ClinicalRecord.objects.count()
        for kind,obj in [('clinical',self.clinical),('health',self.health),('vaccinations',self.vaccine),('alerts',self.alert)]:
            response=self.client.get(self.base+'mobile/',{'kind':kind,'page_size':1,'farm':self.farm.pk})
            self.assertEqual(response.status_code,200,response.data);self.assertEqual(response.data['count'],1)
            self.assertNotIn('cost',str(response.data));self.assertNotIn('custo',str(response.data))
            detail=self.client.get(self.base+f'{obj.pk}/mobile/',{'kind':kind})
            self.assertEqual(detail.status_code,200,detail.data);self.assertNotIn('cost',str(detail.data))
        self.assertEqual(ClinicalRecord.objects.count(),before);self.assertFalse(MovimentacaoEstoque.objects.exists())
        self.assertEqual(self.client.get(self.base+'mobile/',{'kind':'clinical','search':'nothing'}).data['count'],0)
        self.assertEqual(self.client.get(self.base+'mobile/',{'start':self.today}).status_code,400)
        self.assertEqual(self.client.get(self.base+'mobile/',{'kind':'health','batch':str(self.animal.pk)}).status_code,400)

    def test_operator_species_and_mixed_alerts_are_not_broadened(self):
        self.user.role='operator';self.user.save();self.user.allowed_livestock.add(self.bovine)
        ClinicalRecord.objects.create(farm=self.farm,animal=self.pig,record_date=self.today,clinical_notes='Restricted')
        self.assertEqual(self.client.get(self.base+'mobile/').data['count'],1)
        self.assertEqual(self.client.get(self.base+'mobile/',{'species':'suinos'}).status_code,403)
        self.alert.affected_animals.add(self.pig)
        self.assertEqual(self.client.get(self.base+'mobile/',{'kind':'alerts'}).data['count'],0)
        options=self.client.get(self.base+'mobile-options/');self.assertEqual([r['value'] for r in options.data['species']],['bovinos'])
        self.assertEqual(self.client.get(self.base+'mobile-animals/').data['count'],1)

    def test_cross_tenant_and_inconsistent_legacy_links_are_not_exposed(self):
        foreign=ClinicalRecord.objects.create(farm=self.foreign_farm,animal=self.foreign,record_date=self.today,clinical_notes='Private')
        self.assertEqual(self.client.get(self.base+f'{foreign.pk}/mobile/').status_code,404)
        ClinicalRecord.objects.create(farm=self.farm,animal=self.foreign,record_date=self.today,clinical_notes='Inconsistent')
        self.assertEqual(self.client.get(self.base+'mobile/').data['count'],1)
        self.assertEqual(self.client.get(self.base+'mobile/',{'farm':self.foreign_farm.pk}).data['count'],0)
        self.assertEqual(self.client.get(self.base+'mobile-animals/',{'search':'Private'}).data['count'],0)

    def test_create_uses_uuid_and_current_farm_without_stock_side_effect(self):
        from apps.finance.models import Transaction
        finance_before=Transaction.objects.count()
        result=self.client.post(self.base+'?view=mobile',self.values(),format='json')
        self.assertEqual(result.status_code,201,result.data)
        self.assertEqual(set(result.data),{'id'});record=ClinicalRecord.objects.get(pk=result.data['id'])
        self.assertEqual(record.farm,self.farm);self.assertEqual(record.animal,self.animal)
        self.assertIsNone(record.treatment_cost);self.assertFalse(MovimentacaoEstoque.objects.exists())
        self.assertEqual(Transaction.objects.count(),finance_before)

    def test_invalid_foreign_inactive_future_and_unknown_fields_are_rejected(self):
        for changes,expected in [({'animal':str(self.foreign.pk)},404),({'expected_farm':str(self.foreign_farm.pk)},400),({'record_date':str(self.today+timedelta(days=1))},400),({'record_type':'invalid'},400),({'clinical_notes':''},400),({'treatment_cost':'100'},400),({'batch':str(self.animal.pk)},400)]:
            response=self.client.post(self.base+'?view=mobile',self.values(**changes),format='json');self.assertEqual(response.status_code,expected,response.data)
        self.animal.status='sold';self.animal.save()
        self.assertEqual(self.client.post(self.base+'?view=mobile',self.values(),format='json').status_code,404)
        self.assertEqual(ClinicalRecord.objects.count(),1)

    def test_operator_ownership_readonly_and_feeder_access(self):
        self.user.role='operator';self.user.save();self.user.allowed_livestock.add(self.bovine)
        response=self.client.post(self.base+'?view=mobile',self.values(),format='json')
        self.assertEqual(response.status_code,201,response.data)
        self.assertTrue(OperatorRecordOwnership.objects.filter(user=self.user,object_id=response.data['id']).exists())
        self.assertEqual(self.client.post(self.base+'?view=mobile',self.values(animal=str(self.pig.pk)),format='json').status_code,403)
        self.user.operator_read_only=True;self.user.save()
        self.assertEqual(self.client.get(self.base+'mobile/').status_code,200)
        self.assertEqual(self.client.post(self.base+'?view=mobile',self.values(),format='json').status_code,403)
        self.user.role='feeder';self.user.operator_read_only=False;self.user.save()
        for path in ['mobile/','mobile-options/','mobile-animals/']:
            self.assertEqual(self.client.get(self.base+path).status_code,403)

    def test_ownership_failure_rolls_back_record(self):
        self.user.role='operator';self.user.save();self.user.allowed_livestock.add(self.bovine)
        with patch.object(OperatorRecordOwnership.objects,'get_or_create',side_effect=RuntimeError('synthetic ownership failure')):
            result=self.client.post(self.base+'?view=mobile',self.values(),format='json')
        self.assertEqual(result.status_code,500);self.assertEqual(ClinicalRecord.objects.count(),1)

    def test_farm_change_after_validation_blocks_save(self):
        from types import SimpleNamespace
        from rest_framework.exceptions import ValidationError
        from apps.livestock.mobile_clinic import ClinicalInput
        value=ClinicalInput(data=self.values(),context={'request':SimpleNamespace(user=self.user)})
        self.assertTrue(value.is_valid(),value.errors)
        moved=Farm.objects.create(organization=self.org,name='New farm')
        Animal.objects.filter(pk=self.animal.pk).update(farm=moved)
        with self.assertRaises(ValidationError):
            value.save()
        self.assertEqual(ClinicalRecord.objects.count(),1)

    def test_clinical_page_query_count_does_not_grow_per_record(self):
        from django.db import connection
        from django.test.utils import CaptureQueriesContext
        with CaptureQueriesContext(connection) as small:
            response=self.client.get(self.base+'mobile/')
        self.assertEqual(response.status_code,200)
        for index in range(5):
            ClinicalRecord.objects.create(farm=self.farm,animal=self.animal,record_date=self.today,clinical_notes=f'Observation {index}')
        with CaptureQueriesContext(connection) as large:
            response=self.client.get(self.base+'mobile/')
        self.assertEqual(response.data['count'],6)
        self.assertEqual(len(large),len(small))
