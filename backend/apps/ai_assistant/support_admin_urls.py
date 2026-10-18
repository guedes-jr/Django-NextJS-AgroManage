from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .support_views import AdminSupportArticleViewSet, admin_support_configuration

from .ticket_views import TeamSupportTicketViewSet

router = DefaultRouter()
router.register("tickets", TeamSupportTicketViewSet, basename="admin-support-ticket")
router.register(
    "articles", AdminSupportArticleViewSet, basename="admin-support-article"
)
urlpatterns = [
    path(
        "configuration/",
        admin_support_configuration,
        name="admin-support-configuration",
    ),
    path("", include(router.urls)),
]
