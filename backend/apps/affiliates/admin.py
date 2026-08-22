from django.contrib import admin

from .models import (
    AffiliateProfile,
    Commission,
    CommissionAdjustment,
    CommissionStatusHistory,
    ReferralAttribution,
    ReferralVisit,
)


@admin.register(AffiliateProfile)
class AffiliateProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "code", "commission_type", "commission_value", "status")
    list_filter = ("status", "commission_type")
    search_fields = ("user__email", "user__full_name", "code")
    readonly_fields = ("code", "created_at", "updated_at")


@admin.register(ReferralVisit)
class ReferralVisitAdmin(admin.ModelAdmin):
    list_display = ("affiliate", "visitor_id", "landing_path", "occurred_at")
    list_filter = ("occurred_at",)
    search_fields = ("affiliate__code", "visitor_id", "utm_campaign")
    readonly_fields = tuple(field.name for field in ReferralVisit._meta.fields)


@admin.register(ReferralAttribution)
class ReferralAttributionAdmin(admin.ModelAdmin):
    list_display = ("affiliate", "visitor_id", "user", "organization", "status")
    list_filter = ("status",)
    search_fields = ("affiliate__code", "user__email", "organization__name", "visitor_id")
    readonly_fields = tuple(field.name for field in ReferralAttribution._meta.fields)


@admin.register(Commission)
class CommissionAdmin(admin.ModelAdmin):
    list_display = ("affiliate", "organization", "transaction_amount", "commission_amount", "status")
    list_filter = ("status", "commission_type_snapshot", "conversion_at")
    search_fields = ("affiliate__code", "organization__name", "invoice__number")
    readonly_fields = tuple(field.name for field in Commission._meta.fields)


@admin.register(CommissionStatusHistory)
class CommissionStatusHistoryAdmin(admin.ModelAdmin):
    list_display = ("commission", "previous_status", "new_status", "changed_by", "created_at")
    list_filter = ("new_status",)
    readonly_fields = tuple(field.name for field in CommissionStatusHistory._meta.fields)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(CommissionAdjustment)
class CommissionAdjustmentAdmin(admin.ModelAdmin):
    list_display = ("commission", "adjustment_type", "amount", "payment", "created_at")
    list_filter = ("adjustment_type",)
    search_fields = ("commission__affiliate__code", "commission__organization__name")
    readonly_fields = tuple(field.name for field in CommissionAdjustment._meta.fields)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
