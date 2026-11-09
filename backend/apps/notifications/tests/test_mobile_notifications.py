from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase
from apps.organizations.models import Organization
from apps.notifications.models import Notification, NotificationPreference

class MobileNotificationTests(APITestCase):
    def setUp(self):
        org=Organization.objects.create(name='Avisos',slug='mobile-notices')
        self.user=get_user_model().objects.create_user(email='notice@example.invalid',password='test',organization=org,role='manager')
        self.other=get_user_model().objects.create_user(email='other-notice@example.invalid',password='test',organization=org,role='manager')
        self.row=Notification.objects.create(user=self.user,title='Meu aviso',message='Mensagem')
        self.foreign=Notification.objects.create(user=self.other,title='Outro aviso',message='Não expor')
        self.client.force_authenticate(self.user)
        self.url=f'/api/v1/notifications/{self.row.pk}/'
        self.pref=NotificationPreference.objects.create(user=self.user)

    def test_read_has_timestamp_preserves_it_on_repeat_and_resets_when_unread(self):
        first=self.client.patch(self.url,{'is_read':True},format='json')
        self.assertEqual(first.status_code,200,first.data);self.assertIsNotNone(first.data['read_at'])
        repeated=self.client.patch(self.url,{'is_read':True},format='json')
        self.assertEqual(repeated.data['read_at'],first.data['read_at'])
        self.assertEqual(self.client.get('/api/v1/notifications/unread-count/').data['unread_count'],0)
        self.client.patch(self.url,{'is_read':False},format='json')
        self.row.refresh_from_db();self.assertIsNone(self.row.read_at)

    def test_own_detail_archive_and_restore_never_expose_another_user(self):
        self.assertEqual(self.client.get(f'/api/v1/notifications/{self.foreign.pk}/').status_code,404)
        self.assertEqual(self.client.patch(f'/api/v1/notifications/{self.foreign.pk}/',{'is_read':True},format='json').status_code,404)
        self.assertEqual(self.client.post(self.url+'archive/').status_code,200)
        self.assertEqual(self.client.get(self.url).status_code,404)
        self.assertEqual(self.client.get(self.url,{'archived':'true'}).status_code,200)
        self.assertEqual(self.client.post(self.url+'unarchive/').status_code,200)
        self.assertEqual(self.client.get('/api/v1/notifications/',{'status':'unread','search':'Meu','page_size':1}).data['count'],1)

    def test_preferences_partial_versioned_save_and_conflict(self):
        url='/api/v1/notifications/preferences/'
        version=self.client.get(url).data['updated_at']
        response=self.client.patch(url,{'marketing_alerts':True,'expected_updated_at':version},format='json')
        self.assertEqual(response.status_code,200,response.data);self.assertTrue(response.data['marketing_alerts'])
        stale=self.client.patch(url,{'email_notifications':False,'expected_updated_at':version},format='json')
        self.assertEqual(stale.status_code,409,stale.data)
        self.pref.refresh_from_db();self.assertTrue(self.pref.email_notifications)
        self.assertEqual(self.client.patch(url,{'frequency':'invalid'},format='json').status_code,400)
        self.assertEqual(self.client.patch(url,{'expected_updated_at':'invalid'},format='json').status_code,400)

    def test_legacy_preferences_patch_and_personal_scope_are_preserved(self):
        url='/api/v1/notifications/preferences/'
        self.assertEqual(self.client.patch(url,{'frequency':'daily'},format='json').status_code,200)
        self.client.force_authenticate(self.other)
        response=self.client.get(url);self.assertNotEqual(response.data['id'],str(self.pref.pk))
        self.client.patch(url,{'marketing_alerts':True},format='json')
        self.pref.refresh_from_db();self.assertFalse(self.pref.marketing_alerts)
