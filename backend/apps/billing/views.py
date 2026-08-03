from django.views.decorators.cache import cache_page
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .models import Plan
from .serializers import PublicPlanSerializer


@cache_page(60 * 5)
@api_view(["GET"])
@permission_classes([AllowAny])
def public_plans(request):
    """Expose only active, public commercial plans for the marketing site."""

    plans = Plan.objects.filter(is_active=True, is_public=True).order_by(
        "sort_order", "monthly_price", "name"
    )
    return Response(PublicPlanSerializer(plans, many=True).data)
