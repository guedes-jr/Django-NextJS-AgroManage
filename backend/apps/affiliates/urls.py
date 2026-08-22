from django.urls import path

from .views import track_referral


urlpatterns = [
    path("affiliates/track/", track_referral, name="affiliate-track"),
]
