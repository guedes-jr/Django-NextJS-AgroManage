from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .support_views import AdminSupportArticleViewSet, admin_support_configuration

router = DefaultRouter()
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
