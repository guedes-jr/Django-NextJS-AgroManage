from decimal import Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Count, DecimalField, OuterRef, Q, Subquery, Sum
from django.db.models.functions import Coalesce
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.response import Response

from apps.platform_admin.services import record_platform_action
from common.permissions import IsPlatformAdmin

from .models import (
    AffiliateProfile,
    Commission,
    CommissionAdjustment,
    ReferralAttribution,
    ReferralVisit,
)
from .platform_serializers import (
    CommissionTransitionSerializer,
    PlatformAffiliateCreateSerializer,
    PlatformAffiliateSerializer,
    PlatformAffiliateUpdateSerializer,
    PlatformCommissionSerializer,
    PlatformReferralSerializer,
)
from .services import set_affiliate_status, transition_commission_status


class PlatformAffiliateViewSet(viewsets.ModelViewSet):
    permission_classes = [IsPlatformAdmin]
    http_method_names = ("get", "post", "patch", "head", "options")
    search_fields = ("user__full_name", "user__email", "code")
    filterset_fields = ("status", "commission_type")
    ordering_fields = ("created_at", "user__full_name", "commission_value")
    ordering = ("user__full_name",)

    def get_queryset(self):
        commission_totals = Commission.objects.filter(affiliate=OuterRef("pk")).values(
            "affiliate"
        ).annotate(total=Sum("commission_amount")).values("total")
        return AffiliateProfile.objects.select_related("user").annotate(
            clicks=Count("visits", distinct=True),
            registrations=Count("attributions", filter=Q(attributions__user__isnull=False), distinct=True),
            conversions=Count(
                "attributions",
                filter=Q(attributions__status=ReferralAttribution.Status.CONVERTED),
                distinct=True,
            ),
            commissions_total=Coalesce(
                Subquery(commission_totals, output_field=DecimalField(max_digits=14, decimal_places=2)),
                Decimal("0.00"),
            ),
        )

    def get_serializer_class(self):
        if self.action == "create":
            return PlatformAffiliateCreateSerializer
        if self.action == "partial_update":
            return PlatformAffiliateUpdateSerializer
        return PlatformAffiliateSerializer

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        affiliate = serializer.save()
        record_platform_action(
            request=request,
            action="affiliate.created",
            organization=affiliate.user.organization,
            object_type="AffiliateProfile",
            object_id=affiliate.id,
            description=f"Afiliado {affiliate.user.email} ativado.",
            extra_data={
                "commission_type": affiliate.commission_type,
                "commission_value": str(affiliate.commission_value),
            },
        )
        return Response(PlatformAffiliateSerializer(affiliate).data, status=status.HTTP_201_CREATED)

    @transaction.atomic
    def partial_update(self, request, *args, **kwargs):
        affiliate = self.get_object()
        before = {
            "commission_type": affiliate.commission_type,
            "commission_value": str(affiliate.commission_value),
            "currency": affiliate.currency,
        }
        serializer = self.get_serializer(affiliate, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        affiliate = serializer.save()
        record_platform_action(
            request=request,
            action="affiliate.commission_updated",
            organization=affiliate.user.organization,
            object_type="AffiliateProfile",
            object_id=affiliate.id,
            description=f"Comissão do afiliado {affiliate.user.email} atualizada.",
            extra_data={"before": before, "after": PlatformAffiliateUpdateSerializer(affiliate).data},
        )
        return Response(PlatformAffiliateSerializer(affiliate).data)

    def _change_status(self, request, affiliate, new_status):
        previous_status = affiliate.status
        affiliate = set_affiliate_status(affiliate=affiliate, status=new_status)
        record_platform_action(
            request=request,
            action=f"affiliate.{new_status}",
            organization=affiliate.user.organization,
            object_type="AffiliateProfile",
            object_id=affiliate.id,
            description=f"Status do afiliado {affiliate.user.email} alterado para {new_status}.",
            extra_data={"previous_status": previous_status, "new_status": new_status},
        )
        return Response(PlatformAffiliateSerializer(affiliate).data)

    @action(detail=True, methods=["post"])
    def activate(self, request, pk=None):
        return self._change_status(request, self.get_object(), AffiliateProfile.Status.ACTIVE)

    @action(detail=True, methods=["post"])
    def deactivate(self, request, pk=None):
        return self._change_status(request, self.get_object(), AffiliateProfile.Status.INACTIVE)

    @action(detail=False, methods=["get"])
    def dashboard(self, request):
        commissions = Commission.objects.all()
        totals = commissions.aggregate(
            generated=Coalesce(Sum("commission_amount"), Decimal("0.00")),
            pending=Coalesce(Sum("commission_amount", filter=Q(status="pending")), Decimal("0.00")),
            approved=Coalesce(Sum("commission_amount", filter=Q(status="approved")), Decimal("0.00")),
            paid=Coalesce(Sum("commission_amount", filter=Q(status="paid")), Decimal("0.00")),
        )
        reversed_total = CommissionAdjustment.objects.aggregate(
            total=Coalesce(Sum("amount"), Decimal("0.00"))
        )["total"]
        return Response({
            "affiliates": AffiliateProfile.objects.count(),
            "active_affiliates": AffiliateProfile.objects.filter(status="active").count(),
            "clicks": ReferralVisit.objects.count(),
            "registrations": ReferralAttribution.objects.filter(user__isnull=False).count(),
            "conversions": ReferralAttribution.objects.filter(status="converted").count(),
            "commissions": totals,
            "reversed_total": reversed_total,
        })


class PlatformReferralViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsPlatformAdmin]
    serializer_class = PlatformReferralSerializer
    search_fields = ("affiliate__user__full_name", "affiliate__code", "user__email", "organization__name")
    filterset_fields = ("affiliate", "status")
    ordering_fields = ("attributed_at", "registered_at", "converted_at")
    ordering = ("-attributed_at",)

    def get_queryset(self):
        return ReferralAttribution.objects.select_related(
            "affiliate__user", "user", "organization__subscription__plan"
        ).exclude(status=ReferralAttribution.Status.INVALIDATED)


class PlatformCommissionViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsPlatformAdmin]
    serializer_class = PlatformCommissionSerializer
    search_fields = (
        "affiliate__user__full_name", "affiliate__code", "customer_user__email",
        "organization__name", "invoice__number",
    )
    filterset_fields = ("affiliate", "status", "plan")
    ordering_fields = ("conversion_at", "commission_amount", "transaction_amount")
    ordering = ("-conversion_at",)

    def get_queryset(self):
        return Commission.objects.select_related(
            "affiliate__user", "customer_user", "organization", "plan", "invoice"
        ).prefetch_related("adjustments")

    def _transition(self, request, commission, new_status):
        serializer = CommissionTransitionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        previous_status = commission.status
        try:
            commission = transition_commission_status(
                commission=commission,
                new_status=new_status,
                actor=request.user,
                reason=serializer.validated_data["reason"],
            )
        except DjangoValidationError as exc:
            raise DRFValidationError({"detail": exc.messages[0]}) from exc
        record_platform_action(
            request=request,
            action=f"affiliate_commission.{new_status}",
            organization=commission.organization,
            object_type="Commission",
            object_id=commission.id,
            description=f"Comissão alterada de {previous_status} para {new_status}.",
            extra_data={"reason": serializer.validated_data["reason"]},
        )
        return Response(PlatformCommissionSerializer(commission).data)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        return self._transition(request, self.get_object(), Commission.Status.APPROVED)

    @action(detail=True, methods=["post"], url_path="mark-paid")
    def mark_paid(self, request, pk=None):
        return self._transition(request, self.get_object(), Commission.Status.PAID)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        return self._transition(request, self.get_object(), Commission.Status.CANCELLED)
