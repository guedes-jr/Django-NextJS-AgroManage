from django.contrib import admin

from .models import AIConversation, AIFeedback, AIMessage, AIUsage


@admin.register(AIConversation)
class AIConversationAdmin(admin.ModelAdmin):
    list_display = ("title", "organization", "user", "subject", "is_active", "updated_at")
    list_filter = ("subject", "is_active")
    search_fields = ("title", "user__email", "organization__name")


@admin.register(AIMessage)
class AIMessageAdmin(admin.ModelAdmin):
    list_display = ("conversation", "role", "status", "model", "created_at")
    list_filter = ("role", "status", "model")
    readonly_fields = ("content", "safety_classification")


@admin.register(AIUsage)
class AIUsageAdmin(admin.ModelAdmin):
    list_display = ("organization", "user", "period_start", "questions_used", "input_tokens", "output_tokens")
    list_filter = ("period_start",)


admin.site.register(AIFeedback)
