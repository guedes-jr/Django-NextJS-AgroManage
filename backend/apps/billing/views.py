from django.db import models
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.throttling import ScopedRateThrottle
from rest_framework import status
from rest_framework.response import Response
from django.shortcuts import get_object_or_404

from .models import Plan, PlanSegment, PlanTier, SubscriptionQuote
from .serializers import PublicPlanSerializer, PublicPlanSegmentSerializer, PublicSubscriptionQuoteSerializer, SubscriptionQuoteInputSerializer
from .services import create_subscription_quote


@api_view(["GET"])
@permission_classes([AllowAny])
def public_plans(request):
    """Expose only active, public commercial plans for the marketing site."""

    plans = Plan.objects.filter(is_active=True, is_public=True).order_by(
        "sort_order", "monthly_price", "name"
    )
    return Response(PublicPlanSerializer(plans, many=True).data)


@api_view(["GET"])
@permission_classes([AllowAny])
def public_plan_segments(request):
    """Return active public segments with their active pricing tiers."""

    segments = PlanSegment.objects.filter(is_active=True, is_public=True).prefetch_related(
        models.Prefetch("tiers", queryset=PlanTier.objects.filter(is_active=True))
    )
    return Response(PublicPlanSegmentSerializer(segments, many=True).data)


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([ScopedRateThrottle])
def public_subscription_quotes(request):
    serializer = SubscriptionQuoteInputSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    quote = create_subscription_quote(**serializer.validated_data)
    quote = SubscriptionQuote.objects.prefetch_related("items").get(pk=quote.pk)
    return Response(PublicSubscriptionQuoteSerializer(quote).data, status=status.HTTP_201_CREATED)


public_subscription_quotes.cls.throttle_scope = "subscription_quote"


@api_view(["GET"])
@permission_classes([AllowAny])
def public_subscription_quote_detail(request, public_token):
    quote = get_object_or_404(SubscriptionQuote.objects.prefetch_related("items"), public_token=public_token)
    if quote.is_expired and quote.status == SubscriptionQuote.Status.DRAFT:
        quote.status = SubscriptionQuote.Status.EXPIRED
        quote.save(update_fields=("status", "updated_at"))
    return Response(PublicSubscriptionQuoteSerializer(quote).data)
