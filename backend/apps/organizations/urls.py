from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r"addresses", views.OrganizationAddressViewSet, basename="org-address")
router.register(r"contacts", views.OrganizationContactViewSet, basename="org-contact")

urlpatterns = [
    path("", include(router.urls)),
    path("me/", views.my_organization_view, name="my-organization"),
]


