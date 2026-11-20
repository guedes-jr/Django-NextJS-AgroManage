from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    AnimalViewSet,
    BillingPayAllView,
    BillingView,
    ClientViewSet,
    ProcedureViewSet,
    ReportView,
    SettingsView,
    WipeView,
    WorkspaceView,
)

router = DefaultRouter()
router.register(r"clients", ClientViewSet, basename="veterinary-client")
router.register(r"animals", AnimalViewSet, basename="veterinary-animal")
router.register(r"procedures", ProcedureViewSet, basename="veterinary-procedure")

urlpatterns = [
    path("workspace/", WorkspaceView.as_view(), name="veterinary-workspace"),
    path("settings/", SettingsView.as_view(), name="veterinary-settings"),
    path("report/", ReportView.as_view(), name="veterinary-report"),
    path("billing/", BillingView.as_view(), name="veterinary-billing"),
    path("billing/pay-all/", BillingPayAllView.as_view(), name="veterinary-billing-pay-all"),
    path("wipe/", WipeView.as_view(), name="veterinary-wipe"),
    *router.urls,
]
