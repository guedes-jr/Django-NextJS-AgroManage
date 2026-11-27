from django.urls import path

from .views import gateway_webhook, public_plan_segments, public_plans, public_subscription_quote_detail, public_subscription_quotes


urlpatterns = [
    path("plans/", public_plans, name="public-plans"),
    path("plan-segments/", public_plan_segments, name="public-plan-segments"),
    path("subscription-quotes/", public_subscription_quotes, name="public-subscription-quotes"),
    path("billing/webhooks/<slug:provider>/", gateway_webhook, name="billing-gateway-webhook"),
    path("subscription-quotes/<uuid:public_token>/", public_subscription_quote_detail, name="public-subscription-quote-detail"),
]
