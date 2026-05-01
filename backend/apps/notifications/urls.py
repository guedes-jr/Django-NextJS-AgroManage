from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r"", views.NotificationViewSet, basename="notifications")
router.register(r"preferences", views.NotificationPreferenceViewSet, basename="notification-preferences")
router.register(r"templates", views.NotificationTemplateViewSet, basename="notification-templates")

urlpatterns = [
    path("", include(router.urls)),
    path("unread-count/", views.unread_count_view, name="unread-count"),
    path("mark-all-read/", views.mark_all_read_view, name="mark-all-read"),
    path("create/", views.create_notification_view, name="create-notification"),
]