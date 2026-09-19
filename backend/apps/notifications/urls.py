from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r"templates", views.NotificationTemplateViewSet, basename="notification-templates")
router.register(r"", views.NotificationViewSet, basename="notifications")

preferences_view = views.NotificationPreferenceViewSet.as_view({
    "get": "list",
    "patch": "update",
    "put": "update",
})

urlpatterns = [
    path("unread-count/", views.unread_count_view, name="unread-count"),
    path("mark-all-read/", views.mark_all_read_view, name="mark-all-read"),
    path("archive-read/", views.archive_read_view, name="archive-read"),
    path("push-subscriptions/", views.push_subscriptions_view, name="push-subscriptions"),
    path("web-push-config/", views.web_push_config_view, name="web-push-config"),
    path("stream/", views.notification_stream_view, name="notification-stream"),
    path("create/", views.create_notification_view, name="create-notification"),
    path("preferences/", preferences_view, name="notification-preferences-list"),
    path("", include(router.urls)),
]
