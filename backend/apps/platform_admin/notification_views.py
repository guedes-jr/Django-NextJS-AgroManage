from common.permissions import IsPlatformAdmin
from django.db import transaction
from django.db.models import Count
from rest_framework import serializers
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.notifications.models import (
    Notification,
    NotificationCategory,
    NotificationCategoryPolicy,
)
from apps.notifications.views import NotificationPagination

from .services import record_platform_action


class CategoryPolicySerializer(serializers.ModelSerializer):
    label = serializers.CharField(source="get_category_display", read_only=True)

    class Meta:
        model = NotificationCategoryPolicy
        fields = ("category", "label", "enabled", "in_app_enabled", "email_enabled", "push_enabled", "whatsapp_enabled", "updated_at")
        read_only_fields = ("category", "label", "updated_at")

    def validate(self, attrs):
        if attrs.get("whatsapp_enabled") and self.instance.category != NotificationCategory.ANIMAL_CYCLE:
            raise serializers.ValidationError({"whatsapp_enabled": "O WhatsApp está disponível apenas para os eventos reprodutivos já autorizados."})
        return attrs


@api_view(["GET"])
@permission_classes([IsPlatformAdmin])
def notification_categories(request):
    counts = {row["category"]: row["total"] for row in Notification.objects.values("category").annotate(total=Count("pk"))}
    policies = {row.category: row for row in NotificationCategoryPolicy.objects.all()}
    results = []
    for category, label in NotificationCategory.choices:
        policy = policies.get(category) or NotificationCategoryPolicy(category=category, enabled=category != "marketing", whatsapp_enabled=category == "animal_cycle")
        results.append({**CategoryPolicySerializer(policy).data, "count": counts.get(category, 0)})
    return Response({"results": results})


@api_view(["PATCH"])
@permission_classes([IsPlatformAdmin])
def notification_category_detail(request, category):
    if category not in NotificationCategory.values:
        return Response({"detail": "Categoria não encontrada."}, status=404)
    with transaction.atomic():
        policy, _ = NotificationCategoryPolicy.objects.get_or_create(category=category, defaults={"enabled": category != "marketing", "whatsapp_enabled": category == "animal_cycle"})
        policy = NotificationCategoryPolicy.objects.select_for_update().get(pk=policy.pk)
        serializer = CategoryPolicySerializer(policy, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        before = CategoryPolicySerializer(policy).data
        serializer.save()
        record_platform_action(request=request, action="notifications.category.updated", object_type="NotificationCategoryPolicy", object_id=category, description=f"Configuração de notificações: {policy.get_category_display()}.", extra_data={"before": before, "after": serializer.data})
    return Response(serializer.data)


@api_view(["GET"])
@permission_classes([IsPlatformAdmin])
def notification_history(request):
    queryset = Notification.objects.select_related("user__organization").prefetch_related("deliveries").order_by("-created_at", "-pk")
    if category := request.query_params.get("category"):
        if category not in NotificationCategory.values:
            return Response({"detail": "Categoria inválida."}, status=400)
        queryset = queryset.filter(category=category)
    if organization := request.query_params.get("organization"):
        try:
            from uuid import UUID
            UUID(organization)
        except ValueError:
            return Response({"detail": "Organização inválida."}, status=400)
        queryset = queryset.filter(user__organization_id=organization)
    paginator = NotificationPagination()
    rows = paginator.paginate_queryset(queryset, request)
    return paginator.get_paginated_response([{
        "id": str(row.pk), "category": row.category, "category_display": row.get_category_display(),
        "title": row.title, "priority": row.priority, "created_at": row.created_at,
        "recipient": row.user.full_name, "organization": row.user.organization.name if row.user.organization else "Sem organização",
        "show_in_app": row.show_in_app, "is_read": row.is_read, "is_archived": row.is_archived,
        "deliveries": [{"channel": delivery.channel, "status": delivery.status, "attempts": delivery.attempts} for delivery in row.deliveries.all()],
    } for row in rows])
