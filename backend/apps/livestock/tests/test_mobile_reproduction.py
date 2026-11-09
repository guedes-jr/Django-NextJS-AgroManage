from datetime import timedelta
from django.contrib.auth import get_user_model
from django.utils import timezone
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APITestCase
from apps.organizations.models import Organization
from apps.farms.models import Farm
from apps.livestock.models import Animal, Species, Mating, Pregnancy, CattleAnimalProfile
from apps.inventory.models import MovimentacaoEstoque


class MobileReproductionTests(APITestCase):
    base = '/api/v1/livestock/cattle/animals/'
    def setUp(self):
        self.today = timezone.localdate()
        self.org = Organization.objects.create(name='Reproduction', slug='mobile-reproduction')
        self.other = Organization.objects.create(name='Private', slug='reproduction-private')
        self.farm = Farm.objects.create(organization=self.org, name='Farm')
        self.foreign_farm = Farm.objects.create(organization=self.other, name='Private')
        self.species, _ = Species.objects.get_or_create(code='bovinos', defaults={'name': 'Bovinos'})
        self.cow = Animal.objects.create(farm=self.farm, species=self.species, identifier='COW', gender='F', category='Vaca', cattle_purpose='dairy', reproductive_status='gestante')
        self.heifer = Animal.objects.create(farm=self.farm, species=self.species, identifier='HEIFER', gender='F', category='Novilha', cattle_purpose='dual')
        self.beef = Animal.objects.create(farm=self.farm, species=self.species, identifier='BEEF', gender='M', category='Touro', cattle_purpose='beef')
        self.foreign = Animal.objects.create(farm=self.foreign_farm, species=self.species, identifier='PRIVATE', cattle_purpose='dairy')
        self.user = get_user_model().objects.create_user(email='reproduction@example.invalid', password='test', role='manager', organization=self.org)
        mating = Mating.objects.create(female=self.cow, mating_date=self.today-timedelta(days=60))
        self.pregnancy = Pregnancy.objects.create(female=self.cow, mating=mating, start_date=mating.mating_date, expected_birth_date=self.today+timedelta(days=220))
        self.client.force_authenticate(self.user)

    def test_summary_groups_filters_and_dates_come_from_server(self):
        response = self.client.get(self.base+'mobile-reproduction/', {'production': 'dairy', 'group': 'pregnant', 'page_size': 1})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['summary']['females'], 2)
        self.assertEqual(response.data['summary']['heifers'], 1)
        self.assertEqual(response.data['summary']['pregnant'], 1)
        self.assertEqual(response.data['results'][0]['expected_birth_date'], str(self.pregnancy.expected_birth_date))
        self.assertNotIn('cost', str(response.data))
        self.assertFalse(CattleAnimalProfile.objects.exists())
        self.assertFalse(MovimentacaoEstoque.objects.exists())

    def test_tenant_farm_production_and_inactive_records_are_scoped(self):
        for animal, production in [(self.foreign, 'dairy'), (self.beef, 'dairy')]:
            self.assertEqual(self.client.get(self.base+f'{animal.pk}/mobile-reproduction/', {'production': production}).status_code, 404)
        self.assertEqual(self.client.get(self.base+'mobile-reproduction/', {'production': 'dairy', 'farm': str(self.foreign_farm.pk)}).data['count'], 0)
        self.cow.status = 'sold'; self.cow.save()
        self.assertEqual(self.client.get(self.base+f'{self.cow.pk}/mobile-reproduction/', {'production': 'dairy'}).status_code, 404)
        self.assertEqual(self.client.get(self.base+'mobile-reproduction/', {'production': 'dairy', 'search': 'HEIFER'}).data['count'], 1)

    def test_operator_readonly_species_and_feeder_access(self):
        self.user.role = 'operator'; self.user.operator_read_only = True; self.user.save()
        self.user.allowed_livestock.add(self.species)
        self.assertEqual(self.client.get(self.base+'mobile-reproduction/', {'production': 'dairy'}).status_code, 200)
        self.user.allowed_livestock.clear()
        self.assertEqual(self.client.get(self.base+'mobile-reproduction/', {'production': 'dairy'}).status_code, 403)
        self.user.role = 'feeder'; self.user.allowed_livestock.add(self.species); self.user.save()
        self.assertEqual(self.client.get(self.base+'mobile-reproduction/', {'production': 'dairy'}).status_code, 403)

    def test_invalid_context_and_detail_projection(self):
        for params in [{}, {'production': 'other'}, {'production': 'dairy', 'farm': 'Farm'}, {'production': 'dairy', 'group': 'invalid'}]:
            self.assertEqual(self.client.get(self.base+'mobile-reproduction/', params).status_code, 400)
        response = self.client.get(self.base+f'{self.cow.pk}/mobile-reproduction/', {'production': 'dairy', 'farm': str(self.farm.pk)})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['pregnancy_start_date'], str(self.pregnancy.start_date))
        self.assertNotIn('purchase', str(response.data))
        self.assertIn('notes', response.data)

    def test_query_count_does_not_grow_per_animal(self):
        with CaptureQueriesContext(connection) as small:
            self.client.get(self.base+'mobile-reproduction/', {'production': 'dairy'})
        for index in range(5):
            Animal.objects.create(farm=self.farm, species=self.species, identifier=f'EXTRA-{index}', cattle_purpose='dairy', gender='F')
        with CaptureQueriesContext(connection) as large:
            response = self.client.get(self.base+'mobile-reproduction/', {'production': 'dairy'})
        self.assertEqual(response.data['count'], 7)
        self.assertEqual(len(large), len(small))
