from rest_framework import serializers
from .models import Notification, NotificationPreference, NotificationTemplate, NotificationType, NotificationPriority


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = [
            "id", "type", "priority", "title", "message", 
            "link", "is_read", "read_at", "created_at"
        ]
        read_only_fields = ["id", "created_at"]


class NotificationPreferenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = NotificationPreference
        fields = [
            "id", "stock_alerts", "animal_alerts", "financial_alerts",
            "report_alerts", "email_notifications", "push_notifications",
            "frequency", "updated_at"
        ]
        read_only_fields = ["id", "updated_at"]


class NotificationTemplateSerializer(serializers.ModelSerializer):
    type_display = serializers.CharField(source="get_type_display", read_only=True)
    priority_display = serializers.CharField(source="get_priority_display", read_only=True)

    class Meta:
        model = NotificationTemplate
        fields = [
            "id", "code", "type", "type_display", "priority", "priority_display",
            "title_template", "message_template", "is_active"
        ]
        read_only_fields = ["id"]


class NotificationCreateSerializer(serializers.Serializer):
    user_id = serializers.UUIDField()
    type = serializers.ChoiceField(choices=NotificationType.choices)
    priority = serializers.ChoiceField(choices=NotificationPriority.choices, required=False, default="medium")
    title = serializers.CharField(max_length=200)
    message = serializers.CharField()
    link = serializers.CharField(max_length=500, required=False, allow_blank=True)