from decimal import Decimal

from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils.text import slugify

from apps.organizations.models import Organization
from apps.billing.models import Feature, Invoice, Payment, Plan, PlanEntitlement, Subscription
from .models import BackgroundTaskRun, DeveloperSandboxGrant, FeatureFlag, MaintenanceWindow, PlatformAuditLog, PlatformStaffProfile, SandboxExecution, SqlQueryExecution, SupportAccessGrant, SystemAnnouncement

User = get_user_model()


class PlatformStaffSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(source="user.id", read_only=True)
    email = serializers.EmailField(source="user.email", read_only=True)
    full_name = serializers.CharField(source="user.full_name", read_only=True)
    role_display = serializers.CharField(source="get_role_display", read_only=True)

    class Meta:
        model = PlatformStaffProfile
        fields = (
            "id",
            "email",
            "full_name",
            "role",
            "role_display",
            "mfa_required",
        )


class PlatformTeamMemberSerializer(PlatformStaffSerializer):
    is_active = serializers.BooleanField(read_only=True)
    last_login = serializers.DateTimeField(source="user.last_login", read_only=True)
    created_at = serializers.DateTimeField(read_only=True)

    class Meta(PlatformStaffSerializer.Meta):
        fields = PlatformStaffSerializer.Meta.fields + (
            "is_active",
            "last_login",
            "created_at",
            "updated_at",
        )


class PlatformTeamMemberWriteSerializer(serializers.Serializer):
    email = serializers.EmailField()
    full_name = serializers.CharField(max_length=255)
    role = serializers.ChoiceField(choices=PlatformStaffProfile.Role.choices)
    mfa_required = serializers.BooleanField(default=True)
    initial_password = serializers.CharField(write_only=True, min_length=8, required=False)

    def validate_email(self, value):
        email = User.objects.normalize_email(value)
        queryset = User.objects.filter(email=email)
        current_user_id = self.context.get("current_user_id")
        if current_user_id:
            queryset = queryset.exclude(pk=current_user_id)
        if queryset.exists():
            raise serializers.ValidationError("Já existe uma conta com este e-mail.")
        return email

    def validate_initial_password(self, value):
        try:
            validate_password(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages)) from exc
        return value

    def validate(self, attrs):
        if not self.context.get("is_update") and not attrs.get("initial_password"):
            raise serializers.ValidationError({"initial_password": "Informe uma senha inicial."})
        return attrs


class PlatformAuditLogSerializer(serializers.ModelSerializer):
    actor_name = serializers.CharField(source="actor.full_name", read_only=True)
    actor_email = serializers.CharField(source="actor.email", read_only=True)
    organization_name = serializers.CharField(source="organization.name", read_only=True)

    class Meta:
        model = PlatformAuditLog
        fields = (
            "id", "actor", "actor_name", "actor_email", "organization",
            "organization_name", "action", "object_type", "object_id",
            "description", "ip_address", "user_agent", "request_id",
            "extra_data", "created_at",
        )
        read_only_fields = fields


class PlatformOrganizationListSerializer(serializers.ModelSerializer):
    users_count = serializers.IntegerField(read_only=True)
    farms_count = serializers.IntegerField(read_only=True)
    subscription_plan_id = serializers.UUIDField(source="subscription.plan_id", read_only=True, allow_null=True)
    billing_cycle = serializers.CharField(source="subscription.billing_cycle", read_only=True, allow_null=True)

    class Meta:
        model = Organization
        fields = (
            "id",
            "name",
            "slug",
            "document",
            "plan",
            "is_active",
            "email",
            "phone",
            "users_count",
            "farms_count",
            "subscription_plan_id",
            "billing_cycle",
            "created_at",
            "updated_at",
        )


class PlatformOrganizationDetailSerializer(PlatformOrganizationListSerializer):
    active_users_count = serializers.IntegerField(read_only=True)
    transactions_count = serializers.IntegerField(read_only=True)
    planting_cycles_count = serializers.IntegerField(read_only=True)
    inventory_items_count = serializers.IntegerField(read_only=True)

    class Meta(PlatformOrganizationListSerializer.Meta):
        fields = PlatformOrganizationListSerializer.Meta.fields + (
            "active_users_count",
            "transactions_count",
            "planting_cycles_count",
            "inventory_items_count",
            "address",
        )


