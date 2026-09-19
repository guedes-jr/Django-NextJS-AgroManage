from django.contrib import admin

from .models import Feature, Invoice, InvoiceItem, Payment, PaymentAttempt, PaymentGatewayConfiguration, Plan, PlanEntitlement, PlanSegment, PlanTier, Subscription, SubscriptionItem, SubscriptionQuote, SubscriptionQuoteItem


class PlanEntitlementInline(admin.TabularInline):
    model = PlanEntitlement
    extra = 0


@admin.register(Plan)
class PlanAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "monthly_price", "yearly_price", "is_active", "is_public")
    list_filter = ("is_active", "is_public")
    search_fields = ("name", "code")
    inlines = (PlanEntitlementInline,)


class PlanTierInline(admin.TabularInline):
    model = PlanTier
    extra = 0
    fields = ("label", "minimum_quantity", "maximum_quantity", "monthly_price", "requires_quote", "is_active", "sort_order")


@admin.register(PlanSegment)
class PlanSegmentAdmin(admin.ModelAdmin):
    list_display = ("name", "subtitle", "code", "accent", "annual_discount_percent", "is_active", "is_public", "sort_order")
    list_filter = ("is_active", "is_public", "accent")
    search_fields = ("name", "subtitle", "code")
    prepopulated_fields = {"code": ("name", "subtitle")}
    inlines = (PlanTierInline,)


class SubscriptionQuoteItemInline(admin.TabularInline):
    model = SubscriptionQuoteItem
    extra = 0
    readonly_fields = ("tier", "segment_name", "segment_subtitle", "tier_label", "monthly_price", "discount_percent", "final_monthly_price", "requires_quote")
    can_delete = False


class SubscriptionItemInline(admin.TabularInline):
    model = SubscriptionItem
    extra = 0
    readonly_fields = ("segment_code", "segment_name", "segment_subtitle", "tier_label", "monthly_price", "discount_percent", "final_monthly_price")
    can_delete = False


@admin.register(SubscriptionQuote)
class SubscriptionQuoteAdmin(admin.ModelAdmin):
    list_display = ("public_token", "billing_cycle", "monthly_total", "billing_total", "requires_contact", "status", "expires_at")
    list_filter = ("status", "billing_cycle", "requires_contact")
    search_fields = ("public_token",)
    readonly_fields = ("public_token", "monthly_subtotal", "monthly_discount", "monthly_total", "billing_total", "requires_contact", "expires_at")
    inlines = (SubscriptionQuoteItemInline,)


@admin.register(PaymentGatewayConfiguration)
class PaymentGatewayConfigurationAdmin(admin.ModelAdmin):
    list_display = ("display_name", "provider", "environment", "is_enabled", "is_default", "last_health_status")
    list_filter = ("environment", "is_enabled", "is_default", "last_health_status")
    readonly_fields = ("encrypted_credentials", "last_health_status", "last_health_message", "last_health_check_at")


@admin.register(Feature)
class FeatureAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "is_active")
    list_filter = ("is_active",)
    search_fields = ("name", "code")


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = ("organization", "plan", "status", "billing_cycle", "current_period_ends_at")
    list_filter = ("status", "billing_cycle", "plan")
    inlines = (SubscriptionItemInline,)
    search_fields = ("organization__name", "organization__document")


class InvoiceItemInline(admin.TabularInline):
    model = InvoiceItem
    extra = 0


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display = ("number", "organization", "status", "total", "amount_paid", "due_date")
    list_filter = ("status", "currency")
    search_fields = ("number", "organization__name", "external_id")
    inlines = (InvoiceItemInline,)


class PaymentAttemptInline(admin.TabularInline):
    model = PaymentAttempt
    extra = 0
    readonly_fields = ("attempted_at",)


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ("invoice", "organization", "amount", "status", "provider", "paid_at")
    list_filter = ("status", "provider", "payment_method")
    search_fields = ("invoice__number", "organization__name", "external_id")
    inlines = (PaymentAttemptInline,)
