from django.db.models import F
from rest_framework.generics import ListAPIView
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .permissions import IsActiveAffiliate
from .selectors import affiliate_dashboard_summary
from .serializers import (
    AffiliateCommissionSerializer,
    AffiliateAccountSerializer,
    AffiliateChangePasswordSerializer,
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


class AffiliateAccountView(APIView):
    permission_classes = [IsActiveAffiliate]

    def get(self, request):
        return Response(AffiliateAccountSerializer(request.user).data)

    def patch(self, request):
        serializer = AffiliateAccountSerializer(
            request.user, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class AffiliateChangePasswordView(APIView):
    permission_classes = [IsActiveAffiliate]

    def post(self, request):
        serializer = AffiliateChangePasswordSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data["new_password"])
        request.user.session_version = F("session_version") + 1
        request.user.force_password_change = False
        request.user.save(
            update_fields=("password", "session_version", "force_password_change")
        )
        return Response(
            {
                "detail": "Senha alterada com sucesso. Entre novamente para continuar.",
                "relogin_required": True,
            }
        )


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
