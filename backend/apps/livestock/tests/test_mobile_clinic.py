from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase
from apps.organizations.models import Organization
from apps.farms.models import Farm
from apps.livestock.models import Animal, Species, HealthRecord, VaccinationRecord
from apps.inventory.models import MovimentacaoEstoque


class MobileClinicTests(APITestCase):
    """Mobile health/vaccination reads that remain after the web clinic was removed."""

    base = '/api/v1/livestock/clinical/records/'

    def setUp(self):
        self.org = Organization.objects.create(name='Clinic', slug='mobile-clinic')
        self.other = Organization.objects.create(name='Other', slug='mobile-clinic-other')
        self.farm = Farm.objects.create(organization=self.org, name='Farm A')
        self.foreign_farm = Farm.objects.create(organization=self.other, name='Private farm')
        self.bovine, _ = Species.objects.get_or_create(code='bovinos', defaults={'name': 'Bovinos'})
        self.swine, _ = Species.objects.get_or_create(code='suinos', defaults={'name': 'Suínos'})
        self.animal = Animal.objects.create(farm=self.farm, species=self.bovine, identifier='A-001')
        self.pig = Animal.objects.create(farm=self.farm, species=self.swine, identifier='P-001')
        self.foreign = Animal.objects.create(farm=self.foreign_farm, species=self.bovine, identifier='Private')
        self.user = get_user_model().objects.create_user(email='clinic@example.invalid', password='test', role='manager', organization=self.org)
        self.today = timezone.localdate()
        self.health = HealthRecord.objects.create(farm=self.farm, animal=self.animal, application_date=self.today, description='Exam', cost='250')
        self.vaccine = VaccinationRecord.objects.create(farm=self.farm, species=self.bovine, animal=self.animal, vaccine_name='Recorded vaccine', application_date=self.today)
        self.client.force_authenticate(self.user)

    def test_health_and_vaccination_pages_are_cost_free_and_do_not_mutate(self):
        for kind, obj in [('health', self.health), ('vaccinations', self.vaccine)]:
            response = self.client.get(self.base + 'mobile/', {'kind': kind, 'page_size': 1, 'farm': self.farm.pk})
            self.assertEqual(response.status_code, 200, response.data)
            self.assertEqual(response.data['count'], 1)
            self.assertNotIn('cost', str(response.data))
            detail = self.client.get(self.base + f'{obj.pk}/mobile/', {'kind': kind})
            self.assertEqual(detail.status_code, 200, detail.data)
            self.assertNotIn('cost', str(detail.data))
        self.assertFalse(MovimentacaoEstoque.objects.exists())
        self.assertEqual(self.client.get(self.base + 'mobile/', {'kind': 'vaccinations', 'search': 'nothing'}).data['count'], 0)
        self.assertEqual(self.client.get(self.base + 'mobile/', {'start': self.today}).status_code, 400)
        self.assertEqual(self.client.get(self.base + 'mobile/', {'kind': 'health', 'batch': str(self.animal.pk)}).status_code, 400)

    def test_clinic_only_kinds_and_writes_were_removed(self):
        for kind in ('clinical', 'alerts'):
            self.assertEqual(self.client.get(self.base + 'mobile/', {'kind': kind}).status_code, 400)
        self.assertIn(self.client.post(self.base + '?view=mobile', {}, format='json').status_code, (404, 405))
        options = self.client.get(self.base + 'mobile-options/').data
        self.assertEqual((options['record_types'], options['severities'], options['outcomes']), ([], [], []))
        for path in ('diseases/', 'symptoms/', 'medications/', 'alerts/'):
            self.assertEqual(self.client.get('/api/v1/livestock/' + path).status_code, 404, path)

    def test_operator_species_scope_and_tenant_isolation(self):
        VaccinationRecord.objects.create(farm=self.farm, species=self.swine, animal=self.pig, vaccine_name='Pig vaccine', application_date=self.today)
        VaccinationRecord.objects.create(farm=self.foreign_farm, species=self.bovine, animal=self.foreign, vaccine_name='Private', application_date=self.today)
        self.user.role = 'operator'
        self.user.save()
        self.user.allowed_livestock.add(self.bovine)
        self.assertEqual(self.client.get(self.base + 'mobile/', {'kind': 'vaccinations'}).data['count'], 1)
        self.assertEqual(self.client.get(self.base + 'mobile/', {'kind': 'vaccinations', 'species': 'suinos'}).status_code, 403)
        options = self.client.get(self.base + 'mobile-options/')
        self.assertEqual([row['value'] for row in options.data['species']], ['bovinos'])
        self.assertEqual(self.client.get(self.base + 'mobile-animals/').data['count'], 1)
