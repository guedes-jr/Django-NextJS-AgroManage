"""Backoffice catalog: segment price tiers (by quantity) and promotional coupons."""
from decimal import Decimal

from django.db import transaction
from rest_framework import mixins, serializers, viewsets
from rest_framework.response import Response

from apps.billing import segments as catalog
from apps.billing.models import Coupon, DiscountKind, PlanSegment, PlanTier
from apps.billing.subscriptions import validate_discount
from common.permissions import IsPlatformAdmin, IsPlatformStaff
from .services import record_platform_action


class TierSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(required=False)

    class Meta:
        model = PlanTier
        fields = ("id", "label", "minimum_quantity", "maximum_quantity", "monthly_price", "requires_quote", "is_active", "sort_order")


class SegmentCatalogSerializer(serializers.ModelSerializer):
    tiers = TierSerializer(many=True)
    contracted_count = serializers.SerializerMethodField()

    class Meta:
        model = PlanSegment
        fields = ("id", "code", "name", "subtitle", "description", "metric_label", "annual_discount_percent", "is_active", "is_public", "sort_order", "tiers", "contracted_count")
        read_only_fields = ("id", "code", "contracted_count")

    def get_contracted_count(self, segment):
        return getattr(segment, "_contracted", 0)

    def validate_tiers(self, tiers):
        if not [tier for tier in tiers if tier.get("is_active", True)]:
            raise serializers.ValidationError("Mantenha ao menos uma faixa ativa.")
        for tier in tiers:
            low, high = tier.get("minimum_quantity"), tier.get("maximum_quantity")
            if low is not None and high is not None and low > high:
                raise serializers.ValidationError(f"Faixa {tier['label']}: quantidade mínima maior que a máxima.")
            if tier.get("monthly_price") is None and not tier.get("requires_quote"):
                raise serializers.ValidationError(f"Faixa {tier['label']}: informe o preço ou marque 'sob consulta'.")
        return tiers

    @transaction.atomic
    def update(self, instance, validated_data):
        tiers = validated_data.pop("tiers", None)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()
        if tiers is not None:
            keep = []
            for order, data in enumerate(tiers, start=1):
                tier_id = data.pop("id", None)
                data.setdefault("sort_order", order * 10)
                tier = instance.tiers.filter(pk=tier_id).first() if tier_id else None
                if tier is None:
                    tier = PlanTier.objects.create(segment=instance, **data)
                else:
                    for field, value in data.items():
                        setattr(tier, field, value)
                    tier.save()
                keep.append(tier.pk)
            # Tiers referenced by contracts are deactivated, never deleted (PROTECT keeps history).
            for tier in instance.tiers.exclude(pk__in=keep):
                if tier.subscription_items.exists() or tier.quote_items.exists():
                    tier.is_active = False
                    tier.save(update_fields=["is_active", "updated_at"])
                else:
                    tier.delete()
        return instance


class PlatformSegmentCatalogViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet):
    serializer_class = SegmentCatalogSerializer
    http_method_names = ("get", "patch", "head", "options")
    pagination_class = None

    def get_permissions(self):
        return [IsPlatformAdmin()] if self.request.method == "PATCH" else [IsPlatformStaff()]

    def get_queryset(self):
        from django.db.models import Count
        return PlanSegment.objects.filter(code__in=catalog.ALL_SEGMENTS).prefetch_related("tiers").annotate(
            _contracted=Count("tiers__subscription_items", distinct=True),
        ).order_by("sort_order", "name")

    def perform_update(self, serializer):
        segment = serializer.save()
        record_platform_action(
            request=self.request, action="billing.segment_catalog_updated", object_type="PlanSegment", object_id=segment.id,
            description=f"Catálogo do segmento {segment.name} atualizado.",
            extra_data={"tiers": [{"label": tier.label, "min": tier.minimum_quantity, "max": tier.maximum_quantity, "price": None if tier.monthly_price is None else str(tier.monthly_price), "active": tier.is_active} for tier in segment.tiers.all()]},
        )


class CouponSerializer(serializers.ModelSerializer):
    redemptions = serializers.IntegerField(source="discounts.count", read_only=True)
    kind_display = serializers.CharField(source="get_kind_display", read_only=True)

    class Meta:
        model = Coupon
        fields = (
            "id", "code", "description", "kind", "kind_display", "value", "segment_code", "duration_months", "valid_from", "valid_until",
            "max_redemptions", "first_contract_only", "cumulative", "is_active", "redemptions", "created_at",
        )
        read_only_fields = ("id", "redemptions", "created_at")

    def validate_code(self, value):
        code = value.strip().upper()
        if not code.replace("-", "").replace("_", "").isalnum():
            raise serializers.ValidationError("Use apenas letras, números, hífen ou sublinhado.")
        if Coupon.objects.filter(code=code).exclude(pk=getattr(self.instance, "pk", None)).exists():
            raise serializers.ValidationError("Já existe um cupom com este código.")
        return code

    def validate(self, attrs):
        kind = attrs.get("kind", getattr(self.instance, "kind", DiscountKind.PERCENTAGE))
        try:
            attrs["value"] = validate_discount(kind, attrs.get("value", getattr(self.instance, "value", Decimal("0"))))
        except Exception as error:  # rest_framework ValidationError with field detail
            raise serializers.ValidationError(getattr(error, "detail", str(error)))
        segment = attrs.get("segment_code", getattr(self.instance, "segment_code", ""))
        if segment and segment not in catalog.ALL_SEGMENTS:
            raise serializers.ValidationError({"segment_code": "Segmento inválido."})
        start, end = attrs.get("valid_from", getattr(self.instance, "valid_from", None)), attrs.get("valid_until", getattr(self.instance, "valid_until", None))
        if start and end and end <= start:
            raise serializers.ValidationError({"valid_until": "O fim da validade precisa ser depois do início."})
        return attrs


class PlatformCouponViewSet(viewsets.ModelViewSet):
    serializer_class = CouponSerializer
    http_method_names = ("get", "post", "patch", "head", "options")
    search_fields = ("code", "description")
    filterset_fields = ("is_active", "kind")
    ordering = ("-created_at",)

    def get_permissions(self):
        return [IsPlatformAdmin()] if self.request.method in ("POST", "PATCH") else [IsPlatformStaff()]

    def get_queryset(self):
        return Coupon.objects.prefetch_related("discounts")

    def perform_create(self, serializer):
        coupon = serializer.save()
        record_platform_action(request=self.request, action="billing.coupon_created", object_type="Coupon", object_id=coupon.id, description=f"Cupom {coupon.code} criado.")

    def perform_update(self, serializer):
        coupon = serializer.save()
        record_platform_action(request=self.request, action="billing.coupon_updated", object_type="Coupon", object_id=coupon.id, description=f"Cupom {coupon.code} atualizado.")

    def destroy(self, request, *args, **kwargs):
        return Response(status=405)
