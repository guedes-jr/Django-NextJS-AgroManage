from decimal import Decimal

from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils.text import slugify

from apps.organizations.models import Organization
from apps.billing.models import Feature, Invoice, Payment, Plan, PlanEntitlement, Subscription
from apps.ai_assistant.models import AIModel, AIModelSyncRun, AIProviderConfiguration
from .models import BackgroundTaskRun, DemoAppointment, DemoRequest, DemoRequestActivity, DeveloperSandboxGrant, FeatureFlag, MaintenanceWindow, MarketingEvent, PlatformAuditLog, PlatformStaffProfile, SandboxExecution, SqlQueryExecution, SupportAccessGrant, SystemAnnouncement

User = get_user_model()


class AIProviderConfigurationSerializer(serializers.ModelSerializer):
    health_status_display = serializers.CharField(source="get_last_health_status_display", read_only=True)
    credential_configured = serializers.SerializerMethodField()
    api_key = serializers.CharField(write_only=True, required=False, allow_blank=True, trim_whitespace=True)
    clear_api_key = serializers.BooleanField(write_only=True, required=False, default=False)

    class Meta:
        model = AIProviderConfiguration
        fields = (
            "id", "provider", "display_name", "base_url", "is_enabled", "is_default",
            "timeout_seconds", "credential_configured", "last_health_status",
            "health_status_display", "last_health_check_at", "last_health_message",
            "created_at", "updated_at", "api_key", "clear_api_key",
        )
        read_only_fields = (
            "id", "provider", "base_url", "credential_configured", "last_health_status",
            "health_status_display", "last_health_check_at", "last_health_message",
            "created_at", "updated_at",
        )

    def get_credential_configured(self, obj):
        import os

        return bool(
            obj.get_api_key()
            or (obj.api_key_env_var and os.environ.get(obj.api_key_env_var))
        )

    def update(self, instance, validated_data):
        api_key = validated_data.pop("api_key", None)
        clear_api_key = validated_data.pop("clear_api_key", False)
        instance = super().update(instance, validated_data)
        if api_key is not None or clear_api_key:
            instance.set_api_key("" if clear_api_key else api_key)
            instance.save(update_fields=("encrypted_api_key", "updated_at"))
        return instance

    def validate(self, attrs):
        is_default = attrs.get("is_default", getattr(self.instance, "is_default", False))
        is_enabled = attrs.get("is_enabled", getattr(self.instance, "is_enabled", False))
        if is_default and not is_enabled:
            raise serializers.ValidationError("O provedor padrão deve permanecer habilitado.")
        return attrs


class AIModelAdminSerializer(serializers.ModelSerializer):
    provider_name = serializers.CharField(source="provider.display_name", read_only=True)
    provider_code = serializers.CharField(source="provider.provider", read_only=True)
    endpoint_type_display = serializers.CharField(source="get_endpoint_type_display", read_only=True)

    class Meta:
        model = AIModel
        fields = (
            "id", "provider", "provider_name", "provider_code", "external_id", "display_name",
            "endpoint_type", "endpoint_type_display", "is_free", "is_available", "is_enabled",
            "is_primary", "priority", "supports_streaming", "supports_tools", "input_price",
            "output_price", "context_window", "first_seen_at", "last_seen_at",
            "last_verified_at", "created_at", "updated_at",
        )
        read_only_fields = (
            "id", "provider", "provider_name", "provider_code", "external_id", "display_name",
            "endpoint_type", "endpoint_type_display", "is_free", "is_available",
            "supports_streaming", "supports_tools", "input_price", "output_price",
            "context_window", "first_seen_at", "last_seen_at", "last_verified_at",
            "created_at", "updated_at",
        )

    def validate(self, attrs):
        is_enabled = attrs.get("is_enabled", self.instance.is_enabled)
        is_primary = attrs.get("is_primary", self.instance.is_primary)
        if is_enabled and not self.instance.is_available:
            raise serializers.ValidationError("Um modelo indisponível não pode ser habilitado.")
        if is_primary and (not is_enabled or not self.instance.provider.is_enabled):
            raise serializers.ValidationError(
                "O modelo principal e seu provedor devem estar habilitados."
            )
        return attrs


