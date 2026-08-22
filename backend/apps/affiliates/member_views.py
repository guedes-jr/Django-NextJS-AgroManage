from rest_framework.generics import ListAPIView
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .permissions import IsActiveAffiliate
from .selectors import affiliate_dashboard_summary
from .serializers import (
    AffiliateCommissionSerializer,
    AffiliateProfileSerializer,
    AffiliateReferralSerializer,
    AffiliatePortalLoginSerializer,
    issue_affiliate_portal_tokens,
)


class AffiliatePortalLoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = AffiliatePortalLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        affiliate = serializer.validated_data["affiliate"]
        refresh = issue_affiliate_portal_tokens(user)
        return Response({
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "affiliate": AffiliateProfileSerializer(affiliate).data,
            "user": {"id": str(user.id), "full_name": user.full_name, "email": user.email},
        })


class AffiliateMeView(APIView):
    permission_classes = [IsActiveAffiliate]

    def get(self, request):
        return Response(AffiliateProfileSerializer(request.user.affiliate_profile).data)


class AffiliateDashboardView(APIView):
    permission_classes = [IsActiveAffiliate]

    def get(self, request):
        return Response(affiliate_dashboard_summary(request.user.affiliate_profile))


class AffiliateReferralListView(ListAPIView):
    permission_classes = [IsActiveAffiliate]
    serializer_class = AffiliateReferralSerializer
    filterset_fields = ("status",)
    ordering_fields = ("attributed_at", "registered_at", "converted_at")
    ordering = ("-attributed_at",)

    def get_queryset(self):
        return self.request.user.affiliate_profile.attributions.select_related(
            "user",
            "organization__subscription__plan",
        ).exclude(status="invalidated")


class AffiliateCommissionListView(ListAPIView):
    permission_classes = [IsActiveAffiliate]
    serializer_class = AffiliateCommissionSerializer
    filterset_fields = ("status", "plan")
    ordering_fields = ("conversion_at", "commission_amount", "transaction_amount")
    ordering = ("-conversion_at",)

    def get_queryset(self):
        return self.request.user.affiliate_profile.commissions.select_related(
            "attribution__user",
            "organization",
            "plan",
            "invoice",
        ).prefetch_related("adjustments")
