from django.urls import path

from .views import public_plan_segments, public_plans, public_subscription_quote_detail, public_subscription_quotes


urlpatterns = [
    path("plans/", public_plans, name="public-plans"),
    path("plan-segments/", public_plan_segments, name="public-plan-segments"),
    path("subscription-quotes/", public_subscription_quotes, name="public-subscription-quotes"),
    path("subscription-quotes/<uuid:public_token>/", public_subscription_quote_detail, name="public-subscription-quote-detail"),
]
