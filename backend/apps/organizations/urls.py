from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r"addresses", views.OrganizationAddressViewSet, basename="org-address")
router.register(r"contacts", views.OrganizationContactViewSet, basename="org-contact")

urlpatterns = [
    path("", include(router.urls)),
    path("me/", views.my_organization_view, name="my-organization"),
    path("me/subscription/change-preview/", views.subscription_change_preview_view, name="subscription-change-preview"),
    path("me/subscription/change/", views.subscription_change_confirm_view, name="subscription-change-confirm"),
    path("update-project/", views.update_project_view, name="update-project"),
    path("update-logs/", views.update_logs_view, name="update-logs"),
]

