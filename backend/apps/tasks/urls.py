from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import TaskViewSet, OrganizationAgendaView, HolidayViewSet

router = DefaultRouter()
router.register(r"holidays", HolidayViewSet, basename="holiday")
router.register(r"", TaskViewSet, basename="task")

urlpatterns = [
    path("agenda/", OrganizationAgendaView.as_view(), name="organization-agenda"),
    path("", include(router.urls)),
]
