from django.urls import path

from .views import public_plans


urlpatterns = [
    path("plans/", public_plans, name="public-plans"),
]
