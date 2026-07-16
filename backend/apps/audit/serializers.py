from rest_framework import serializers

from .models import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source="user.full_name", read_only=True)
    action_display = serializers.CharField(source="get_action_display", read_only=True)

    class Meta:
        model = AuditLog
        fields = (
            "id", "user", "user_name", "action", "action_display", "model_name", "object_id",
            "description", "ip_address", "user_agent", "extra_data", "created_at",
        )
        read_only_fields = fields
