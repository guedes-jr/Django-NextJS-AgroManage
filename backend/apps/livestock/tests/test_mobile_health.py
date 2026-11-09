from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.test import APITestCase

from apps.accounts.models import OperatorRecordOwnership
from apps.farms.models import Farm
from apps.finance.models import Transaction, PaymentEvent
from apps.inventory.models import MovimentacaoEstoque
from apps.organizations.models import Organization
from apps.livestock.models import Animal, Species, HealthRecord
from apps.livestock.mobile_health import HealthInput


class MobileHealthTests(APITestCase):
    base = '/api/v1/livestock/health/records/'

    def setUp(self):
        self.today = timezone.localdate()
        self.org = Organization.objects.create(name='Health', slug='mobile-health')
        self.other = Organization.objects.create(name='Other', slug='mobile-health-other')
        self.farm = Farm.objects.create(organization=self.org, name='Farm')
        self.foreign_farm = Farm.objects.create(organization=self.other, name='Private')
        self.species, _ = Species.objects.get_or_create(code='bovinos', defaults={'name': 'Bovinos'})
        self.swine, _ = Species.objects.get_or_create(code='suinos', defaults={'name': 'Suínos'})
        self.animal = Animal.objects.create(farm=self.farm, species=self.species, identifier='A-001', entry_date=self.today - timedelta(days=10))
        self.foreign = Animal.objects.create(farm=self.foreign_farm, species=self.species, identifier='A-001')
        self.user = get_user_model().objects.create_user(email='health@example.invalid', password='test', role='manager', organization=self.org)
        self.client.force_authenticate(self.user)

    def values(self, **changes):
        return dict(dict(animal=str(self.animal.pk), expected_farm=str(self.farm.pk), treatment_type='exam',
                         application_date=str(self.today), description='Recorded examination', veterinary='Professional', notes='Observation'), **changes)

    def create(self, **changes):
        return self.client.post(self.base + '?view=mobile', self.values(**changes), format='json')

    def test_options_follow_real_model_types_without_prices(self):
        response = self.client.get(self.base + 'mobile-options/')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['today'], str(self.today))
        self.assertEqual([row['value'] for row in response.data['treatment_types']], list(HealthRecord.TreatmentType.values))
        self.assertNotIn('cost', str(response.data))
        self.assertFalse(HealthRecord.objects.exists())

    def test_create_all_documentary_types_without_stock_finance_or_herd_side_effect(self):
        for treatment_type in HealthRecord.TreatmentType.values:
            result = self.create(treatment_type=treatment_type)
            self.assertEqual(result.status_code, 201, result.data)
            self.assertEqual(set(result.data), {'id'})
            record = HealthRecord.objects.get(pk=result.data['id'])
            self.assertEqual(record.farm, self.farm)
            self.assertEqual(record.animal, self.animal)
            self.assertIsNone(record.cost)
            self.assertIsNone(record.cattle_management_id)
        self.animal.refresh_from_db()
        self.assertEqual(self.animal.status, 'active')
        self.assertFalse(MovimentacaoEstoque.objects.exists())
        self.assertFalse(Transaction.objects.exists())
        self.assertFalse(PaymentEvent.objects.exists())

    def test_detail_is_available_through_cost_free_clinic_projection(self):
        record_id = self.create().data['id']
        result = self.client.get(f'/api/v1/livestock/clinical/records/{record_id}/mobile/', {'kind': 'health', 'farm': self.farm.pk})
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(result.data['notes'], 'Recorded examination')
        self.assertEqual(result.data['extra_notes'], 'Observation')
        self.assertEqual(result.data['professional'], 'Professional')
        self.assertNotIn('cost', str(result.data))

    def test_invalid_context_dates_fields_and_missing_description_are_rejected(self):
        for changes, status in [({'animal': str(self.foreign.pk)}, 404), ({'expected_farm': str(self.foreign_farm.pk)}, 400),
                                ({'application_date': str(self.today + timedelta(days=1))}, 400),
                                ({'application_date': str(self.today - timedelta(days=11))}, 400),
                                ({'treatment_type': 'invalid'}, 400), ({'description': ' '}, 400),
                                ({'cost': '100'}, 400), ({'cattle_management': str(self.animal.pk)}, 400),
                                ({'batch': str(self.animal.pk)}, 400)]:
            response = self.create(**changes)
            self.assertEqual(response.status_code, status, response.data)
        missing = self.values()
        missing.pop('treatment_type')
        self.assertEqual(self.client.post(self.base + '?view=mobile', missing, format='json').status_code, 400)
        self.assertFalse(HealthRecord.objects.exists())

    def test_inactive_and_unauthorized_species_are_rejected(self):
        self.animal.status = 'sold'
        self.animal.save()
        self.assertEqual(self.create().status_code, 404)
        self.animal.status = 'active'
        self.animal.species = self.swine
        self.animal.save()
        self.user.role = 'operator'
        self.user.save()
        self.user.allowed_livestock.add(self.species)
        self.assertEqual(self.create().status_code, 403)

    def test_operator_ownership_readonly_and_feeder_permissions(self):
        self.user.role = 'operator'
        self.user.save()
        self.user.allowed_livestock.add(self.species)
        response = self.create()
        self.assertEqual(response.status_code, 201, response.data)
        self.assertTrue(OperatorRecordOwnership.objects.filter(user=self.user, object_id=response.data['id']).exists())
        self.user.operator_read_only = True
        self.user.save()
        self.assertEqual(self.client.get(self.base + 'mobile-options/').status_code, 200)
        self.assertEqual(self.create().status_code, 403)
        self.user.role = 'feeder'
        self.user.operator_read_only = False
        self.user.save()
        self.assertEqual(self.client.get(self.base + 'mobile-options/').status_code, 403)
        self.assertEqual(self.create().status_code, 403)

    def test_changed_farm_or_entry_date_after_validation_blocks_creation(self):
        moved = Farm.objects.create(organization=self.org, name='New farm')
        for change in [{'farm': moved}, {'entry_date': self.today + timedelta(days=1)}]:
            serializer = HealthInput(data=self.values(), context={'request': SimpleNamespace(user=self.user)})
            self.assertTrue(serializer.is_valid(), serializer.errors)
            Animal.objects.filter(pk=self.animal.pk).update(**change)
            with self.assertRaises(ValidationError):
                serializer.save()
            Animal.objects.filter(pk=self.animal.pk).update(farm=self.farm, entry_date=self.today - timedelta(days=10))
        self.assertFalse(HealthRecord.objects.exists())

    def test_ownership_failure_rolls_back_document(self):
        self.user.role = 'operator'
        self.user.save()
        self.user.allowed_livestock.add(self.species)
        with patch.object(OperatorRecordOwnership.objects, 'get_or_create', side_effect=RuntimeError('synthetic ownership failure')):
            result = self.create()
        self.assertEqual(result.status_code, 500)
        self.assertFalse(HealthRecord.objects.exists())

    def test_legacy_web_create_contract_is_preserved(self):
        result = self.client.post(self.base, {'farm': str(self.farm.pk), 'animal': str(self.animal.pk), 'treatment_type': 'exam',
                                             'description': 'Web record', 'application_date': str(self.today), 'cost': '25.00'}, format='json')
        self.assertEqual(result.status_code, 201, result.data)
        self.assertIn('cost', result.data)
