"""Administrative WhatsApp outbox inspection, editing and explicit resending."""

from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import serializers
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.notifications.models import NotificationDelivery, WhatsAppQueueMessage
from common.pagination import StandardResultsPagination
from common.permissions import IsPlatformAdmin

from .services import record_platform_action


class QueueSerializer(serializers.ModelSerializer):
    organization_name = serializers.CharField(
        source="organization.name", read_only=True, default=""
    )
    category = serializers.CharField(
        source="delivery.notification.category", read_only=True, default="manual"
    )
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = WhatsAppQueueMessage
        fields = (
            "id",
            "title",
            "recipient",
            "phone",
            "organization_name",
            "category",
            "body",
            "status",
            "status_display",
            "attempts",
            "last_error",
            "processing_until",
            "scheduled_for",
            "created_at",
            "delivered_at",
            "updated_at",
            "history",
            "is_edited",
        )


class QueueEditSerializer(serializers.Serializer):
    body = serializers.CharField(max_length=4096, allow_blank=False)


@api_view(["GET"])
@permission_classes([IsPlatformAdmin])
def queue_list(request):
    rows = WhatsAppQueueMessage.objects.select_related(
        "organization", "delivery__notification"
    )
    status = request.query_params.get("status", "")
    if status:
        if status not in NotificationDelivery.Status.values:
            return Response({"detail": "Status inválido."}, status=400)
        rows = rows.filter(status=status)
    search = request.query_params.get("search", "").strip()[:200]
    if search:
        rows = rows.filter(
            Q(recipient__icontains=search)
            | Q(phone__icontains=search)
            | Q(body__icontains=search)
            | Q(organization__name__icontains=search)
        )
    pagination = StandardResultsPagination()
    page = pagination.paginate_queryset(rows, request)
    response = pagination.get_paginated_response(QueueSerializer(page, many=True).data)
    response.data["counts"] = {
        r["status"]: r["count"]
        for r in WhatsAppQueueMessage.objects.values("status").annotate(
            count=Count("pk")
        )
    }
    from .models import BackgroundTaskRun

    last_check = (
        BackgroundTaskRun.objects.filter(
            task_name="apps.notifications.tasks.check_operational_notifications"
        )
        .values("status", "started_at", "finished_at")
        .first()
    )
    response.data["routine"] = {
        "last_check": last_check,
        "check_seconds": 120,
        "dispatch_seconds": 30,
    }
    return response


@api_view(["GET", "PATCH", "POST"])
@permission_classes([IsPlatformAdmin])
def queue_detail(request, pk):
    with transaction.atomic():
        try:
            row = (
                WhatsAppQueueMessage.objects.select_for_update()
                .select_related("organization", "delivery__notification__user")
                .get(pk=pk)
            )
        except WhatsAppQueueMessage.DoesNotExist:
            return Response(status=404)
        if request.method == "GET":
            return Response(QueueSerializer(row).data)
        # Lock linked delivery as well: queued workers cannot race edits or resends.
        delivery = (
            NotificationDelivery.objects.select_for_update().get(pk=row.delivery_id)
            if row.delivery_id
            else None
        )
        if row.processing_until or (delivery and delivery.processing_until):
            return Response(
                {
                    "detail": "Mensagem em processamento ou com tentativa interrompida. Aguarde a atualização do status."
                },
                status=409,
            )
        now = timezone.now()
        previous = row.body
        if request.method == "PATCH":
            payload = QueueEditSerializer(data=request.data)
            payload.is_valid(raise_exception=True)
            row.body = payload.validated_data["body"]
            row.is_edited = True
            row.history = [
                *row.history,
                {
                    "at": now.isoformat(),
                    "action": "edit",
                    "actor": request.user.full_name,
                    "previous_body": previous,
                    "body": row.body,
                },
            ]
            action = "whatsapp.queue_edited"
        else:
            if (
                row.status in ["sent", "unknown"]
                and request.data.get("confirm_resend") is not True
            ):
                return Response(
                    {
                        "detail": "Confirme o reenvio: a mensagem pode já ter sido recebida."
                    },
                    status=400,
                )
            if row.status == "pending":
                return Response({"detail": "A mensagem já está na fila."}, status=409)
            row.history = [
                *row.history,
                {
                    "at": now.isoformat(),
                    "action": "resend",
                    "actor": request.user.full_name,
                    "previous_status": row.status,
                    "body": row.body,
                },
            ]
            row.last_enqueued_at = None
            row.status = "pending"
            row.last_error = ""
            row.delivered_at = None
            row.scheduled_for = now
            if delivery:
                delivery.status = "pending"
                delivery.parts_sent = 0
                delivery.last_error = ""
                delivery.delivered_at = None
                delivery.save()
            action = "whatsapp.queue_resend_requested"
        row.save()
        record_platform_action(
            request=request,
            action=action,
            organization=row.organization,
            object_type="WhatsAppQueueMessage",
            object_id=row.pk,
            description="Mensagem WhatsApp editada."
            if request.method == "PATCH"
            else "Reenvio colocado na fila.",
        )
        # The periodic worker handles durable queueing; no network call in this request.
        return Response(QueueSerializer(row).data)
