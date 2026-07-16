from datetime import timedelta
from decimal import Decimal
import hashlib
import time

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db import connection
from django.conf import settings
from django.db.migrations.executor import MigrationExecutor
from django.db import DatabaseError
from django.db.models import Count, F, Q
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import AccessToken
from celery import current_app

from apps.organizations.models import Organization
from apps.billing.models import Feature, Invoice, Payment, Plan, Subscription
from apps.billing.services import create_manual_invoice, record_manual_payment
from common.permissions import IsPlatformAdmin, IsPlatformDeveloper, IsPlatformStaff, IsPlatformSupport

from .serializers import (
    PlatformOrganizationDetailSerializer,
    PlatformOrganizationListSerializer,
    PlatformStaffSerializer,
    PlatformUserSerializer,
    ChangeSubscriptionPlanSerializer,
    FeatureSerializer,
    PlanSerializer,
    SubscriptionSerializer,
    CreateInvoiceSerializer,
    InvoiceSerializer,
    PaymentSerializer,
    RecordPaymentSerializer,
    CreateSupportAccessSerializer,
    SupportAccessGrantSerializer,
    BackgroundTaskRunSerializer,
    FeatureFlagSerializer,
    MaintenanceWindowSerializer,
    SystemAnnouncementSerializer,
    SqlQueryExecutionSerializer,
    SqlQueryRequestSerializer,
    ApprovedQueryRequestSerializer,
    DeveloperSandboxGrantSerializer,
    SandboxExecuteSerializer,
    SandboxExecutionSerializer,
)
from .services import record_platform_action
from .models import BackgroundTaskRun, DeveloperSandboxGrant, FeatureFlag, MaintenanceWindow, PlatformStaffProfile, SandboxExecution, SqlQueryExecution, SupportAccessGrant, SystemAnnouncement
from .operational import RETRYABLE_TASKS
from .sql_console import UnsafeQuery, execute_readonly_query, explain_readonly_query, redact_query_for_history
from .approved_queries import available_queries, run_approved_query
from .sandbox_client import SandboxClient, SandboxUnavailable

User = get_user_model()


