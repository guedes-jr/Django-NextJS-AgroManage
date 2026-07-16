from django.urls import path, include
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()

router.register(r"structure-items", views.FarmStructureItemViewSet, basename="farm-structure-items")
router.register(r"asset-implements", views.FarmAssetImplementViewSet, basename="farm-asset-implements")
router.register(r"assets", views.FarmAssetViewSet, basename="farm-assets")
router.register(r"structures", views.FarmStructureViewSet, basename="farm-structures")
router.register(r"sectors", views.SectorViewSet, basename="farm-sectors")
router.register(r"", views.FarmViewSet, basename="farms")

urlpatterns = [
    path("", include(router.urls)),
]