class PlatformOrganizationWriteSerializer(serializers.ModelSerializer):
    plan_id = serializers.UUIDField(write_only=True)
    billing_cycle = serializers.ChoiceField(
        choices=Subscription.BillingCycle.choices,
        default=Subscription.BillingCycle.MONTHLY,
        write_only=True,
    )

    class Meta:
        model = Organization
        fields = (
            "name", "slug", "document", "email", "phone", "address",
            "plan_id", "billing_cycle",
        )
        extra_kwargs = {
            "slug": {"required": False, "allow_blank": True},
            "document": {"required": False, "allow_blank": True},
            "email": {"required": False, "allow_blank": True},
            "phone": {"required": False, "allow_blank": True},
            "address": {"required": False, "allow_blank": True},
        }

    def validate_plan_id(self, value):
        if not Plan.objects.filter(pk=value, is_active=True).exists():
            raise serializers.ValidationError("Plano ativo não encontrado.")
        return value

    def validate_slug(self, value):
        return slugify(value) if value else value

    def validate(self, attrs):
        if not attrs.get("slug") and not self.instance:
            base = slugify(attrs.get("name", ""))[:90] or "organizacao"
            candidate = base
            suffix = 2
            while Organization.objects.filter(slug=candidate).exists():
                candidate = f"{base[:90 - len(str(suffix))]}-{suffix}"
                suffix += 1
            attrs["slug"] = candidate
        return attrs


class PlatformUserSerializer(serializers.ModelSerializer):
    organization_id = serializers.UUIDField(read_only=True)
    organization_name = serializers.CharField(source="organization.name", read_only=True)
    role_display = serializers.CharField(source="get_role_display", read_only=True)

    class Meta:
        model = User
        fields = (
            "id",
            "email",
            "full_name",
            "phone",
            "role",
            "role_display",
            "organization_id",
            "organization_name",
            "is_active",
            "force_password_change",
            "last_login",
            "created_at",
            "updated_at",
        )


class PlanEntitlementSerializer(serializers.ModelSerializer):
    feature_code = serializers.CharField(source="feature.code", read_only=True)
    feature_name = serializers.CharField(source="feature.name", read_only=True)

    class Meta:
        model = PlanEntitlement
        fields = ("id", "feature", "feature_code", "feature_name", "is_enabled", "limit_value", "config")


class PlanSerializer(serializers.ModelSerializer):
    entitlements = PlanEntitlementSerializer(many=True, read_only=True)
    subscriptions_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Plan
        fields = (
            "id", "code", "name", "description", "monthly_price", "yearly_price",
            "trial_days", "max_users", "max_farms", "max_storage_mb",
            "max_reports_per_month", "is_active", "is_public", "sort_order",
            "subscriptions_count", "entitlements", "created_at", "updated_at",
        )


class FeatureSerializer(serializers.ModelSerializer):
    class Meta:
        model = Feature
        fields = ("id", "code", "name", "description", "is_active", "created_at", "updated_at")


