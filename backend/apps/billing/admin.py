from django.contrib import admin

from .models import Feature, Invoice, InvoiceItem, Payment, PaymentAttempt, Plan, PlanEntitlement, Subscription


class PlanEntitlementInline(admin.TabularInline):
    model = PlanEntitlement
    extra = 0


@admin.register(Plan)
class PlanAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "monthly_price", "yearly_price", "is_active", "is_public")
    list_filter = ("is_active", "is_public")
    search_fields = ("name", "code")
    inlines = (PlanEntitlementInline,)


@admin.register(Feature)
class FeatureAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "is_active")
    list_filter = ("is_active",)
    search_fields = ("name", "code")


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = ("organization", "plan", "status", "billing_cycle", "current_period_ends_at")
    list_filter = ("status", "billing_cycle", "plan")
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
