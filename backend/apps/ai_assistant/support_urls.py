from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .support_views import (
    SupportArticleViewSet,
    SupportConversationViewSet,
    support_configuration,
)

router = DefaultRouter()
router.register("articles", SupportArticleViewSet, basename="support-article")
router.register(
    "conversations", SupportConversationViewSet, basename="support-conversation"
)
urlpatterns = [
    path("configuration/", support_configuration, name="support-configuration"),
    path("", include(router.urls)),
]
