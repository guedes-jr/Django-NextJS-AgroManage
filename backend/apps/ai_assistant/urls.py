from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import AIConversationViewSet, AIFeedbackViewSet, usage

router = DefaultRouter()
router.register("conversations", AIConversationViewSet, basename="ai-conversation")
router.register("feedback", AIFeedbackViewSet, basename="ai-feedback")

urlpatterns = [
    path("usage/", usage, name="ai-usage"),
    path("", include(router.urls)),
]
