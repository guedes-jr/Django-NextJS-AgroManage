from django.urls import path

from .member_views import (
    AffiliateCommissionListView,
    AffiliateAccountView,
    AffiliateChangePasswordView,
    AffiliateDashboardView,
    AffiliateMeView,
    AffiliateReferralListView,
    AffiliatePortalLoginView,
)


urlpatterns = [
    path("auth/login/", AffiliatePortalLoginView.as_view(), name="affiliate-portal-login"),
    path("me/", AffiliateMeView.as_view(), name="affiliate-me"),
    path("me/profile/", AffiliateAccountView.as_view(), name="affiliate-account"),
    path(
        "me/change-password/",
        AffiliateChangePasswordView.as_view(),
        name="affiliate-change-password",
    ),
    path("me/dashboard/", AffiliateDashboardView.as_view(), name="affiliate-dashboard"),
    path("me/referrals/", AffiliateReferralListView.as_view(), name="affiliate-referrals"),
    path("me/commissions/", AffiliateCommissionListView.as_view(), name="affiliate-commissions"),
]