class AIModelSyncRunSerializer(serializers.ModelSerializer):
    provider_name = serializers.CharField(source="provider.display_name", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    trigger_display = serializers.CharField(source="get_trigger_display", read_only=True)

    class Meta:
        model = AIModelSyncRun
        fields = (
            "id", "provider", "provider_name", "status", "status_display", "trigger",
            "trigger_display", "started_at", "finished_at", "models_found",
            "free_models_found", "models_created", "models_updated", "models_unavailable",
            "added_model_ids", "unavailable_model_ids", "error_class", "error_message",
            "response_summary", "created_at",
        )
        read_only_fields = fields


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


class PublicDemoRequestSerializer(serializers.ModelSerializer):
    def validate_preferred_demo_at(self, value):
        from django.utils import timezone
        if value and value <= timezone.now():
            raise serializers.ValidationError("Escolha uma data futura.")
        if value and DemoAppointment.objects.filter(starts_at=value, status=DemoAppointment.Status.SCHEDULED).exists():
            raise serializers.ValidationError("Este horário acabou de ser reservado. Escolha outro.")
        return value

    class Meta:
        model = DemoRequest
        fields = ("id", "name", "email", "phone", "organization_name", "operation_profile", "message", "selected_plan", "preferred_demo_at", "landing_path", "utm_source", "utm_medium", "utm_campaign", "ab_variant", "status", "created_at")
        read_only_fields = ("id", "status", "created_at")
        extra_kwargs = {
            "name": {"min_length": 2},
            "phone": {"min_length": 8},
            "organization_name": {"min_length": 2},
            "operation_profile": {"min_length": 2},
            "message": {"min_length": 10, "max_length": 3000},
        }


class DemoRequestSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    decided_by_name = serializers.CharField(source="decided_by.full_name", read_only=True)
    assigned_to_name = serializers.CharField(source="assigned_to.full_name", read_only=True)
    appointments = serializers.SerializerMethodField()
    activities = serializers.SerializerMethodField()

    def get_appointments(self, obj):
        return DemoAppointmentSerializer(obj.appointments.all(), many=True).data

    def get_activities(self, obj):
        return DemoRequestActivitySerializer(obj.activities.all()[:50], many=True).data

    class Meta:
        model = DemoRequest
        fields = ("id", "name", "email", "phone", "organization_name", "operation_profile", "message", "selected_plan", "preferred_demo_at", "landing_path", "utm_source", "utm_medium", "utm_campaign", "ab_variant", "status", "status_display", "assigned_to", "assigned_to_name", "next_action_at", "estimated_value", "internal_notes", "loss_reason", "converted_at", "decided_by", "decided_by_name", "decided_at", "decision_notes", "appointments", "activities", "created_at", "updated_at")
        read_only_fields = fields


class DemoAppointmentSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True)
    google_calendar_url = serializers.SerializerMethodField()
    outlook_calendar_url = serializers.SerializerMethodField()

    def _calendar_values(self, obj):
        from datetime import timedelta
        from django.utils import timezone
        start = timezone.localtime(obj.starts_at)
        end = start + timedelta(minutes=obj.duration_minutes)
        title = f"Demonstração AgroManage — {obj.demo_request.organization_name}"
        return start, end, title

    def get_google_calendar_url(self, obj):
        from datetime import timezone as datetime_timezone
        from urllib.parse import urlencode
        start, end, title = self._calendar_values(obj)
        return "https://calendar.google.com/calendar/render?" + urlencode({"action":"TEMPLATE","text":title,"dates":f"{start.astimezone(datetime_timezone.utc).strftime('%Y%m%dT%H%M%SZ')}/{end.astimezone(datetime_timezone.utc).strftime('%Y%m%dT%H%M%SZ')}","details":obj.notes,"location":obj.meeting_url})

    def get_outlook_calendar_url(self, obj):
        from urllib.parse import urlencode
        start, end, title = self._calendar_values(obj)
        return "https://outlook.office.com/calendar/0/deeplink/compose?" + urlencode({"subject":title,"startdt":start.isoformat(),"enddt":end.isoformat(),"body":obj.notes,"location":obj.meeting_url})

    class Meta:
        model = DemoAppointment
        fields = ("id", "starts_at", "duration_minutes", "timezone", "meeting_url", "status", "status_display", "notes", "google_calendar_url", "outlook_calendar_url", "created_by", "created_by_name", "created_at", "updated_at")
        read_only_fields = ("id", "created_by", "created_by_name", "created_at", "updated_at")


