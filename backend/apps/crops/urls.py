from django.urls import path, include
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register(r"fields", views.FieldViewSet, basename="crops-fields")
router.register(r"plantations", views.PlantingCycleViewSet, basename="crops-plantations")
router.register(r"plantings", views.PlantingViewSet, basename="crops-plantings")
router.register(r"fertilizations", views.FertilizationViewSet, basename="crops-fertilizations")
router.register(r"fertigations", views.FertigationViewSet, basename="crops-fertigations")
router.register(r"pesticides", views.PesticideApplicationViewSet, basename="crops-pesticides")
router.register(r"irrigations", views.IrrigationViewSet, basename="crops-irrigations")
router.register(r"irrigation-pumps", views.IrrigationPumpViewSet, basename="crops-irrigation-pumps")
router.register(r"soil-analyses", views.SoilAnalysisViewSet, basename="crops-soil-analyses")
router.register(r"agronomist-recommendations", views.AgronomistRecommendationViewSet, basename="crops-agronomist-recommendations")
router.register(r"harvests", views.HarvestViewSet, basename="crops-harvests")
router.register(r"tractors", views.TractorViewSet, basename="crops-tractors")
router.register(r"land-preparations", views.LandPreparationViewSet, basename="crops-land-preparations")

urlpatterns = [
    path("dashboard/", views.CropsDashboardView.as_view(), name="crops-dashboard"),
    path("", include(router.urls)),
]
