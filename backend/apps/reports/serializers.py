"""
Reports app serializers.
"""
from rest_framework import serializers
from .models import (
    ReportConfig,
    ReportSchedule,
    GeneratedReport,
    ReportWidget,
    ReportType,
    ReportFormat,
    ReportStatus,
    FrequencyType
)


class ReportConfigSerializer(serializers.ModelSerializer):
    report_type_display = serializers.CharField(source="get_report_type_display", read_only=True)
    format_display = serializers.CharField(source="get_default_format_display", read_only=True)
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True)
    
    class Meta:
        model = ReportConfig
        fields = [
            "id", "name", "description", "report_type", "report_type_display",
            "default_filters", "default_date_range", "default_format", "format_display",
            "include_charts", "is_public", "allowed_roles",
            "created_by", "created_by_name", "created_at", "updated_at"
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class ReportConfigCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReportConfig
        fields = [
            "name", "description", "report_type",
            "default_filters", "default_date_range", "default_format",
            "include_charts", "is_public", "allowed_roles"
        ]
    
    def create(self, validated_data):
        validated_data["organization"] = self.context["request"].user.organization
        validated_data["created_by"] = self.context["request"].user
        return super().create(validated_data)


class ReportScheduleSerializer(serializers.ModelSerializer):
    frequency_display = serializers.CharField(source="get_frequency_display", read_only=True)
    report_config_name = serializers.CharField(source="report_config.name", read_only=True)
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True)
    
    class Meta:
        model = ReportSchedule
        fields = [
            "id", "name", "is_active", "report_config", "report_config_name",
            "frequency", "frequency_display", "schedule_time", "schedule_day",
            "filters", "send_email", "email_recipients",
            "last_run", "next_run", "created_by", "created_by_name",
            "created_at", "updated_at"
        ]
        read_only_fields = ["id", "last_run", "next_run", "created_at", "updated_at"]


class ReportScheduleCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReportSchedule
        fields = [
            "name", "is_active", "report_config",
            "frequency", "schedule_time", "schedule_day",
            "filters", "send_email", "email_recipients"
        ]
    
    def create(self, validated_data):
        validated_data["organization"] = self.context["request"].user.organization
        validated_data["created_by"] = self.context["request"].user
        return super().create(validated_data)


class GeneratedReportSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    format_display = serializers.CharField(source="get_format_used_display", read_only=True)
    report_config_name = serializers.CharField(source="report_config.name", read_only=True)
    generated_by_name = serializers.CharField(source="generated_by.full_name", read_only=True)
    duration_display = serializers.SerializerMethodField()
    
    class Meta:
        model = GeneratedReport
        fields = [
            "id", "name", "report_type", "status", "status_display",
            "filters", "date_range", "file", "file_size", "format_used", "format_display",
            "preview_data", "error_message", "started_at", "completed_at",
            "duration_display", "generated_by", "generated_by_name",
            "created_at"
        ]
        read_only_fields = [
            "id", "status", "file", "file_size", "preview_data",
            "error_message", "started_at", "completed_at", "created_at"
        ]
    
    def get_duration_display(self, obj):
        seconds = obj.duration_seconds
        if seconds:
            if seconds < 60:
                return f"{int(seconds)}s"
            return f"{int(seconds / 60)}min"
        return None


class GeneratedReportCreateSerializer(serializers.Serializer):
    report_config = serializers.UUIDField(required=False)
    name = serializers.CharField(max_length=200)
    report_type = serializers.ChoiceField(choices=ReportType.choices)
    filters = serializers.JSONField(required=False, default=dict)
    date_range = serializers.JSONField(required=False, default=dict)
    format = serializers.ChoiceField(choices=ReportFormat.choices, default=ReportFormat.PDF)


class ReportWidgetSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReportWidget
        fields = [
            "id", "title", "widget_type", "config",
            "position_x", "position_y", "width", "height", "is_active"
        ]
        read_only_fields = ["id"]
    
    def create(self, validated_data):
        validated_data["organization"] = self.context["request"].user.organization
        return super().create(validated_data)


class ReportListOptionsSerializer(serializers.Serializer):
    """Serializer para listar opções disponíveis de relatórios"""
    report_types = serializers.ListField(child=serializers.DictField())
    formats = serializers.ListField(child=serializers.DictField())
    frequencies = serializers.ListField(child=serializers.DictField())


class DashboardKPISerializer(serializers.Serializer):
    """Serializer para KPIs do dashboard"""
    label = serializers.CharField()
    value = serializers.CharField()
    unit = serializers.CharField(required=False)
    trend = serializers.CharField(required=False)
    trend_value = serializers.FloatField(required=False)