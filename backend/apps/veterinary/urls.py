from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    AnimalViewSet,
    BillingPayAllView,
    AttachmentViewSet,
    BillingView,
    ClientPriceViewSet,
    ClientViewSet,
    FarmsView,
    IndicatorsView,
    InputLotsView,
    PrescriptionViewSet,
    TeamViewSet,
    HerdAnimalView,
    HerdView,
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
router.register(r"client-prices", ClientPriceViewSet, basename="veterinary-client-price")
router.register(r"team", TeamViewSet, basename="veterinary-team")
router.register(r"attachments", AttachmentViewSet, basename="veterinary-attachment")
router.register(r"prescriptions", PrescriptionViewSet, basename="veterinary-prescription")

urlpatterns = [
    path("workspace/", WorkspaceView.as_view(), name="veterinary-workspace"),
    path("settings/", SettingsView.as_view(), name="veterinary-settings"),
    path("report/", ReportView.as_view(), name="veterinary-report"),
    path("billing/", BillingView.as_view(), name="veterinary-billing"),
    path("billing/pay-all/", BillingPayAllView.as_view(), name="veterinary-billing-pay-all"),
    path("wipe/", WipeView.as_view(), name="veterinary-wipe"),
    path("input-lots/", InputLotsView.as_view(), name="veterinary-input-lots"),
    path("farms/", FarmsView.as_view(), name="veterinary-farms"),
    path("indicators/", IndicatorsView.as_view(), name="veterinary-indicators"),
    path("herd/", HerdView.as_view(), name="veterinary-herd"),
    path("herd/<uuid:animal_id>/", HerdAnimalView.as_view(), name="veterinary-herd-animal"),
    *router.urls,
]
