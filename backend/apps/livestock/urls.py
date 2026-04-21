from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import AnimalBatchViewSet

router = DefaultRouter()
router.register(r'batches', AnimalBatchViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
