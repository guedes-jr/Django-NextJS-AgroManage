from unittest.mock import patch
from urllib.error import URLError
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.urls import reverse
from rest_framework.test import APITestCase
from apps.organizations.models import Organization
from apps.tasks.models import Holiday
from apps.tasks.holidays import national_holidays, HolidayProviderUnavailable

ROWS = [{"date":"2026-01-01", "name":"Confraternização Universal"}, {"date":"2026-12-25", "name":"Natal"}]


class HolidayTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.org=Organization.objects.create(name="Calendar",slug="holiday-tests")
        self.other=Organization.objects.create(name="Other",slug="holiday-other")
        self.user=get_user_model().objects.create_user(email="holiday@example.invalid",password="test",organization=self.org,role="admin")
        self.client.force_authenticate(self.user)

    def test_manual_creation_ownership_and_duplicate_validation(self):
        payload={"name":"Municipal", "date":"2026-10-31", "organization":str(self.other.pk), "source":"national"}
        response=self.client.post(reverse("holiday-list"),payload)
        self.assertEqual(response.status_code,201,response.data)
        holiday=Holiday.objects.get(pk=response.data["id"])
        self.assertEqual((holiday.organization_id,holiday.source,holiday.created_by_id),(self.org.pk,"manual",self.user.pk))
        self.assertEqual(self.client.post(reverse("holiday-list"),payload).status_code,400)

    def test_tenant_isolation_and_year_filter(self):
        foreign=Holiday.objects.create(organization=self.other,name="Secret",date="2026-01-01")
        Holiday.objects.create(organization=self.org,name="Local",date="2027-01-01")
        self.assertEqual(self.client.get(reverse("holiday-list"),{"year":2026}).data["count"],0)
        self.assertEqual(self.client.delete(reverse("holiday-detail",args=[foreign.pk])).status_code,404)
        self.assertEqual(self.client.get(reverse("holiday-list"),{"year":"invalid"}).status_code,400)

    @patch("apps.tasks.holidays.national_holidays", return_value=ROWS)
    def test_selective_import_idempotence_and_all_dates(self,provider):
        url=reverse("holiday-import-national")
        for _ in range(2):
            response=self.client.post(url,{"year":2026,"dates":["2026-12-25"]},format="json")
            self.assertEqual(response.status_code,200,response.data)
        self.assertEqual(Holiday.objects.count(),1)
        self.assertEqual(response.data["created"],0)
        response=self.client.post(url,{"year":2026,"dates":[row["date"] for row in ROWS]},format="json")
        self.assertEqual(response.data["created"],1)
        preview=self.client.get(reverse("holiday-national"),{"year":2026})
        self.assertTrue(all(row["registered"] for row in preview.data["results"]))

    @patch("apps.tasks.holidays.national_holidays", return_value=ROWS)
    def test_import_rejects_unknown_or_wrong_year_without_partial_writes(self,provider):
        for dates in [["2026-01-01","2026-03-01"],["2027-01-01"],[]]:
            self.assertEqual(self.client.post(reverse("holiday-import-national"),{"year":2026,"dates":dates},format="json").status_code,400)
        self.assertFalse(Holiday.objects.exists())

    def test_operator_can_read_but_cannot_change_shared_holidays(self):
        self.user.role="operator";self.user.save()
        self.assertEqual(self.client.get(reverse("holiday-list")).status_code,200)
        self.assertEqual(self.client.post(reverse("holiday-list"),{"name":"No","date":"2026-01-01"}).status_code,403)
        self.assertEqual(self.client.post(reverse("holiday-import-national"),{"year":2026,"dates":["2026-01-01"]},format="json").status_code,403)

    def test_holidays_in_agenda_and_visible_with_farm_filter(self):
        Holiday.objects.create(organization=self.org,name="Local",date="2026-10-31")
        Holiday.objects.create(organization=self.other,name="Secret",date="2026-10-31")
        response=self.client.get(reverse("organization-agenda"),{"start":"2026-10-31","end":"2026-10-31","domain":"holidays","farm":"00000000-0000-0000-0000-000000000000"})
        self.assertEqual(response.status_code,200,response.data)
        self.assertEqual(response.data["count"],1)
        self.assertEqual(response.data["results"][0]["kind"],"holiday")

    @patch("apps.tasks.holidays.urlopen", side_effect=URLError("offline"))
    def test_provider_failure_is_clear_and_does_not_create_holidays(self,provider):
        response=self.client.get(reverse("holiday-national"),{"year":2026})
        self.assertEqual(response.status_code,503)
        self.assertFalse(Holiday.objects.exists())

    @patch("apps.tasks.holidays.urlopen")
    def test_provider_validates_payload_and_caches_success(self,provider):
        import json
        provider.return_value.__enter__.return_value.read.return_value=json.dumps(ROWS).encode()
        self.assertEqual(national_holidays(2026),ROWS)
        self.assertEqual(national_holidays(2026),ROWS)
        self.assertEqual(provider.call_count,1)
        with self.assertRaises(HolidayProviderUnavailable):
            national_holidays(2027)
