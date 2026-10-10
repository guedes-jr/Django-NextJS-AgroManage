from rest_framework import serializers
from .models import Notification, NotificationPreference, NotificationTemplate, NotificationType, NotificationPriority, PushSubscription, NotificationCategory


class NotificationSerializer(serializers.ModelSerializer):
    category_display = serializers.CharField(source="get_category_display", read_only=True)
    class Meta:
        model = Notification
        fields = [
            "id", "type", "category", "category_display", "priority", "title", "message",
            "link", "is_read", "read_at", "event_key", "occurrence_count", "last_occurred_at",
            "is_archived", "archived_at", "created_at"
        ]
        read_only_fields = ["id", "type", "category", "event_key", "occurrence_count", "last_occurred_at", "archived_at", "created_at"]


class NotificationPreferenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = NotificationPreference
        fields = [
            "id", "marketing_alerts", "stock_alerts", "animal_alerts", "financial_alerts",
            "report_alerts", "email_notifications", "push_notifications",
            "whatsapp_reproductive_alerts",
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
    category = serializers.ChoiceField(choices=NotificationCategory.choices, required=False)
    user_id = serializers.UUIDField()
    type = serializers.ChoiceField(choices=NotificationType.choices)
    priority = serializers.ChoiceField(choices=NotificationPriority.choices, required=False, default="medium")
    title = serializers.CharField(max_length=200)
    message = serializers.CharField()
    link = serializers.CharField(max_length=500, required=False, allow_blank=True)

    def validate(self, attrs):
        category = attrs.get("category")
        if category:
            expected_type = {"animal_cycle": "animal", "overdue_payment": "finance"}.get(category, category)
            if attrs["type"] != expected_type:
                raise serializers.ValidationError({"category": "A categoria não corresponde ao tipo de notificação."})
        return attrs


class PushSubscriptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = PushSubscription
        fields = ["id", "endpoint", "p256dh", "auth", "user_agent", "created_at"]
        read_only_fields = ["id", "user_agent", "created_at"]