class SubscriptionSerializer(serializers.ModelSerializer):
    organization_name = serializers.CharField(source="organization.name", read_only=True)
    plan_name = serializers.CharField(source="plan.name", read_only=True)
    plan_code = serializers.CharField(source="plan.code", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    billing_cycle_display = serializers.CharField(source="get_billing_cycle_display", read_only=True)

    class Meta:
        model = Subscription
        fields = (
            "id", "organization", "organization_name", "plan", "plan_name", "plan_code",
            "status", "status_display", "billing_cycle", "billing_cycle_display",
            "started_at", "trial_ends_at", "current_period_ends_at", "cancel_at_period_end",
            "cancelled_at", "custom_limits", "notes", "created_at", "updated_at",
        )


class ChangeSubscriptionPlanSerializer(serializers.Serializer):
    plan_id = serializers.UUIDField()
    billing_cycle = serializers.ChoiceField(choices=Subscription.BillingCycle.choices, required=False)


class InvoiceSerializer(serializers.ModelSerializer):
    organization_name = serializers.CharField(source="organization.name", read_only=True)
    plan_name = serializers.CharField(source="subscription.plan.name", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    amount_due = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = Invoice
        fields = (
            "id", "number", "organization", "organization_name", "subscription", "plan_name",
            "status", "status_display", "currency", "subtotal", "discount_total", "total",
            "amount_paid", "amount_due", "issued_at", "due_date", "paid_at", "external_id",
            "notes", "created_at", "updated_at",
        )


class CreateInvoiceSerializer(serializers.Serializer):
    organization_id = serializers.UUIDField()
    due_date = serializers.DateField()
    description = serializers.CharField(max_length=255)
    amount = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal("0.01"))
    notes = serializers.CharField(required=False, allow_blank=True, default="")


class PaymentSerializer(serializers.ModelSerializer):
    invoice_number = serializers.CharField(source="invoice.number", read_only=True)
    organization_name = serializers.CharField(source="organization.name", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = Payment
        fields = (
            "id", "invoice", "invoice_number", "organization", "organization_name", "amount",
            "currency", "status", "status_display", "payment_method", "provider", "external_id",
            "paid_at", "failure_code", "failure_message", "created_at",
        )


class RecordPaymentSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal("0.01"))
    payment_method = serializers.CharField(max_length=40, default="manual")
    external_id = serializers.CharField(max_length=120, required=False, allow_blank=True, default="")


class SupportAccessGrantSerializer(serializers.ModelSerializer):
    operator_name = serializers.CharField(source="operator.full_name", read_only=True)
    organization_name = serializers.CharField(source="organization.name", read_only=True)
    is_valid = serializers.BooleanField(read_only=True)

    class Meta:
        model = SupportAccessGrant
        fields = ("id", "operator", "operator_name", "organization", "organization_name", "ticket_reference", "justification", "expires_at", "revoked_at", "last_used_at", "is_valid", "created_at")


class CreateSupportAccessSerializer(serializers.Serializer):
    organization_id = serializers.UUIDField()
    ticket_reference = serializers.CharField(min_length=3, max_length=100, required=False, allow_blank=True, default="")
    justification = serializers.CharField(min_length=10, max_length=1000)
    duration_minutes = serializers.IntegerField(min_value=5, max_value=60, default=30)


class BackgroundTaskRunSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    can_retry = serializers.SerializerMethodField()

    class Meta:
        model = BackgroundTaskRun
        fields = ("id", "task_id", "task_name", "status", "status_display", "started_at", "finished_at", "duration_ms", "result_summary", "error_class", "error_message", "retry_of", "triggered_by", "can_retry", "created_at")

    def get_can_retry(self, obj):
        from .operational import RETRYABLE_TASKS
        return obj.status == BackgroundTaskRun.Status.FAILURE and obj.task_name in RETRYABLE_TASKS


class FeatureFlagSerializer(serializers.ModelSerializer):
    class Meta:
        model = FeatureFlag
        fields = ("id", "key", "name", "description", "is_enabled", "rollout_percentage", "allowed_plans", "allowed_organizations", "created_at", "updated_at")

    def validate_rollout_percentage(self, value):
        if value > 100:
            raise serializers.ValidationError("O percentual não pode ultrapassar 100%.")
        return value


class SystemAnnouncementSerializer(serializers.ModelSerializer):
    level_display = serializers.CharField(source="get_level_display", read_only=True)

    class Meta:
        model = SystemAnnouncement
        fields = ("id", "title", "message", "level", "level_display", "is_active", "starts_at", "ends_at", "created_at", "updated_at")


class MaintenanceWindowSerializer(serializers.ModelSerializer):
    is_in_effect = serializers.BooleanField(read_only=True)

    class Meta:
        model = MaintenanceWindow
        fields = ("id", "title", "message", "is_active", "starts_at", "ends_at", "is_in_effect", "created_at", "updated_at")


class SqlQueryRequestSerializer(serializers.Serializer):
    query = serializers.CharField(max_length=10_000, trim_whitespace=True)


class ApprovedQueryRequestSerializer(serializers.Serializer):
    key = serializers.CharField(max_length=80)
    organization_id = serializers.UUIDField(required=False)


class SqlQueryExecutionSerializer(serializers.ModelSerializer):
    operator_name = serializers.CharField(source="operator.full_name", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = SqlQueryExecution
        fields = ("id", "operator", "operator_name", "query_text", "status", "status_display", "duration_ms", "row_count", "was_truncated", "error_message", "created_at")


class DeveloperSandboxGrantSerializer(serializers.ModelSerializer):
    requester_name = serializers.CharField(source="requester.full_name", read_only=True)
    approver_name = serializers.CharField(source="approver.full_name", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    is_valid = serializers.BooleanField(read_only=True)

    class Meta:
        model = DeveloperSandboxGrant
        fields = (
            "id", "requester", "requester_name", "approver", "approver_name", "justification",
            "requested_minutes", "status", "status_display", "approved_at", "expires_at",
            "revoked_at", "decision_reason", "is_valid", "created_at",
        )
        read_only_fields = (
            "requester", "approver", "status", "approved_at", "expires_at", "revoked_at", "decision_reason",
        )

    def validate_requested_minutes(self, value):
        if value < 5 or value > 60:
            raise serializers.ValidationError("A duração deve ficar entre 5 e 60 minutos.")
        return value


class SandboxExecuteSerializer(serializers.Serializer):
    grant_id = serializers.UUIDField()
    code = serializers.CharField(max_length=20_000, trim_whitespace=False)

    def validate_code(self, value):
        if not value.strip() or len(value.encode("utf-8")) > 20_000:
            raise serializers.ValidationError("O código está vazio ou excede 20 KB.")
        return value


class SandboxExecutionSerializer(serializers.ModelSerializer):
    operator_name = serializers.CharField(source="operator.full_name", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = SandboxExecution
        fields = (
            "id", "grant", "operator", "operator_name", "code_sha256", "status", "status_display",
            "duration_ms", "exit_code", "stdout_bytes", "stderr_bytes", "error_message", "created_at",
        )
