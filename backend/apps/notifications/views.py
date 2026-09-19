from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.exceptions import MethodNotAllowed
from rest_framework.pagination import PageNumberPagination
from django.db.models import Q
from django.conf import settings
from django.http import StreamingHttpResponse
from django.db import close_old_connections
import json
import time
from common.permissions import IsOrganizationAdmin
from .models import Notification, NotificationPreference, NotificationTemplate, PushSubscription
from .serializers import (
    NotificationSerializer, 
    NotificationPreferenceSerializer,
    NotificationTemplateSerializer,
    NotificationCreateSerializer, PushSubscriptionSerializer
)


class NotificationPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100


class NotificationViewSet(viewsets.ModelViewSet):
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]
    pagination_class = NotificationPagination

    def get_queryset(self):
        queryset = Notification.objects.filter(user=self.request.user)
        archived = self.request.query_params.get("archived", "false").lower() == "true"
        queryset = queryset.filter(is_archived=archived)
        status_filter = self.request.query_params.get("status")
        if status_filter == "unread": queryset = queryset.filter(is_read=False)
        if status_filter == "read": queryset = queryset.filter(is_read=True)
        if notification_type := self.request.query_params.get("type"):
            queryset = queryset.filter(type=notification_type)
        if search := self.request.query_params.get("search"):
            queryset = queryset.filter(Q(title__icontains=search) | Q(message__icontains=search))
        if date_from := self.request.query_params.get("date_from"):
            queryset = queryset.filter(created_at__date__gte=date_from)
        if date_to := self.request.query_params.get("date_to"):
            queryset = queryset.filter(created_at__date__lte=date_to)
        return queryset

    def get_unread_count(self):
        return self.get_queryset().filter(is_read=False).count()

    def create(self, request, *args, **kwargs):
        raise MethodNotAllowed("POST")

    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        notification = self.get_object()
        notification.is_archived = True
        notification.archived_at = timezone.now()
        notification.save(update_fields=("is_archived", "archived_at"))
        return Response(self.get_serializer(notification).data)

    @action(detail=True, methods=["post"])
    def unarchive(self, request, pk=None):
        notification = Notification.objects.filter(user=request.user, pk=pk, is_archived=True).first()
        if not notification:
            return Response({"detail": "Notificação não encontrada."}, status=status.HTTP_404_NOT_FOUND)
        notification.is_archived = False
        notification.archived_at = None
        notification.save(update_fields=("is_archived", "archived_at"))
        return Response(self.get_serializer(notification).data)

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def unread_count_view(request):
    """Retorna a contagem de notificações não lidas"""
    from .services import NotificationService
    if getattr(request.user, 'organization', None):
        NotificationService.create_due_reproductive_vaccine_notifications(
            request.user.organization
        )
    count = Notification.objects.filter(user=request.user, is_read=False, is_archived=False).count()
    return Response({"unread_count": count})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def mark_all_read_view(request):
    """Marca todas as notificações como lidas"""
    Notification.objects.filter(user=request.user, is_read=False).update(
        is_read=True,
        read_at=timezone.now()
    )
    return Response({"detail": "Todas as notificações marcadas como lidas"})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def archive_read_view(request):
    updated = Notification.objects.filter(user=request.user, is_read=True, is_archived=False).update(is_archived=True, archived_at=timezone.now())
    return Response({"detail": "Notificações lidas arquivadas.", "updated": updated})


@api_view(["GET", "POST", "DELETE"])
@permission_classes([IsAuthenticated])
def push_subscriptions_view(request):
    if request.method == "GET":
        return Response(PushSubscriptionSerializer(PushSubscription.objects.filter(user=request.user, is_active=True), many=True).data)
    if request.method == "DELETE":
        endpoint = request.data.get("endpoint")
        PushSubscription.objects.filter(user=request.user, endpoint=endpoint).update(is_active=False)
        return Response(status=status.HTTP_204_NO_CONTENT)
    serializer = PushSubscriptionSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    subscription, _ = PushSubscription.objects.update_or_create(
        endpoint=serializer.validated_data["endpoint"],
        defaults={"user": request.user, "p256dh": serializer.validated_data["p256dh"], "auth": serializer.validated_data["auth"], "user_agent": request.headers.get("User-Agent", "")[:500], "is_active": True},
    )
    return Response(PushSubscriptionSerializer(subscription).data, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def web_push_config_view(request):
    return Response({"public_key": getattr(settings, "WEB_PUSH_VAPID_PUBLIC_KEY", "")})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def notification_stream_view(request):
    """Short-lived SSE stream; clients reconnect automatically after one minute."""
    user_id = request.user.id

    def events():
        previous = None
        for _ in range(12):
            close_old_connections()
            queryset = Notification.objects.filter(user_id=user_id, is_archived=False)
            latest = queryset.order_by("-last_occurred_at", "-created_at").values("id", "occurrence_count", "last_occurred_at", "created_at").first()
            fingerprint = (queryset.filter(is_read=False).count(), str(latest["id"]) if latest else "", latest["occurrence_count"] if latest else 0, str(latest["last_occurred_at"] or latest["created_at"]) if latest else "")
            if fingerprint != previous:
                yield f"event: notifications\ndata: {json.dumps({'unread_count': fingerprint[0]})}\n\n"
                previous = fingerprint
            else:
                yield ": keep-alive\n\n"
            time.sleep(5)

    response = StreamingHttpResponse(events(), content_type="text/event-stream")
    response["Cache-Control"] = "no-cache"
    response["X-Accel-Buffering"] = "no"
    return response


@api_view(["POST"])
@permission_classes([IsOrganizationAdmin])
def create_notification_view(request):
    """Cria uma notificação (para uso interno)"""
    serializer = NotificationCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    
    from apps.accounts.models import User
    try:
        user = User.objects.get(
            id=serializer.validated_data["user_id"],
            organization=request.user.organization,
        )
    except User.DoesNotExist:
        return Response({"detail": "Usuário não encontrado"}, status=status.HTTP_404_NOT_FOUND)
    
    from .services import NotificationService
    notification = NotificationService.create(
        user=user,
        notif_type=serializer.validated_data["type"],
        priority=serializer.validated_data.get("priority", "medium"),
        title=serializer.validated_data["title"],
        message=serializer.validated_data["message"],
        link=serializer.validated_data.get("link", "")
    )
    if notification is None:
        return Response(
            {"detail": "O usuário desativou esta categoria de notificação."},
            status=status.HTTP_200_OK,
        )
    return Response(NotificationSerializer(notification).data, status=status.HTTP_201_CREATED)


class NotificationPreferenceViewSet(viewsets.ModelViewSet):
    serializer_class = NotificationPreferenceSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return NotificationPreference.objects.filter(user=self.request.user)

    def get_object(self):
        obj, _ = NotificationPreference.objects.get_or_create(user=self.request.user)
        return obj

    def list(self, request, *args, **kwargs):
        """Return the current user's singleton preferences at /preferences/."""
        return Response(self.get_serializer(self.get_object()).data)

    def retrieve(self, request, *args, **kwargs):
        return Response(self.get_serializer(self.get_object()).data)

    def update(self, request, *args, **kwargs):
        instance, _ = NotificationPreference.objects.get_or_create(user=request.user)
        serializer = self.get_serializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class NotificationTemplateViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = NotificationTemplateSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return NotificationTemplate.objects.filter(is_active=True)
