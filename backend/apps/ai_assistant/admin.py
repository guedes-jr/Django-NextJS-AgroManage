from django.contrib import admin

from .models import (
    AIConversation,
    AIFeedback,
    AIMessage,
    AIModel,
    AIModelSyncRun,
    AIProviderConfiguration,
    AIUsage,
)


@admin.register(AIProviderConfiguration)
class AIProviderConfigurationAdmin(admin.ModelAdmin):
    list_display = (
        "display_name", "provider", "is_enabled", "is_default",
        "last_health_status", "last_health_check_at",
    )
    list_filter = ("is_enabled", "is_default", "last_health_status")
    search_fields = ("display_name", "provider", "base_url")


@admin.register(AIModel)
class AIModelAdmin(admin.ModelAdmin):
    list_display = (
        "display_name", "provider", "external_id", "is_free", "is_available",
        "is_enabled", "is_primary", "priority", "last_verified_at",
    )
    list_filter = (
        "provider", "endpoint_type", "is_free", "is_available", "is_enabled", "is_primary",
    )
    search_fields = ("display_name", "external_id")
    readonly_fields = ("first_seen_at", "last_seen_at", "last_verified_at", "metadata")


@admin.register(AIModelSyncRun)
class AIModelSyncRunAdmin(admin.ModelAdmin):
    list_display = (
        "provider", "status", "trigger", "started_at", "finished_at",
        "models_found", "free_models_found",
    )
    list_filter = ("provider", "status", "trigger")
    readonly_fields = (
        "provider", "status", "trigger", "started_at", "finished_at",
        "models_found", "free_models_found", "models_created", "models_updated",
        "models_unavailable", "added_model_ids", "unavailable_model_ids",
        "error_class", "error_message", "response_summary", "created_at", "updated_at",
    )

    def has_add_permission(self, request):
        return False


@admin.register(AIConversation)
class AIConversationAdmin(admin.ModelAdmin):
    list_display = ("title", "organization", "user", "subject", "is_active", "updated_at")
    list_filter = ("subject", "is_active")
    search_fields = ("title", "user__email", "organization__name")


@admin.register(AIMessage)
class AIMessageAdmin(admin.ModelAdmin):
    list_display = ("conversation", "role", "status", "provider", "model", "fallback_count", "created_at")
    list_filter = ("role", "status", "provider", "model")
    readonly_fields = ("content", "safety_classification", "provider_attempts")


@admin.register(AIUsage)
class AIUsageAdmin(admin.ModelAdmin):
    list_display = ("organization", "user", "period_start", "questions_used", "input_tokens", "output_tokens")
    list_filter = ("period_start",)


admin.site.register(AIFeedback)
