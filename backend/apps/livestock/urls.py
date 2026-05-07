from django.urls import path, include, re_path
from rest_framework.routers import DefaultRouter
from .views import AnimalBatchViewSet

router = DefaultRouter()
router.register(r'batches', AnimalBatchViewSet, basename='animalbatch')

urlpatterns = [
    # Manual re_path to allow optional trailing slashes for the main actions
    re_path(r'^batches/?$', AnimalBatchViewSet.as_view({'get': 'list', 'post': 'create'})),
    re_path(r'^batches/bulk_create_batches/?$', AnimalBatchViewSet.as_view({'post': 'bulk_create_batches'})),
    
    # Fallback to standard router URLs
    path('', include(router.urls)),
]
