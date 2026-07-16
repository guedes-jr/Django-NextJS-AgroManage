from django.contrib import admin

from .models import PlatformAuditLog, PlatformStaffProfile, SupportAccessGrant


@admin.register(PlatformStaffProfile)
class PlatformStaffProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "role", "is_active", "mfa_required", "created_at")
    list_filter = ("role", "is_active", "mfa_required")
    search_fields = ("user__email", "user__full_name")


@admin.register(PlatformAuditLog)
class PlatformAuditLogAdmin(admin.ModelAdmin):
    list_display = ("action", "actor", "organization", "object_type", "created_at")
    list_filter = ("action", "object_type")
    search_fields = ("actor__email", "organization__name", "object_id", "description")
    readonly_fields = (
        "actor",
        "organization",
        "action",
        "object_type",
        "object_id",
        "description",
        "ip_address",
        "user_agent",
        "request_id",
        "extra_data",
        "created_at",
        "updated_at",
    )

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(SupportAccessGrant)
class SupportAccessGrantAdmin(admin.ModelAdmin):
    list_display = ("operator", "organization", "expires_at", "revoked_at", "created_at")
    list_filter = ("revoked_at",)
    search_fields = ("operator__email", "organization__name", "justification")
    readonly_fields = ("operator", "organization", "justification", "expires_at", "revoked_at", "last_used_at")