class DemoRequestActivitySerializer(serializers.ModelSerializer):
    actor_name = serializers.CharField(source="actor.full_name", read_only=True)

    class Meta:
        model = DemoRequestActivity
        fields = ("id", "actor", "actor_name", "action", "description", "metadata", "created_at")
        read_only_fields = fields


class DemoRequestPipelineSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=DemoRequest.Status.choices)
    assigned_to = serializers.PrimaryKeyRelatedField(queryset=User.objects.filter(platform_staff_profile__is_active=True), required=False, allow_null=True)
    next_action_at = serializers.DateTimeField(required=False, allow_null=True)
    estimated_value = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, min_value=0)
    internal_notes = serializers.CharField(required=False, allow_blank=True, max_length=5000)
    loss_reason = serializers.CharField(required=False, allow_blank=True, max_length=255)

    def validate(self, attrs):
        if attrs.get("status") == DemoRequest.Status.LOST and not attrs.get("loss_reason"):
            raise serializers.ValidationError({"loss_reason": "Informe o motivo da perda."})
        return attrs


class MarketingEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = MarketingEvent
        fields = ("event_name", "session_id", "path", "variant", "utm_source", "utm_medium", "utm_campaign", "value", "metadata")


class DemoRequestDecisionSerializer(serializers.Serializer):
    notes = serializers.CharField(required=False, allow_blank=True, max_length=2000)


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
    has_active_discount = serializers.BooleanField(read_only=True)

    class Meta:
        model = Subscription
        fields = (
            "id", "organization", "organization_name", "plan", "plan_name", "plan_code",
            "status", "status_display", "billing_cycle", "billing_cycle_display",
            "started_at", "trial_ends_at", "current_period_ends_at", "cancel_at_period_end",
            "cancelled_at", "custom_limits", "notes", "discount_type", "discount_value",
            "discount_starts_at", "discount_ends_at", "has_active_discount",
            "created_at", "updated_at",
        )


class ChangeSubscriptionPlanSerializer(serializers.Serializer):
    plan_id = serializers.UUIDField()
    billing_cycle = serializers.ChoiceField(choices=Subscription.BillingCycle.choices, required=False)


class SubscriptionDiscountSerializer(serializers.Serializer):
    discount_type = serializers.ChoiceField(
        choices=Subscription.DiscountType.choices,
        required=False,
        allow_blank=True,
    )
    discount_value = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=Decimal("0"),
        default=Decimal("0"),
    )
    discount_starts_at = serializers.DateTimeField(required=False, allow_null=True)
    discount_ends_at = serializers.DateTimeField(required=False, allow_null=True)

    def validate(self, attrs):
        discount_type = attrs.get("discount_type", "")
        value = attrs.get("discount_value", Decimal("0"))
        if value > 0 and not discount_type:
            raise serializers.ValidationError({"discount_type": "Informe o tipo do desconto."})
        if discount_type == Subscription.DiscountType.PERCENTAGE and value > 100:
            raise serializers.ValidationError({"discount_value": "O desconto percentual não pode exceder 100%."})
        starts_at = attrs.get("discount_starts_at")
        ends_at = attrs.get("discount_ends_at")
        if starts_at and ends_at and ends_at <= starts_at:
            raise serializers.ValidationError({"discount_ends_at": "O término deve ser posterior ao início."})
        return attrs


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
