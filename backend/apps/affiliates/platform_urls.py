from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .platform_views import (
    PlatformAffiliateViewSet,
    PlatformCommissionViewSet,
    PlatformReferralViewSet,
)

router = DefaultRouter()
router.register("affiliates", PlatformAffiliateViewSet, basename="platform-affiliate")
router.register("affiliate-referrals", PlatformReferralViewSet, basename="platform-affiliate-referral")
router.register("commissions", PlatformCommissionViewSet, basename="platform-affiliate-commission")

urlpatterns = [path("", include(router.urls))]