@api_view(["GET"])
@permission_classes([IsPlatformStaff])
def platform_me(request):
    """Return the authenticated operator's platform identity."""

    return Response(PlatformStaffSerializer(request.user.platform_staff_profile).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def client_state(request):
    now = timezone.now()
    organization = getattr(request.user, "organization", None)
    announcements = SystemAnnouncement.objects.filter(
        is_active=True, starts_at__lte=now
    ).filter(Q(ends_at__isnull=True) | Q(ends_at__gt=now))
    flags = {}
    if organization:
        for flag in FeatureFlag.objects.filter(is_enabled=True).prefetch_related("allowed_organizations"):
            plan_allowed = not flag.allowed_plans or organization.plan in flag.allowed_plans
            org_allowed = not flag.allowed_organizations.exists() or flag.allowed_organizations.filter(pk=organization.pk).exists()
            bucket = int(str(organization.id).replace("-", "")[:8], 16) % 100
            flags[flag.key] = plan_allowed and org_allowed and bucket < flag.rollout_percentage
    return Response({
        "announcements": SystemAnnouncementSerializer(announcements, many=True).data,
        "feature_flags": flags,
    })


@api_view(["GET"])
@permission_classes([IsPlatformStaff])
def dashboard_summary(request):
    """Return the first global KPIs for the platform backoffice."""

    thirty_days_ago = timezone.now() - timedelta(days=30)
    organizations = Organization.objects.all()
    users = User.objects.filter(organization__isnull=False)
    users_without_organization = User.objects.filter(
        organization__isnull=True,
        platform_staff_profile__isnull=True,
    )
    plans = list(
        organizations.values("plan")
        .annotate(total=Count("id"))
        .order_by("plan")
    )

    return Response(
        {
            "organizations": {
                "total": organizations.count(),
                "active": organizations.filter(is_active=True).count(),
                "suspended": organizations.filter(is_active=False).count(),
                "created_last_30_days": organizations.filter(
                    created_at__gte=thirty_days_ago
                ).count(),
                "by_plan": plans,
            },
            "users": {
                "total": users.count(),
                "active": users.filter(is_active=True).count(),
                "created_last_30_days": users.filter(
                    created_at__gte=thirty_days_ago
                ).count(),
                "without_organization": users_without_organization.count(),
            },
            "platform_team": {
                "total": PlatformStaffProfile.objects.count(),
                "active": PlatformStaffProfile.objects.filter(is_active=True).count(),
            },
        }
    )


@api_view(["GET"])
@permission_classes([IsPlatformStaff])
def finance_dashboard(request):
    today = timezone.localdate()
    month_start = today.replace(day=1)
    active_subscriptions = Subscription.objects.filter(status=Subscription.Status.ACTIVE).select_related("plan")
    mrr = Decimal("0")
    for subscription in active_subscriptions:
        if subscription.billing_cycle == Subscription.BillingCycle.YEARLY:
            mrr += subscription.plan.yearly_price / Decimal("12")
        else:
            mrr += subscription.plan.monthly_price

    payments = Payment.objects.filter(status=Payment.Status.SUCCEEDED)
    received_month = sum(
        payments.filter(paid_at__date__gte=month_start, paid_at__date__lte=today)
        .values_list("amount", flat=True),
        Decimal("0"),
    )
    open_invoices = Invoice.objects.filter(status__in=[Invoice.Status.OPEN, Invoice.Status.OVERDUE])
    outstanding = sum((invoice.amount_due for invoice in open_invoices), Decimal("0"))
    overdue = open_invoices.filter(due_date__lt=today)

    return Response({
        "mrr": mrr,
        "arr": mrr * 12,
        "received_month": received_month,
        "outstanding": outstanding,
        "active_subscriptions": active_subscriptions.count(),
        "open_invoices": open_invoices.count(),
        "overdue_invoices": overdue.count(),
        "failed_payments": Payment.objects.filter(status=Payment.Status.FAILED).count(),
    })


@api_view(["GET"])
@permission_classes([IsPlatformDeveloper])
def operations_health(request):
    import redis

    checks = {}
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        checks["database"] = {"status": "healthy", "engine": connection.vendor}
    except Exception:
        checks["database"] = {"status": "unavailable"}

    try:
        client = redis.Redis.from_url(settings.CELERY_BROKER_URL, socket_connect_timeout=1, socket_timeout=1)
        client.ping()
        checks["redis"] = {"status": "healthy"}
    except Exception:
        checks["redis"] = {"status": "unavailable"}

    try:
        executor = MigrationExecutor(connection)
        pending = executor.migration_plan(executor.loader.graph.leaf_nodes())
        checks["migrations"] = {"status": "healthy" if not pending else "attention", "pending": len(pending)}
    except Exception:
        checks["migrations"] = {"status": "unavailable"}

    overall = "healthy" if all(item["status"] == "healthy" for item in checks.values()) else "attention"
    return Response({
        "status": overall,
        "checked_at": timezone.now(),
        "environment": "debug" if settings.DEBUG else "production",
        "checks": checks,
    })

class PlatformOrganizationViewSet(viewsets.ReadOnlyModelViewSet):
    """Global organization management restricted to platform staff."""

    permission_classes = [IsPlatformStaff]
    search_fields = ("name", "slug", "document", "email")
    ordering_fields = ("name", "plan", "is_active", "created_at", "updated_at")
    ordering = ("-created_at",)
    filterset_fields = ("plan", "is_active")

    def get_queryset(self):
        return Organization.objects.annotate(
            users_count=Count("members", distinct=True),
            active_users_count=Count(
                "members",
                filter=Q(members__is_active=True),
                distinct=True,
            ),
            farms_count=Count("farms", distinct=True),
            transactions_count=Count("transactions", distinct=True),
            planting_cycles_count=Count("plantations", distinct=True),
            inventory_items_count=Count("inventory_items", distinct=True),
        )

    def get_serializer_class(self):
        if self.action == "retrieve":
            return PlatformOrganizationDetailSerializer
        return PlatformOrganizationListSerializer

    def get_permissions(self):
        if self.action in {"activate", "suspend"}:
            return [IsPlatformAdmin()]
        return super().get_permissions()

    @action(detail=True, methods=["post"])
    def suspend(self, request, pk=None):
        organization = self.get_object()
        if not organization.is_active:
            return Response(
                {"detail": "A organização já está suspensa."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        organization.is_active = False
        organization.save(update_fields=["is_active", "updated_at"])
        record_platform_action(
            request=request,
            action="organization.suspended",
            organization=organization,
            object_type="Organization",
            object_id=organization.id,
            description="Organização suspensa pela equipe da plataforma.",
        )
        return Response({"detail": "Organização suspensa com sucesso."})

    @action(detail=True, methods=["post"])
    def activate(self, request, pk=None):
        organization = self.get_object()
        if organization.is_active:
            return Response(
                {"detail": "A organização já está ativa."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        organization.is_active = True
        organization.save(update_fields=["is_active", "updated_at"])
        record_platform_action(
            request=request,
            action="organization.activated",
            organization=organization,
            object_type="Organization",
            object_id=organization.id,
            description="Organização reativada pela equipe da plataforma.",
        )
        return Response({"detail": "Organização ativada com sucesso."})


class PlatformUserViewSet(viewsets.ReadOnlyModelViewSet):
    """Global customer user directory and account security actions."""

    serializer_class = PlatformUserSerializer
    permission_classes = [IsPlatformStaff]
    search_fields = ("full_name", "email", "phone", "organization__name")
    ordering_fields = ("full_name", "email", "role", "is_active", "created_at", "last_login")
    ordering = ("-created_at",)
    filterset_fields = ("organization", "role", "is_active")

    def get_queryset(self):
        return (
            User.objects.filter(platform_staff_profile__isnull=True)
            .select_related("organization")
        )

    def get_permissions(self):
        if self.action in {"activate", "block", "revoke_sessions"}:
            return [IsPlatformAdmin()]
        return super().get_permissions()

    @staticmethod
    def _revoke_user_sessions(user):
        for token in OutstandingToken.objects.filter(user=user):
            BlacklistedToken.objects.get_or_create(token=token)
        User.objects.filter(pk=user.pk).update(session_version=F("session_version") + 1)
        user.refresh_from_db(fields=["session_version"])

    @action(detail=True, methods=["post"], url_path="revoke-sessions")
    @transaction.atomic
    def revoke_sessions(self, request, pk=None):
        user = self.get_object()
        self._revoke_user_sessions(user)
        record_platform_action(
            request=request,
            action="user.sessions_revoked",
            organization=user.organization,
            object_type="User",
            object_id=user.id,
            description="Todas as sessões do usuário foram encerradas.",
        )
        return Response({"detail": "Sessões encerradas com sucesso."})

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def block(self, request, pk=None):
        user = self.get_object()
        if not user.is_active:
            return Response(
                {"detail": "O usuário já está bloqueado."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user.is_active = False
        user.save(update_fields=["is_active", "updated_at"])
        self._revoke_user_sessions(user)
        record_platform_action(
            request=request,
            action="user.blocked",
            organization=user.organization,
            object_type="User",
            object_id=user.id,
            description="Usuário bloqueado pela equipe da plataforma.",
        )
        return Response({"detail": "Usuário bloqueado com sucesso."})

    @action(detail=True, methods=["post"])
    def activate(self, request, pk=None):
        user = self.get_object()
        if user.is_active:
            return Response(
                {"detail": "O usuário já está ativo."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user.is_active = True
        user.save(update_fields=["is_active", "updated_at"])
        record_platform_action(
            request=request,
            action="user.activated",
            organization=user.organization,
            object_type="User",
            object_id=user.id,
            description="Usuário reativado pela equipe da plataforma.",
        )
        return Response({"detail": "Usuário ativado com sucesso."})


class PlatformPlanViewSet(viewsets.ModelViewSet):
    serializer_class = PlanSerializer
    permission_classes = [IsPlatformStaff]
    search_fields = ("name", "code", "description")
    ordering_fields = ("sort_order", "name", "monthly_price", "created_at")
    ordering = ("sort_order", "monthly_price")
    filterset_fields = ("is_active", "is_public")

    def get_queryset(self):
        return Plan.objects.prefetch_related("entitlements__feature").annotate(
            subscriptions_count=Count("subscriptions", distinct=True)
        )

    def get_permissions(self):
        if self.action not in {"list", "retrieve"}:
            return [IsPlatformAdmin()]
        return super().get_permissions()

    def perform_create(self, serializer):
        plan = serializer.save()
        record_platform_action(
            request=self.request,
            action="plan.created",
            object_type="Plan",
            object_id=plan.id,
            description=f"Plano {plan.name} criado.",
        )

    def perform_update(self, serializer):
        plan = serializer.save()
        record_platform_action(
            request=self.request,
            action="plan.updated",
            object_type="Plan",
            object_id=plan.id,
            description=f"Plano {plan.name} atualizado.",
        )


class PlatformFeatureViewSet(viewsets.ModelViewSet):
    queryset = Feature.objects.all()
    serializer_class = FeatureSerializer
    permission_classes = [IsPlatformStaff]
    search_fields = ("name", "code", "description")
    filterset_fields = ("is_active",)

    def get_permissions(self):
        if self.action not in {"list", "retrieve"}:
            return [IsPlatformAdmin()]
        return super().get_permissions()


class PlatformSubscriptionViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = SubscriptionSerializer
    permission_classes = [IsPlatformStaff]
    search_fields = ("organization__name", "organization__document", "plan__name")
    ordering_fields = ("created_at", "updated_at", "status", "current_period_ends_at")
    ordering = ("-created_at",)
    filterset_fields = ("plan", "status", "billing_cycle", "organization")

    def get_queryset(self):
        return Subscription.objects.select_related("organization", "plan")

    def get_permissions(self):
        if self.action == "change_plan":
            return [IsPlatformAdmin()]
        return super().get_permissions()

    @action(detail=True, methods=["post"], url_path="change-plan")
    @transaction.atomic
    def change_plan(self, request, pk=None):
        subscription = self.get_object()
        serializer = ChangeSubscriptionPlanSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            plan = Plan.objects.get(pk=serializer.validated_data["plan_id"], is_active=True)
        except Plan.DoesNotExist:
            return Response({"detail": "Plano ativo não encontrado."}, status=status.HTTP_400_BAD_REQUEST)

        previous_plan = subscription.plan
        subscription.plan = plan
        if "billing_cycle" in serializer.validated_data:
            subscription.billing_cycle = serializer.validated_data["billing_cycle"]
        subscription.save(update_fields=["plan", "billing_cycle", "updated_at"])

        legacy_codes = {choice[0] for choice in Organization.Plan.choices}
        if plan.code in legacy_codes:
            subscription.organization.plan = plan.code
            subscription.organization.save(update_fields=["plan", "updated_at"])

        record_platform_action(
            request=request,
            action="subscription.plan_changed",
            organization=subscription.organization,
            object_type="Subscription",
            object_id=subscription.id,
            description=f"Plano alterado de {previous_plan.name} para {plan.name}.",
            extra_data={"previous_plan": previous_plan.code, "new_plan": plan.code},
        )
        return Response(SubscriptionSerializer(subscription).data)


class PlatformInvoiceViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsPlatformStaff]
    search_fields = ("number", "organization__name", "organization__document", "external_id")
    ordering_fields = ("due_date", "total", "status", "created_at")
    ordering = ("-due_date",)
    filterset_fields = ("status", "organization", "subscription")

    def get_queryset(self):
        return Invoice.objects.select_related("organization", "subscription__plan")

    def get_serializer_class(self):
        if self.action == "create":
            return CreateInvoiceSerializer
        return InvoiceSerializer

    def get_permissions(self):
        if self.action in {"create", "record_payment"}:
            return [IsPlatformAdmin()]
        return super().get_permissions()

    def create(self, request, *args, **kwargs):
        serializer = CreateInvoiceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            organization = Organization.objects.select_related("subscription").get(
                pk=serializer.validated_data["organization_id"]
            )
            organization.subscription
        except (Organization.DoesNotExist, Subscription.DoesNotExist):
            return Response({"detail": "Organização sem assinatura válida."}, status=status.HTTP_400_BAD_REQUEST)
        invoice = create_manual_invoice(
            organization=organization,
            due_date=serializer.validated_data["due_date"],
            description=serializer.validated_data["description"],
            amount=serializer.validated_data["amount"],
            notes=serializer.validated_data["notes"],
        )
        record_platform_action(
            request=request, action="invoice.created", organization=organization,
            object_type="Invoice", object_id=invoice.id, description=f"Fatura {invoice.number} criada.",
        )
        return Response(InvoiceSerializer(invoice).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="record-payment")
    def record_payment(self, request, pk=None):
        invoice = self.get_object()
        if invoice.status in {Invoice.Status.PAID, Invoice.Status.VOID}:
            return Response({"detail": "A fatura não aceita novos pagamentos."}, status=status.HTTP_400_BAD_REQUEST)
        serializer = RecordPaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payment = record_manual_payment(invoice=invoice, **serializer.validated_data)
        record_platform_action(
            request=request, action="payment.recorded", organization=invoice.organization,
            object_type="Payment", object_id=payment.id,
            description=f"Pagamento registrado para a fatura {invoice.number}.",
            extra_data={"amount": str(payment.amount)},
        )
        return Response(PaymentSerializer(payment).data, status=status.HTTP_201_CREATED)


class PlatformPaymentViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = PaymentSerializer
    permission_classes = [IsPlatformStaff]
    search_fields = ("invoice__number", "organization__name", "external_id")
    ordering_fields = ("paid_at", "amount", "status", "created_at")
    ordering = ("-created_at",)
    filterset_fields = ("status", "organization", "provider", "payment_method")

    def get_queryset(self):
        return Payment.objects.select_related("invoice", "organization")


class PlatformSupportAccessViewSet(viewsets.ModelViewSet):
    serializer_class = SupportAccessGrantSerializer
    permission_classes = [IsPlatformSupport]
    ordering = ("-created_at",)
    http_method_names = ("get", "post", "head", "options")

    def get_queryset(self):
        qs = SupportAccessGrant.objects.select_related("operator", "organization")
        if self.request.user.platform_staff_profile.role == "platform_support":
            qs = qs.filter(operator=self.request.user)
        return qs

    def create(self, request, *args, **kwargs):
        serializer = CreateSupportAccessSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            organization = Organization.objects.get(pk=serializer.validated_data["organization_id"], is_active=True)
        except Organization.DoesNotExist:
            return Response({"detail": "Organização ativa não encontrada."}, status=status.HTTP_400_BAD_REQUEST)
        duration = serializer.validated_data["duration_minutes"]
        grant = SupportAccessGrant.objects.create(
            operator=request.user,
            organization=organization,
            justification=serializer.validated_data["justification"],
            expires_at=timezone.now() + timedelta(minutes=duration),
        )
        token = AccessToken.for_user(request.user)
        token["session_version"] = request.user.session_version
        token["support_grant_id"] = str(grant.id)
        token.set_exp(lifetime=timedelta(minutes=duration))
        record_platform_action(
            request=request, action="support_access.created", organization=organization,
            object_type="SupportAccessGrant", object_id=grant.id,
            description="Acesso assistido somente leitura iniciado.",
            extra_data={"justification": grant.justification, "expires_at": grant.expires_at.isoformat()},
        )
        return Response({"grant": SupportAccessGrantSerializer(grant).data, "access": str(token)}, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def revoke(self, request, pk=None):
        grant = self.get_object()
        if grant.revoked_at is None:
            grant.revoked_at = timezone.now()
            grant.save(update_fields=["revoked_at", "updated_at"])
            record_platform_action(
                request=request, action="support_access.revoked", organization=grant.organization,
                object_type="SupportAccessGrant", object_id=grant.id,
                description="Acesso assistido revogado.",
            )
        return Response({"detail": "Acesso assistido revogado."})


class PlatformTaskRunViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = BackgroundTaskRun.objects.select_related("triggered_by", "retry_of")
    serializer_class = BackgroundTaskRunSerializer
    permission_classes = [IsPlatformDeveloper]
    search_fields = ("task_name", "task_id", "error_class", "error_message")
    filterset_fields = ("status", "task_name")
    ordering_fields = ("created_at", "started_at", "finished_at", "duration_ms", "status")
    ordering = ("-created_at",)

    @action(detail=True, methods=["post"])
    def retry(self, request, pk=None):
        previous = self.get_object()
        if previous.status != BackgroundTaskRun.Status.FAILURE or previous.task_name not in RETRYABLE_TASKS:
            return Response({"detail": "Esta tarefa não permite retentativa administrativa."}, status=status.HTTP_400_BAD_REQUEST)
        result = current_app.send_task(previous.task_name)
        run, _ = BackgroundTaskRun.objects.update_or_create(
            task_id=result.id,
            defaults={"task_name": previous.task_name, "status": BackgroundTaskRun.Status.QUEUED, "retry_of": previous, "triggered_by": request.user},
        )
        record_platform_action(
            request=request, action="task.retry_requested", object_type="BackgroundTaskRun", object_id=run.id,
            description=f"Retentativa aprovada para {previous.task_name}.",
        )
        return Response(BackgroundTaskRunSerializer(run).data, status=status.HTTP_202_ACCEPTED)


class AdminOnlyMutationViewSet(viewsets.ModelViewSet):
    permission_classes = [IsPlatformStaff]

    def get_permissions(self):
        if self.action not in {"list", "retrieve"}:
            return [IsPlatformAdmin()]
        return super().get_permissions()

    def perform_create(self, serializer):
        instance = serializer.save()
        record_platform_action(request=self.request, action=f"{instance._meta.model_name}.created", object_type=instance.__class__.__name__, object_id=instance.id)

    def perform_update(self, serializer):
        instance = serializer.save()
        record_platform_action(request=self.request, action=f"{instance._meta.model_name}.updated", object_type=instance.__class__.__name__, object_id=instance.id)


class PlatformFeatureFlagViewSet(AdminOnlyMutationViewSet):
    queryset = FeatureFlag.objects.prefetch_related("allowed_organizations")
    serializer_class = FeatureFlagSerializer
    search_fields = ("key", "name", "description")
    filterset_fields = ("is_enabled",)


class PlatformAnnouncementViewSet(AdminOnlyMutationViewSet):
    queryset = SystemAnnouncement.objects.all()
    serializer_class = SystemAnnouncementSerializer
    search_fields = ("title", "message")
    filterset_fields = ("is_active", "level")


class PlatformMaintenanceViewSet(AdminOnlyMutationViewSet):
    queryset = MaintenanceWindow.objects.all()
    serializer_class = MaintenanceWindowSerializer
    filterset_fields = ("is_active",)


@api_view(["POST"])
@permission_classes([IsPlatformDeveloper])
def execute_sql_query(request):
    serializer = SqlQueryRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    query = serializer.validated_data["query"]
    history_query = redact_query_for_history(query)
    try:
        result = execute_readonly_query(query)
        execution = SqlQueryExecution.objects.create(
            operator=request.user, query_text=history_query, status=SqlQueryExecution.Status.SUCCESS,
            duration_ms=result["duration_ms"], row_count=result["row_count"], was_truncated=result["was_truncated"],
        )
        record_platform_action(
            request=request, action="sql_query.executed", object_type="SqlQueryExecution", object_id=execution.id,
            description=f"Consulta read-only concluída com {result['row_count']} linhas.",
        )
        return Response({"execution_id": execution.id, **result})
    except UnsafeQuery as exc:
        execution = SqlQueryExecution.objects.create(
            operator=request.user, query_text=history_query, status=SqlQueryExecution.Status.REJECTED,
            error_message=str(exc)[:500],
        )
        record_platform_action(
            request=request, action="sql_query.rejected", object_type="SqlQueryExecution", object_id=execution.id,
            description="Consulta rejeitada pela política read-only.",
        )
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    except DatabaseError:
        execution = SqlQueryExecution.objects.create(
            operator=request.user, query_text=history_query, status=SqlQueryExecution.Status.ERROR,
            error_message="Erro de banco sanitizado.",
        )
        record_platform_action(
            request=request, action="sql_query.failed", object_type="SqlQueryExecution", object_id=execution.id,
            description="Consulta read-only falhou.",
        )
        return Response({"detail": "A consulta não pôde ser executada."}, status=status.HTTP_400_BAD_REQUEST)


@api_view(["POST"])
@permission_classes([IsPlatformDeveloper])
def explain_sql_query(request):
    serializer = SqlQueryRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    query = serializer.validated_data["query"]
    history_query = redact_query_for_history(query)
    try:
        result = explain_readonly_query(query)
        execution = SqlQueryExecution.objects.create(
            operator=request.user,
            query_text=f"explain:{history_query}",
            status=SqlQueryExecution.Status.SUCCESS,
            duration_ms=result["duration_ms"],
        )
        record_platform_action(
            request=request,
            action="sql_query.explained",
            object_type="SqlQueryExecution",
            object_id=execution.id,
            description="Plano estimado de consulta read-only gerado sem ANALYZE.",
        )
        return Response({"execution_id": execution.id, **result})
    except UnsafeQuery as exc:
        execution = SqlQueryExecution.objects.create(
            operator=request.user,
            query_text=f"explain:{history_query}",
            status=SqlQueryExecution.Status.REJECTED,
            error_message=str(exc)[:500],
        )
        record_platform_action(
            request=request,
            action="sql_query.explain_rejected",
            object_type="SqlQueryExecution",
            object_id=execution.id,
            description="Análise de plano rejeitada pela política read-only.",
        )
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    except DatabaseError:
        execution = SqlQueryExecution.objects.create(
            operator=request.user,
            query_text=f"explain:{history_query}",
            status=SqlQueryExecution.Status.ERROR,
            error_message="Erro de banco sanitizado.",
        )
        record_platform_action(
            request=request,
            action="sql_query.explain_failed",
            object_type="SqlQueryExecution",
            object_id=execution.id,
            description="Não foi possível gerar o plano estimado.",
        )
        return Response({"detail": "O plano da consulta não pôde ser gerado."}, status=status.HTTP_400_BAD_REQUEST)


class PlatformSqlHistoryViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = SqlQueryExecution.objects.select_related("operator")
    serializer_class = SqlQueryExecutionSerializer
    permission_classes = [IsPlatformDeveloper]
    filterset_fields = ("status", "operator")
    search_fields = ("query_text",)
    ordering = ("-created_at",)


class DeveloperSandboxGrantViewSet(viewsets.ModelViewSet):
    queryset = DeveloperSandboxGrant.objects.select_related("requester", "approver")
    serializer_class = DeveloperSandboxGrantSerializer
    http_method_names = ("get", "post", "head", "options")
    filterset_fields = ("status", "requester")
    ordering = ("-created_at",)

    def get_permissions(self):
        if self.action in {"approve", "reject"}:
            return [IsPlatformAdmin()]
        return [IsPlatformDeveloper()]

    def perform_create(self, serializer):
        grant = serializer.save(requester=self.request.user)
        record_platform_action(
            request=self.request,
            action="sandbox_access.requested",
            object_type="DeveloperSandboxGrant",
            object_id=grant.id,
            description="Acesso temporário ao sandbox solicitado; nenhum executor foi iniciado.",
        )

    def _pending_grant(self):
        return DeveloperSandboxGrant.objects.select_for_update().get(
            pk=self.kwargs["pk"], status=DeveloperSandboxGrant.Status.PENDING
        )

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        with transaction.atomic():
            grant = self._pending_grant()
            if grant.requester_id == request.user.id:
                return Response({"detail": "A solicitação deve ser aprovada por outra pessoa."}, status=400)
            grant.approver = request.user
            grant.status = DeveloperSandboxGrant.Status.APPROVED
            grant.approved_at = timezone.now()
            grant.expires_at = grant.approved_at + timedelta(minutes=grant.requested_minutes)
            grant.save(update_fields=("approver", "status", "approved_at", "expires_at", "updated_at"))
        record_platform_action(
            request=request, action="sandbox_access.approved", object_type="DeveloperSandboxGrant",
            object_id=grant.id, description=f"Acesso JIT aprovado por {grant.requested_minutes} minutos; executor desabilitado.",
        )
        return Response(self.get_serializer(grant).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        reason = str(request.data.get("reason", "")).strip()
        if len(reason) < 10:
            return Response({"detail": "Informe o motivo da rejeição com ao menos 10 caracteres."}, status=400)
        with transaction.atomic():
            grant = self._pending_grant()
            grant.approver = request.user
            grant.status = DeveloperSandboxGrant.Status.REJECTED
            grant.decision_reason = reason
            grant.save(update_fields=("approver", "status", "decision_reason", "updated_at"))
        record_platform_action(
            request=request, action="sandbox_access.rejected", object_type="DeveloperSandboxGrant",
            object_id=grant.id, description="Solicitação JIT rejeitada.",
        )
        return Response(self.get_serializer(grant).data)

    @action(detail=True, methods=["post"])
    def revoke(self, request, pk=None):
        with transaction.atomic():
            grant = DeveloperSandboxGrant.objects.select_for_update().get(pk=pk)
            is_admin = request.user.platform_staff_profile.role in {
                PlatformStaffProfile.Role.OWNER, PlatformStaffProfile.Role.ADMIN,
            }
            if grant.requester_id != request.user.id and not is_admin:
                return Response({"detail": "Você não pode revogar esta solicitação."}, status=403)
            if grant.status != DeveloperSandboxGrant.Status.APPROVED or not grant.is_valid:
                return Response({"detail": "Não existe acesso ativo para revogar."}, status=400)
            grant.status = DeveloperSandboxGrant.Status.REVOKED
            grant.revoked_at = timezone.now()
            grant.save(update_fields=("status", "revoked_at", "updated_at"))
        record_platform_action(
            request=request, action="sandbox_access.revoked", object_type="DeveloperSandboxGrant",
            object_id=grant.id, description="Acesso JIT revogado imediatamente.",
        )
        return Response(self.get_serializer(grant).data)


class SandboxExecutionViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = SandboxExecution.objects.select_related("operator", "grant")
    serializer_class = SandboxExecutionSerializer
    permission_classes = [IsPlatformDeveloper]
    filterset_fields = ("status", "operator", "grant")
    ordering = ("-created_at",)


@api_view(["POST"])
@permission_classes([IsPlatformDeveloper])
def execute_sandbox_code(request):
    serializer = SandboxExecuteSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    if not settings.SANDBOX_EXECUTOR_ENABLED:
        return Response(
            {"detail": "O executor isolado ainda não foi habilitado neste ambiente."},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    try:
        grant = DeveloperSandboxGrant.objects.get(
            pk=serializer.validated_data["grant_id"], requester=request.user
        )
    except DeveloperSandboxGrant.DoesNotExist:
        return Response({"detail": "Autorização JIT inválida."}, status=status.HTTP_403_FORBIDDEN)
    if not grant.is_valid:
        return Response({"detail": "A autorização JIT expirou ou foi revogada."}, status=status.HTTP_403_FORBIDDEN)

    code = serializer.validated_data["code"]
    execution = SandboxExecution.objects.create(
        grant=grant,
        operator=request.user,
        code_sha256=hashlib.sha256(code.encode("utf-8")).hexdigest(),
    )
    started = time.monotonic()
    try:
        result = SandboxClient().execute(code)
        execution.status = {
            "success": SandboxExecution.Status.SUCCESS,
            "timeout": SandboxExecution.Status.TIMEOUT,
        }.get(result.get("status"), SandboxExecution.Status.ERROR)
        execution.exit_code = result.get("exit_code")
        stdout = str(result.get("stdout", ""))
        stderr = str(result.get("stderr", ""))
        execution.stdout_bytes = len(stdout.encode("utf-8"))
        execution.stderr_bytes = len(stderr.encode("utf-8"))
        response_status = status.HTTP_200_OK
    except SandboxUnavailable as exc:
        result = {"status": "service_error", "exit_code": None, "stdout": "", "stderr": str(exc)}
        execution.status = SandboxExecution.Status.SERVICE_ERROR
        execution.error_message = str(exc)[:300]
        response_status = status.HTTP_503_SERVICE_UNAVAILABLE
    execution.duration_ms = int((time.monotonic() - started) * 1000)
    execution.save(
        update_fields=(
            "status", "duration_ms", "exit_code", "stdout_bytes", "stderr_bytes", "error_message", "updated_at",
        )
    )
    record_platform_action(
        request=request,
        action="sandbox.execution_finished",
        object_type="SandboxExecution",
        object_id=execution.id,
        description=f"Execução isolada finalizada com status {execution.status}.",
        extra_data={"grant_id": str(grant.id), "code_sha256": execution.code_sha256},
    )
    return Response({"execution_id": execution.id, "duration_ms": execution.duration_ms, **result}, status=response_status)


@api_view(["GET"])
@permission_classes([IsPlatformDeveloper])
def sandbox_status(request):
    active_grant = DeveloperSandboxGrant.objects.filter(
        requester=request.user,
        status=DeveloperSandboxGrant.Status.APPROVED,
        revoked_at__isnull=True,
        expires_at__gt=timezone.now(),
    ).order_by("-expires_at").first()
    enabled = settings.SANDBOX_EXECUTOR_ENABLED
    available = False
    if enabled:
        try:
            SandboxClient().health()
            available = True
        except SandboxUnavailable:
            pass
    return Response({
        "enabled": enabled,
        "available": available,
        "active_grant": (
            {"id": active_grant.id, "expires_at": active_grant.expires_at}
            if active_grant else None
        ),
    })

@api_view(["GET", "POST"])
@permission_classes([IsPlatformDeveloper])
def approved_queries(request):
    if request.method == "GET":
        return Response({"results": available_queries()})

    serializer = ApprovedQueryRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    key = serializer.validated_data["key"]
    try:
        result = run_approved_query(key, serializer.validated_data.get("organization_id"))
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    execution = SqlQueryExecution.objects.create(
        operator=request.user,
        query_text=f"approved:{key}",
        status=SqlQueryExecution.Status.SUCCESS,
        duration_ms=result["duration_ms"],
        row_count=result["row_count"],
        was_truncated=result["was_truncated"],
    )
    record_platform_action(
        request=request,
        action="approved_query.executed",
        object_type="SqlQueryExecution",
        object_id=execution.id,
        description=f"Consulta aprovada {key} concluída com {result['row_count']} linhas.",
    )
    return Response({"execution_id": execution.id, **result})
