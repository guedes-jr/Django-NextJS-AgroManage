from datetime import timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.request import Request
from rest_framework.test import APITestCase, APIRequestFactory

from apps.farms.models import Farm
from apps.livestock.cattle_serializers import CattleMilkDailyTotalSerializer
from apps.livestock.models import CattleMilkDailyTotal
from apps.organizations.models import Organization


class MobileMilkPeriodTests(APITestCase):
    url = '/api/v1/livestock/cattle/milk-totals/'

    def setUp(self):
        self.day = timezone.localdate()
        self.org = Organization.objects.create(name='Leite', slug='mobile-periods')
        self.farm = Farm.objects.create(organization=self.org, name='Leiteira')
        self.user = get_user_model().objects.create_user(
            email='period@example.invalid', password='test', role='admin', organization=self.org,
        )
        self.client.force_authenticate(self.user)
        self.total = CattleMilkDailyTotal.objects.create(
            farm=self.farm, date=self.day, period_start=self.day-timedelta(days=3), liters=100,
        )

    def test_covering_date_includes_period_and_legacy_date_stays_exact(self):
        day = str(self.day-timedelta(days=1))
        response = self.client.get(self.url, {'farm': str(self.farm.pk), 'covering_date': day})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['results'][0]['period_start'], str(self.total.period_start))
        response = self.client.get(self.url, {'farm': str(self.farm.pk), 'date': day})
        self.assertEqual(response.data['results'], [])
        other = Organization.objects.create(name='Outra', slug='mobile-other')
        farm = Farm.objects.create(organization=other, name='Outra')
        CattleMilkDailyTotal.objects.create(farm=farm, date=self.day, liters=20)
        response = self.client.get(self.url, {'covering_date': str(self.day)})
        self.assertEqual(len(response.data['results']), 1)

    def test_invalid_covering_dates_are_rejected(self):
        for day in ['', 'invalid', str(self.day+timedelta(days=1))]:
            self.assertEqual(self.client.get(self.url, {'covering_date': day}).status_code, 400)

    def test_mobile_cannot_correct_or_convert_period_but_web_can_correct(self):
        url = f'{self.url}{self.total.pk}/'
        for body in [{'liters': '120.00'}, {'period_start': str(self.day), 'liters': '120.00'}]:
            self.assertEqual(self.client.patch(url+'?view=mobile', body).status_code, 400)
        self.assertEqual(self.client.patch(url, {'liters': '120.00'}).status_code, 200)
        self.total.refresh_from_db()
        self.assertEqual(self.total.period_start, self.day-timedelta(days=3))

    def test_mobile_daily_creation_and_correction_remain_supported(self):
        self.total.delete()
        body = {'farm': str(self.farm.pk), 'date': str(self.day), 'liters': '50.00'}
        self.assertEqual(self.client.post(self.url+'?view=mobile', {**body, 'period_start': str(self.day-timedelta(days=2))}).status_code, 400)
        response = self.client.post(self.url+'?view=mobile', body)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(self.client.patch(f"{self.url}{response.data['id']}/?view=mobile", {'liters': '60.00'}).status_code, 200)

    def test_fresh_locked_validation_rejects_period_changed_after_prevalidation(self):
        self.total.period_start = None
        self.total.save(update_fields=['period_start'])
        request = Request(APIRequestFactory().patch('/?view=mobile'))
        request._user = self.user
        serializer = CattleMilkDailyTotalSerializer(self.total, data={'liters': '120.00'}, partial=True, context={'request': request})
        self.assertTrue(serializer.is_valid(), serializer.errors)
        CattleMilkDailyTotal.objects.filter(pk=self.total.pk).update(period_start=self.day-timedelta(days=2))
        with self.assertRaises(ValidationError):
            serializer.save()
        self.total.refresh_from_db()
        self.assertEqual(self.total.liters, 100)

    def test_mobile_guard_preserves_existing_role_and_tenant_restrictions(self):
        other = Organization.objects.create(name='Outra', slug='period-foreign')
        farm = Farm.objects.create(organization=other, name='Outra')
        foreign = CattleMilkDailyTotal.objects.create(farm=farm, date=self.day, liters=20)
        self.assertEqual(self.client.patch(f'{self.url}{foreign.pk}/?view=mobile', {'liters': '30.00'}).status_code, 404)
        self.user.role = 'operator'
        self.user.save(update_fields=['role'])
        self.assertEqual(self.client.patch(f'{self.url}{self.total.pk}/?view=mobile', {'liters': '30.00'}).status_code, 403)
