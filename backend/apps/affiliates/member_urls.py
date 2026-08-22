from django.urls import path

from .member_views import (
    AffiliateCommissionListView,
    AffiliateDashboardView,
    AffiliateMeView,
    AffiliateReferralListView,
)


urlpatterns = [
    path("me/", AffiliateMeView.as_view(), name="affiliate-me"),
    path("me/dashboard/", AffiliateDashboardView.as_view(), name="affiliate-dashboard"),
    path("me/referrals/", AffiliateReferralListView.as_view(), name="affiliate-referrals"),
    path("me/commissions/", AffiliateCommissionListView.as_view(), name="affiliate-commissions"),
]
