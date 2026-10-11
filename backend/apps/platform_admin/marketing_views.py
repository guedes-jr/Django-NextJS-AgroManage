"""Platform-only campaign management. Audience filters are structured, never SQL."""

from common.permissions import IsPlatformAdmin
from django.db import transaction
from django.db.models import Count, IntegerField, OuterRef, Subquery
from django.db.models.functions import Coalesce
from rest_framework import serializers, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response

from apps.accounts.models import User
from apps.billing.models import Plan, Subscription
from apps.notifications.marketing import organizations, preview, publish
from apps.notifications.models import (
    MarketingAudience,
    MarketingCampaign,
    MarketingImage,
    MarketingRecipient,
    Notification,
    NotificationDelivery,
)

from .services import record_platform_action


class AudienceFiltersSerializer(serializers.Serializer):
    search = serializers.CharField(max_length=150, required=False, allow_blank=True)
    organizations = serializers.ListField(
        child=serializers.UUIDField(), required=False, max_length=1000
    )
    plans = serializers.ListField(
        child=serializers.CharField(max_length=60), required=False, max_length=30
    )
    statuses = serializers.ListField(
        child=serializers.ChoiceField(choices=Subscription.Status.choices),
        required=False,
    )
    state = serializers.CharField(max_length=2, required=False, allow_blank=True)
    roles = serializers.ListField(
        child=serializers.ChoiceField(choices=User.Role.choices), allow_empty=False
    )

    def to_internal_value(self, data):
        unknown = set(data) - set(self.fields) if isinstance(data, dict) else set()
        if unknown:
            raise serializers.ValidationError("Filtros desconhecidos.")
        result = super().to_internal_value(data)
        result["organizations"] = [str(pk) for pk in result.get("organizations", [])]
        return result


class AudienceSerializer(serializers.ModelSerializer):
    filters = AudienceFiltersSerializer()

    class Meta:
        model = MarketingAudience
        fields = ("id", "name", "filters", "updated_at")
        read_only_fields = ("id", "updated_at")


class ImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = MarketingImage
        fields = ("id", "image", "mime_type")
        read_only_fields = ("id", "mime_type")

    def validate_image(self, image):
        from PIL import Image

        if image.size > 5 * 1024 * 1024:
            raise serializers.ValidationError("Cada imagem deve ter até 5 MB.")
        try:
            with Image.open(image) as source:
                if (
                    source.format not in ("JPEG", "PNG", "WEBP")
                    or source.width * source.height > 20000000
                ):
                    raise ValueError
                source.verify()
            image.seek(0)
        except (OSError, ValueError, Image.DecompressionBombError):
            raise serializers.ValidationError(
                "Use uma imagem válida JPEG, PNG ou WebP de até 20 megapixels."
            ) from None
        return image

    def create(self, validated_data):
        from PIL import Image

        image = validated_data["image"]
        with Image.open(image) as source:
            mime = Image.MIME[source.format]
        image.seek(0)
        return MarketingImage.objects.create(**validated_data, mime_type=mime)


class CampaignSerializer(serializers.ModelSerializer):
    image_details = ImageSerializer(source="images", many=True, read_only=True)
    audience_name = serializers.CharField(source="audience.name", read_only=True)
    summary = serializers.SerializerMethodField()

    class Meta:
        model = MarketingCampaign
        fields = (
            "id",
            "title",
            "body",
            "link_url",
            "link_label",
            "images",
            "image_details",
            "audience",
            "audience_name",
            "send_in_app",
            "send_whatsapp",
            "status",
            "recipient_count",
            "queued_at",
            "updated_at",
            "summary",
        )
        read_only_fields = (
            "id",
            "status",
            "recipient_count",
            "queued_at",
            "updated_at",
        )

    def get_summary(self, obj):
        if not hasattr(obj, "prepared_total"):
            obj = campaign_queryset().get(pk=obj.pk)
        return {
            "prepared": obj.prepared_total,
            "skipped": obj.skipped_total,
            "read": obj.read_total,
            "deliveries": [
                {
                    "deliveries__status": status,
                    "total": getattr(obj, f"delivery_{status}"),
                }
                for status in NotificationDelivery.Status.values
                if getattr(obj, f"delivery_{status}")
            ],
        }

    def validate(self, attrs):
        current = self.instance
        if not attrs.get(
            "send_in_app", current.send_in_app if current else True
        ) and not attrs.get(
            "send_whatsapp", current.send_whatsapp if current else False
        ):
            raise serializers.ValidationError("Selecione ao menos um canal.")
        if len(attrs.get("images", [])) > 5:
            raise serializers.ValidationError({"images": "Use até cinco imagens."})
        if len(attrs.get("body", "")) > 10000:
            raise serializers.ValidationError({"body": "Use até 10.000 caracteres."})
        url = attrs.get("link_url", "")
        if url and not url.startswith(("https://", "http://")):
            raise serializers.ValidationError(
                {"link_url": "Use um endereço HTTP ou HTTPS."}
            )
        return attrs


