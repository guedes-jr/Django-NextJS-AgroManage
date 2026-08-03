from django.urls import path

from .views import public_demo_request


urlpatterns = [
    path("demo-requests/", public_demo_request, name="public-demo-request"),
]
