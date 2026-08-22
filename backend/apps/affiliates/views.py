import hashlib
import hmac

from django.conf import settings
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from .models import AffiliateProfile
from .serializers import ReferralTrackingSerializer
from .services import issue_attribution_token, record_first_touch


def _request_ip_hash(request):
    ip_address = request.META.get("REMOTE_ADDR", "")
    if not ip_address:
        return ""
    return hmac.new(
        settings.SECRET_KEY.encode(),
        ip_address.encode(),
        hashlib.sha256,
    ).hexdigest()


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([ScopedRateThrottle])
def track_referral(request):
    serializer = ReferralTrackingSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    affiliate = AffiliateProfile.objects.filter(
        code=data.pop("code"),
        status=AffiliateProfile.Status.ACTIVE,
    ).first()
    if not affiliate:
        return Response(
            {"detail": "Código de afiliado inválido ou inativo."},
            status=status.HTTP_404_NOT_FOUND,
        )

    _visit, attribution, created = record_first_touch(
        affiliate=affiliate,
        ip_hash=_request_ip_hash(request),
        user_agent=request.META.get("HTTP_USER_AGENT", "")[:512],
        **data,
    )
    return Response(
        {
            "attribution_token": issue_attribution_token(attribution),
            "affiliate_code": attribution.affiliate.code,
            "is_new_attribution": created,
        },
        status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
    )


track_referral.cls.throttle_scope = "affiliate_tracking"
