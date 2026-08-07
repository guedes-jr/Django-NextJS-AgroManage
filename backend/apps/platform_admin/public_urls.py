from django.urls import path

from .views import public_demo_availability, public_demo_request, public_marketing_event


urlpatterns = [
    path("demo-requests/", public_demo_request, name="public-demo-request"),
    path("events/", public_marketing_event, name="public-marketing-event"),
    path("demo-availability/", public_demo_availability, name="public-demo-availability"),
]
