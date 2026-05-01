from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from .models import Notification, NotificationPreference, NotificationTemplate
from .serializers import (
    NotificationSerializer, 
    NotificationPreferenceSerializer,
    NotificationTemplateSerializer,
    NotificationCreateSerializer
)


class NotificationViewSet(viewsets.ModelViewSet):
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Notification.objects.filter(user=self.request.user)

    def get_unread_count(self):
        return self.get_queryset().filter(is_read=False).count()

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def unread_count_view(request):
    """Retorna a contagem de notificações não lidas"""
    count = Notification.objects.filter(user=request.user, is_read=False).count()
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
def create_notification_view(request):
    """Cria uma notificação (para uso interno)"""
    serializer = NotificationCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    
    from apps.accounts.models import User
    try:
        user = User.objects.get(id=serializer.validated_data["user_id"])
    except User.DoesNotExist:
        return Response({"detail": "Usuário não encontrado"}, status=status.HTTP_404_NOT_FOUND)
    
    notification = Notification.objects.create(
        user=user,
        type=serializer.validated_data["type"],
        priority=serializer.validated_data.get("priority", "medium"),
        title=serializer.validated_data["title"],
        message=serializer.validated_data["message"],
        link=serializer.validated_data.get("link", "")
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

    def retrieve(self, request, *args, **kwargs):
        return self.update(request, *args, **kwargs)

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