class AuditedViewSet(viewsets.ModelViewSet):
    permission_classes = (IsPlatformAdmin,)
    http_method_names = ("get", "post", "patch", "head", "options")

    def perform_create(self, serializer):
        row = serializer.save(created_by=self.request.user)
        record_platform_action(
            request=self.request,
            action="marketing.created",
            object_type=type(row).__name__,
            object_id=str(row.pk),
            description="Conteúdo de propaganda criado.",
        )

    def perform_update(self, serializer):
        with transaction.atomic():
            row = (
                type(serializer.instance)
                .objects.select_for_update()
                .get(pk=serializer.instance.pk)
            )
            if isinstance(row, MarketingCampaign) and row.status != "draft":
                raise serializers.ValidationError(
                    "Somente rascunhos podem ser editados."
                )
            serializer.instance = row
            serializer.save()
            record_platform_action(
                request=self.request,
                action="marketing.updated",
                object_type=type(row).__name__,
                object_id=str(row.pk),
                description="Conteúdo de propaganda atualizado.",
            )


class MarketingAudienceViewSet(AuditedViewSet):
    queryset = MarketingAudience.objects.order_by("-updated_at")
    serializer_class = AudienceSerializer

    @action(detail=True, methods=["get"])
    def preview(self, request, pk=None):
        qs = organizations(self.get_object().filters)
        return Response(
            {
                "count": qs.count(),
                "results": list(qs.order_by("name").values("id", "name")[:50]),
            }
        )


def campaign_queryset():
    def total(queryset, field):
        query = (
            queryset.order_by()
            .values(field)
            .annotate(total=Count("pk"))
            .values("total")[:1]
        )
        return Coalesce(Subquery(query, output_field=IntegerField()), 0)

    annotations = {
        "prepared_total": total(
            MarketingRecipient.objects.filter(
                campaign_id=OuterRef("pk"), prepared_at__isnull=False
            ),
            "campaign_id",
        ),
        "skipped_total": total(
            MarketingRecipient.objects.filter(campaign_id=OuterRef("pk")).exclude(
                skip_reason=""
            ),
            "campaign_id",
        ),
        "read_total": total(
            Notification.objects.filter(campaign_id=OuterRef("pk"), is_read=True),
            "campaign_id",
        ),
    }
    for status in NotificationDelivery.Status.values:
        annotations[f"delivery_{status}"] = total(
            NotificationDelivery.objects.filter(
                notification__campaign_id=OuterRef("pk"), status=status
            ),
            "notification__campaign_id",
        )
    return (
        MarketingCampaign.objects.select_related("audience")
        .prefetch_related("images")
        .annotate(**annotations)
        .order_by("-created_at")
    )


class MarketingCampaignViewSet(AuditedViewSet):
    queryset = campaign_queryset()
    serializer_class = CampaignSerializer

    @action(detail=True, methods=["get"])
    def preview(self, request, pk=None):
        return Response(preview(self.get_object()))

    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        if request.data.get("confirm") is not True:
            raise serializers.ValidationError("Confirme o envio após revisar a prévia.")
        with transaction.atomic():
            row = publish(self.get_object().pk, request.data.get("token", ""))
            record_platform_action(
                request=request,
                action="marketing.published",
                object_type="MarketingCampaign",
                object_id=str(row.pk),
                description="Campanha confirmada.",
                extra_data={"recipients": row.recipient_count},
            )
        return Response(self.get_serializer(row).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        with transaction.atomic():
            row = MarketingCampaign.objects.select_for_update().get(
                pk=self.get_object().pk
            )
            row.status = "cancelled"
            row.save(update_fields=["status", "updated_at"])
            record_platform_action(
                request=request,
                action="marketing.cancelled",
                object_type="MarketingCampaign",
                object_id=str(row.pk),
                description="Campanha cancelada.",
            )
        return Response(self.get_serializer(row).data)


@api_view(["GET", "POST"])
@permission_classes([IsPlatformAdmin])
def marketing_images(request):
    if request.method == "GET":
        return Response(
            {
                "results": ImageSerializer(
                    MarketingImage.objects.order_by("-created_at")[:50],
                    many=True,
                    context={"request": request},
                ).data
            }
        )
    serializer = ImageSerializer(data=request.data, context={"request": request})
    serializer.is_valid(raise_exception=True)
    serializer.save(uploaded_by=request.user)
    return Response(serializer.data, status=201)


@api_view(["GET"])
@permission_classes([IsPlatformAdmin])
def marketing_options(request):
    return Response(
        {
            "roles": [
                {"value": value, "label": label} for value, label in User.Role.choices
            ],
            "plans": list(Plan.objects.values("code", "name")),
            "statuses": [
                {"value": value, "label": label}
                for value, label in Subscription.Status.choices
            ],
        }
    )
