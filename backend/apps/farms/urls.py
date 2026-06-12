from django.urls import path, include
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()

router.register(r"sectors", views.SectorViewSet, basename="farm-sectors")
router.register(r"", views.FarmViewSet, basename="farms")

urlpatterns = [
    path("", include(router.urls)),
]
