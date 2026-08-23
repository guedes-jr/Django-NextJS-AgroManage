from datetime import datetime, time as datetime_time, timedelta
from decimal import Decimal
import csv
import json
import hashlib
import time

from django.contrib.auth import get_user_model
from django.core.mail import send_mail
from django.db import transaction
from django.db import connection
from django.conf import settings
from django.db.migrations.executor import MigrationExecutor
from django.db import DatabaseError
from django.http import HttpResponse
from django.db.models import Avg, Count, F, Q, Sum
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes, throttle_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.throttling import SimpleRateThrottle
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import AccessToken
from celery import current_app

from apps.organizations.models import Organization
from apps.billing.models import Feature, Invoice, Payment, Plan, Subscription
from apps.billing.services import create_manual_invoice, record_manual_payment
from apps.ai_assistant.models import (
    AIConversation, AIFeedback, AIMessage, AIModel, AIModelSyncRun,
    AIProviderConfiguration, AIUsage,
)
from apps.ai_assistant.tasks import sync_opencode_zen_models_task
from apps.ai_assistant.services.quota import (
    CUSTOM_ENABLED_KEY, CUSTOM_LIMIT_KEY, get_organization_ai_rules,
)
from apps.ai_assistant.services.observability import get_ai_operations_snapshot
from common.permissions import IsPlatformAdmin, IsPlatformAuditor, IsPlatformDeveloper, IsPlatformStaff, IsPlatformSupport

from .serializers import (
    PlatformOrganizationDetailSerializer,
    PlatformOrganizationListSerializer,
    PlatformOrganizationWriteSerializer,
    PlatformStaffSerializer,
    PlatformTeamMemberSerializer,
    PlatformTeamMemberWriteSerializer,
    PlatformAuditLogSerializer,
    PublicDemoRequestSerializer,
    DemoRequestSerializer,
    DemoRequestDecisionSerializer,
    DemoAppointmentSerializer,
    DemoRequestPipelineSerializer,
    MarketingEventSerializer,
    PlatformUserSerializer,
    ChangeSubscriptionPlanSerializer,
    SubscriptionDiscountSerializer,
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
    AIProviderConfigurationSerializer,
    AIModelAdminSerializer,
    AIModelSyncRunSerializer,
)
from .services import record_platform_action
from .models import BackgroundTaskRun, DemoAppointment, DemoRequest, DemoRequestActivity, DeveloperSandboxGrant, FeatureFlag, MaintenanceWindow, MarketingEvent, PlatformAuditLog, PlatformStaffProfile, SandboxExecution, SqlQueryExecution, SupportAccessGrant, SystemAnnouncement
from .operational import RETRYABLE_TASKS
from .sql_console import UnsafeQuery, execute_readonly_query, explain_readonly_query, redact_query_for_history
from .approved_queries import available_queries, run_approved_query
from .sandbox_client import SandboxClient, SandboxUnavailable

User = get_user_model()


@api_view(["GET"])
@permission_classes([IsPlatformStaff])
def ai_providers(request):
    queryset = AIProviderConfiguration.objects.all().order_by("display_name")
    return Response(AIProviderConfigurationSerializer(queryset, many=True).data)


@api_view(["PATCH"])
@permission_classes([IsPlatformAdmin])
@transaction.atomic
def update_ai_provider(request, provider_id):
    provider = AIProviderConfiguration.objects.select_for_update().filter(id=provider_id).first()
    if not provider:
        return Response({"detail": "Provedor não encontrado."}, status=status.HTTP_404_NOT_FOUND)
    serializer = AIProviderConfigurationSerializer(provider, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    if serializer.validated_data.get("is_default"):
        AIProviderConfiguration.objects.exclude(id=provider.id).filter(is_default=True).update(
            is_default=False, updated_at=timezone.now()
        )
    provider = serializer.save()
    record_platform_action(
        request=request,
        action="ai.provider_updated",
        object_type="AIProviderConfiguration",
        object_id=provider.id,
        description=f"Configuração do provedor {provider.display_name} atualizada.",
        extra_data={"is_enabled": provider.is_enabled, "is_default": provider.is_default},
    )
    return Response(AIProviderConfigurationSerializer(provider).data)


@api_view(["GET"])
@permission_classes([IsPlatformStaff])
def ai_models(request):
    queryset = AIModel.objects.select_related("provider").all()
    provider = request.query_params.get("provider")
    if provider:
        queryset = queryset.filter(provider__provider=provider)
    for parameter in ("is_free", "is_available", "is_enabled"):
        value = request.query_params.get(parameter)
        if value in {"true", "false"}:
            queryset = queryset.filter(**{parameter: value == "true"})
    queryset = queryset.order_by("-provider__is_default", "-is_primary", "priority", "display_name")
    return Response(AIModelAdminSerializer(queryset, many=True).data)


@api_view(["PATCH"])
@permission_classes([IsPlatformAdmin])
@transaction.atomic
def update_ai_model(request, model_id):
    model = AIModel.objects.select_for_update().select_related("provider").filter(id=model_id).first()
    if not model:
        return Response({"detail": "Modelo não encontrado."}, status=status.HTTP_404_NOT_FOUND)
    serializer = AIModelAdminSerializer(model, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    if serializer.validated_data.get("is_primary"):
        AIModel.objects.filter(provider=model.provider, is_primary=True).exclude(id=model.id).update(
            is_primary=False, updated_at=timezone.now()
        )
    model = serializer.save()
    record_platform_action(
        request=request,
        action="ai.model_updated",
        object_type="AIModel",
        object_id=model.id,
        description=f"Modelo {model.external_id} atualizado.",
        extra_data={
            "provider": model.provider.provider,
            "is_enabled": model.is_enabled,
            "is_primary": model.is_primary,
            "priority": model.priority,
        },
    )
    return Response(AIModelAdminSerializer(model).data)


@api_view(["GET"])
@permission_classes([IsPlatformStaff])
def ai_model_sync_runs(request):
    queryset = AIModelSyncRun.objects.select_related("provider").order_by("-started_at")[:50]
    return Response(AIModelSyncRunSerializer(queryset, many=True).data)


@api_view(["POST"])
@permission_classes([IsPlatformAdmin])
def trigger_ai_model_sync(request):
    result = sync_opencode_zen_models_task.apply_async(kwargs={"trigger": AIModelSyncRun.Trigger.MANUAL})
    record_platform_action(
        request=request,
        action="ai.model_sync_requested",
        object_type="BackgroundTaskRun",
        object_id=result.id,
        description="Sincronização manual do catálogo OpenCode Zen solicitada.",
    )
    return Response({"task_id": result.id, "status": "queued"}, status=status.HTTP_202_ACCEPTED)


@api_view(["GET"])
@permission_classes([IsPlatformStaff])
def ai_dashboard(request):
    today = timezone.localdate()
    month_start = today.replace(day=1)
    usage = AIUsage.objects.filter(period_start=month_start)
    totals = usage.aggregate(
        questions=Sum("questions_used"), input_tokens=Sum("input_tokens"),
        output_tokens=Sum("output_tokens"), cost=Sum("estimated_cost_usd"),
        users=Count("user", distinct=True), organizations=Count("organization", distinct=True),
    )
    messages = AIMessage.objects.filter(created_at__date__gte=month_start)
    feedback = AIFeedback.objects.filter(created_at__date__gte=month_start)
    feedback_total = feedback.count()
    helpful = feedback.filter(helpful=True).count()

    usage_by_org = {
        row["organization_id"]: row
        for row in usage.values("organization_id").annotate(
            questions=Sum("questions_used"), input_tokens=Sum("input_tokens"),
            output_tokens=Sum("output_tokens"), cost=Sum("estimated_cost_usd"),
            users=Count("user", distinct=True),
        )
    }
    organizations = Organization.objects.filter(is_active=True).select_related(
        "subscription__plan"
    ).prefetch_related("subscription__plan__entitlements__feature").order_by("name")
    organization_rows = []
    for organization in organizations:
        org_usage = usage_by_org.get(organization.id, {})
        rules = get_organization_ai_rules(organization)
        used = org_usage.get("questions") or 0
        limit = rules["limit"]
        organization_rows.append({
            "id": str(organization.id), "name": organization.name,
            "plan": getattr(getattr(organization, "subscription", None), "plan", None).name
            if getattr(organization, "subscription", None) else "Sem plano",
            "enabled": rules["enabled"], "limit": limit, "used": used,
            "remaining": None if limit is None else max(limit - used, 0),
            "users": org_usage.get("users") or 0,
            "input_tokens": org_usage.get("input_tokens") or 0,
            "output_tokens": org_usage.get("output_tokens") or 0,
            "cost_usd": float(org_usage.get("cost") or 0),
        })
    organization_rows.sort(key=lambda item: item["used"], reverse=True)

    incidents = [
        {
            "id": str(item.id), "organization": item.conversation.organization.name,
            "subject": item.conversation.get_subject_display(), "role": item.get_role_display(),
            "status": item.status, "error_code": item.error_code,
            "created_at": item.created_at.isoformat(),
        }
        for item in messages.filter(status__in=[AIMessage.Status.BLOCKED, AIMessage.Status.FAILED])
        .select_related("conversation__organization").order_by("-created_at")[:20]
    ]
    subjects = [
        {"subject": row["subject"], "label": dict(AIConversation.Subject.choices).get(row["subject"], row["subject"]), "total": row["total"]}
        for row in AIConversation.objects.filter(created_at__date__gte=month_start)
        .values("subject").annotate(total=Count("id")).order_by("-total")
    ]
    return Response({
        "period": {"start": month_start.isoformat(), "end": today.isoformat()},
        "metrics": {
            "questions": totals["questions"] or 0,
            "input_tokens": totals["input_tokens"] or 0,
            "output_tokens": totals["output_tokens"] or 0,
            "cost_usd": float(totals["cost"] or 0),
            "active_users": totals["users"] or 0,
            "active_organizations": totals["organizations"] or 0,
            "completed_answers": messages.filter(role=AIMessage.Role.ASSISTANT, status=AIMessage.Status.COMPLETED).count(),
            "blocked": messages.filter(status=AIMessage.Status.BLOCKED).count(),
            "failed": messages.filter(status=AIMessage.Status.FAILED).count(),
            "feedback_total": feedback_total,
            "helpful": helpful,
            "helpful_rate": round(helpful / feedback_total * 100, 1) if feedback_total else 0,
        },
        "subjects": subjects,
        "organizations": organization_rows,
        "incidents": incidents,
        "model_operations": get_ai_operations_snapshot(period_start=month_start),
    })


@api_view(["PATCH"])
@permission_classes([IsPlatformAdmin])
def update_organization_ai(request, organization_id):
    organization = Organization.objects.select_related("subscription__plan").filter(id=organization_id).first()
    if not organization or not hasattr(organization, "subscription"):
        return Response({"detail": "Organização ou assinatura não encontrada."}, status=status.HTTP_404_NOT_FOUND)
    enabled = request.data.get("enabled")
    limit = request.data.get("limit")
    if enabled is not None and not isinstance(enabled, bool):
        return Response({"detail": "O campo enabled deve ser verdadeiro ou falso."}, status=status.HTTP_400_BAD_REQUEST)
    if limit is not None:
        try:
            limit = int(limit)
        except (TypeError, ValueError):
            return Response({"detail": "O limite deve ser um número inteiro."}, status=status.HTTP_400_BAD_REQUEST)
        if limit < 0 or limit > 100000:
            return Response({"detail": "O limite deve estar entre 0 e 100.000."}, status=status.HTTP_400_BAD_REQUEST)
    subscription = organization.subscription
    custom_limits = dict(subscription.custom_limits or {})
    if enabled is not None:
        custom_limits[CUSTOM_ENABLED_KEY] = enabled
    if limit is not None:
        custom_limits[CUSTOM_LIMIT_KEY] = limit
    subscription.custom_limits = custom_limits
    subscription.save(update_fields=("custom_limits", "updated_at"))
    rules = get_organization_ai_rules(organization)
    record_platform_action(
        request=request, action="ai.organization_limits_updated", organization=organization,
        object_type="organization", object_id=organization.id,
        description="Configuração do Assistente IA atualizada.",
        extra_data={"enabled": rules["enabled"], "limit": rules["limit"]},
    )
    return Response({"id": str(organization.id), **rules})


class DemoRequestThrottle(SimpleRateThrottle):
    scope = "demo_request"
    rate = "5/hour"

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}


class MarketingEventThrottle(SimpleRateThrottle):
    scope = "marketing_event"
    rate = "120/hour"

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}


@api_view(["POST"])
@permission_classes([])
@throttle_classes([DemoRequestThrottle])
def public_demo_request(request):
    serializer = PublicDemoRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR", "")
    ip_address = forwarded_for.split(",")[0].strip() if forwarded_for else request.META.get("REMOTE_ADDR")
    demo_request = serializer.save(
        ip_address=ip_address or None,
        user_agent=request.META.get("HTTP_USER_AGENT", "")[:512],
    )
    DemoRequestActivity.objects.create(
        demo_request=demo_request,
        action="lead.created",
        description="Solicitação recebida pela landing page.",
        metadata={"source": demo_request.utm_source, "campaign": demo_request.utm_campaign},
    )
    if demo_request.preferred_demo_at:
        DemoAppointment.objects.create(
            demo_request=demo_request,
            starts_at=demo_request.preferred_demo_at,
            duration_minutes=45,
            timezone="America/Recife",
            created_by=None,
            notes="Horário escolhido no formulário público.",
        )
        demo_request.status = DemoRequest.Status.SCHEDULED
        demo_request.next_action_at = demo_request.preferred_demo_at
        demo_request.save(update_fields=("status", "next_action_at", "updated_at"))
        DemoRequestActivity.objects.create(
            demo_request=demo_request,
            action="lead.self_scheduled",
            description=f"Demonstração solicitada para {demo_request.preferred_demo_at.isoformat()}.",
        )
    recipients = getattr(settings, "DEMO_REQUEST_NOTIFICATION_EMAILS", [])
    if recipients:
        send_mail(
            subject=f"Nova demonstração — {demo_request.organization_name}",
            message=(
                f"Nome: {demo_request.name}\nE-mail: {demo_request.email}\n"
                f"Telefone: {demo_request.phone}\nPerfil: {demo_request.operation_profile}\n"
                f"Plano: {demo_request.selected_plan or 'Não informado'}\n\n{demo_request.message}"
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=recipients,
            fail_silently=True,
        )
    send_mail(
        subject="Recebemos sua solicitação — AgroManage",
        message=(
            f"Olá, {demo_request.name}!\n\nRecebemos sua solicitação de demonstração para "
            f"{demo_request.organization_name}. Nossa equipe analisará o cenário informado e entrará "
            "em contato."
            + (f"\n\nHorário solicitado: {timezone.localtime(demo_request.preferred_demo_at).strftime('%d/%m/%Y às %H:%M')}." if demo_request.preferred_demo_at else "")
            + "\n\nEnquanto isso, você pode conhecer os recursos e planos em nosso site.\n\nEquipe AgroManage"
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[demo_request.email],
        fail_silently=True,
    )
    return Response(PublicDemoRequestSerializer(demo_request).data, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([])
@throttle_classes([MarketingEventThrottle])
def public_marketing_event(request):
    serializer = MarketingEventSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    event = serializer.save()
    return Response({"id": event.id}, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([])
def public_demo_availability(request):
    now = timezone.localtime()
    occupied = set(DemoAppointment.objects.filter(
        status=DemoAppointment.Status.SCHEDULED,
        starts_at__gte=now,
        starts_at__lte=now + timedelta(days=21),
    ).values_list("starts_at", flat=True))
    slots = []
    for offset in range(1, 15):
        day = (now + timedelta(days=offset)).date()
        if day.weekday() >= 5:
            continue
        for hour in (9, 10, 11, 14, 15, 16):
            candidate = timezone.make_aware(datetime.combine(day, datetime_time(hour=hour)), timezone.get_current_timezone())
            if candidate not in occupied:
                slots.append(candidate.isoformat())
    return Response({"timezone": str(timezone.get_current_timezone()), "slots": slots[:30]})


@api_view(["GET"])
@permission_classes([IsPlatformStaff])
def commercial_dashboard(request):
    leads = DemoRequest.objects.all()
    events = MarketingEvent.objects.all()
    status_counts = {row["status"]: row["total"] for row in leads.values("status").annotate(total=Count("id"))}
    source_counts = list(leads.values("utm_source").annotate(total=Count("id")).order_by("-total")[:10])
    total_leads = leads.count()
    won = status_counts.get(DemoRequest.Status.WON, 0)
    scheduled = status_counts.get(DemoRequest.Status.SCHEDULED, 0)
    page_views = events.filter(event_name="page_view").count()
    return Response({
        "summary": {
            "total_leads": total_leads,
            "open_leads": leads.exclude(status__in=(DemoRequest.Status.WON, DemoRequest.Status.LOST)).count(),
            "scheduled": scheduled,
            "won": won,
            "estimated_pipeline": leads.exclude(status=DemoRequest.Status.LOST).aggregate(value=Sum("estimated_value"))["value"] or 0,
            "conversion_rate": round((won / total_leads * 100), 2) if total_leads else 0,
            "page_views": page_views,
            "lead_conversion_rate": round((total_leads / page_views * 100), 2) if page_views else 0,
        },
        "by_status": status_counts,
        "by_source": source_counts,
        "events": list(events.values("event_name").annotate(total=Count("id")).order_by("-total")),
        "web_vitals": list(events.filter(event_name__startswith="web_vital.").values("event_name").annotate(average=Avg("value"), samples=Count("id"))),
    })


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
    """Return executive, commercial and operational KPIs for the platform backoffice."""

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
    subscriptions = Subscription.objects.select_related("plan", "organization")
    active_subscriptions = subscriptions.filter(status=Subscription.Status.ACTIVE)
    segment_results = []
    for plan in Plan.objects.filter(is_active=True).order_by("sort_order", "monthly_price"):
        plan_subscriptions = subscriptions.filter(plan=plan)
        active_plan_subscriptions = plan_subscriptions.filter(status=Subscription.Status.ACTIVE)
        plan_organizations = Organization.objects.filter(subscription__plan=plan)
        plan_users = User.objects.filter(organization__subscription__plan=plan)
        segment_mrr = Decimal("0")
        for subscription in active_plan_subscriptions:
            segment_mrr += (
                subscription.plan.yearly_price / Decimal("12")
                if subscription.billing_cycle == Subscription.BillingCycle.YEARLY
                else subscription.plan.monthly_price
            )
        segment_results.append({
            "code": plan.code,
            "name": plan.name,
            "organizations": plan_organizations.count(),
            "active_organizations": plan_organizations.filter(is_active=True).count(),
            "users": plan_users.count(),
            "active_users": plan_users.filter(is_active=True).count(),
            "farms": plan_organizations.aggregate(total=Count("farms", distinct=True))["total"] or 0,
            "active_subscriptions": active_plan_subscriptions.count(),
            "trialing_subscriptions": plan_subscriptions.filter(status=Subscription.Status.TRIALING).count(),
            "mrr": segment_mrr,
        })

    mrr = Decimal("0")
    for subscription in active_subscriptions:
        mrr += (
            subscription.plan.yearly_price / Decimal("12")
            if subscription.billing_cycle == Subscription.BillingCycle.YEARLY
            else subscription.plan.monthly_price
        )
    today = timezone.localdate()
    open_invoices = Invoice.objects.filter(status__in=(Invoice.Status.OPEN, Invoice.Status.OVERDUE))
    overdue_invoices = open_invoices.filter(due_date__lt=today)
    open_leads = DemoRequest.objects.exclude(status__in=(DemoRequest.Status.WON, DemoRequest.Status.LOST))
    won_leads = DemoRequest.objects.filter(status=DemoRequest.Status.WON)
    pipeline_value = open_leads.aggregate(value=Sum("estimated_value"))["value"] or Decimal("0")
    recent_activities = []
    for log in PlatformAuditLog.objects.select_related("actor", "organization").order_by("-created_at")[:8]:
        recent_activities.append({
            "id": str(log.id),
            "action": log.action,
            "description": log.description or log.action.replace(".", " ").title(),
            "actor_name": log.actor.full_name if log.actor else "Sistema",
            "organization_name": log.organization.name if log.organization else "Plataforma",
            "object_type": log.object_type,
            "created_at": log.created_at,
        })

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
            "segments": segment_results,
            "commercial": {
                "open_leads": open_leads.count(),
                "won_leads": won_leads.count(),
                "scheduled_demos": DemoAppointment.objects.filter(
                    status=DemoAppointment.Status.SCHEDULED,
                    starts_at__gte=timezone.now(),
                ).count(),
                "pipeline_value": pipeline_value,
            },
            "finance": {
                "mrr": mrr,
                "active_subscriptions": active_subscriptions.count(),
                "trialing_subscriptions": subscriptions.filter(status=Subscription.Status.TRIALING).count(),
                "open_invoices": open_invoices.count(),
                "overdue_invoices": overdue_invoices.count(),
                "outstanding": sum((invoice.amount_due for invoice in open_invoices), Decimal("0")),
            },
            "recent_activities": recent_activities,
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

class PlatformOrganizationViewSet(viewsets.ModelViewSet):
    """Global organization management restricted to platform staff."""

    permission_classes = [IsPlatformStaff]
    search_fields = ("name", "slug", "document", "email")
    ordering_fields = ("name", "plan", "is_active", "created_at", "updated_at")
    ordering = ("-created_at",)
    filterset_fields = ("plan", "is_active")
    http_method_names = ("get", "post", "patch", "head", "options")

    def get_queryset(self):
        return Organization.objects.select_related("subscription__plan").annotate(
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
        if self.action in {"create", "partial_update"}:
            return PlatformOrganizationWriteSerializer
        if self.action == "retrieve":
            return PlatformOrganizationDetailSerializer
        return PlatformOrganizationListSerializer

    def get_permissions(self):
        if self.action in {"create", "partial_update", "activate", "suspend", "archive"}:
            return [IsPlatformAdmin()]
        return super().get_permissions()

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        plan = Plan.objects.get(pk=serializer.validated_data.pop("plan_id"))
        billing_cycle = serializer.validated_data.pop("billing_cycle")
        legacy_codes = {choice[0] for choice in Organization.Plan.choices}
        organization = serializer.save(
            plan=plan.code if plan.code in legacy_codes else Organization.Plan.FREE,
        )
        subscription, _ = Subscription.objects.get_or_create(
            organization=organization,
            defaults={
                "plan": plan,
                "status": Subscription.Status.ACTIVE,
                "billing_cycle": billing_cycle,
                "started_at": timezone.now(),
            },
        )
        if subscription.plan_id != plan.id or subscription.billing_cycle != billing_cycle:
            subscription.plan = plan
            subscription.billing_cycle = billing_cycle
            subscription.save(update_fields=("plan", "billing_cycle", "updated_at"))
        record_platform_action(
            request=request,
            action="organization.created",
            organization=organization,
            object_type="Organization",
            object_id=organization.id,
            description="Organização criada pela equipe da plataforma.",
            extra_data={"plan": plan.code, "billing_cycle": billing_cycle},
        )
        result = self.get_queryset().get(pk=organization.pk)
        return Response(PlatformOrganizationDetailSerializer(result).data, status=status.HTTP_201_CREATED)

    @transaction.atomic
    def partial_update(self, request, *args, **kwargs):
        organization = self.get_object()
        serializer = self.get_serializer(organization, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        plan_id = serializer.validated_data.pop("plan_id", None)
        billing_cycle = serializer.validated_data.pop("billing_cycle", None)
        organization = serializer.save()
        subscription = getattr(organization, "subscription", None)
        if plan_id:
            plan = Plan.objects.get(pk=plan_id)
            if subscription:
                subscription.plan = plan
            legacy_codes = {choice[0] for choice in Organization.Plan.choices}
            organization.plan = plan.code if plan.code in legacy_codes else Organization.Plan.FREE
            organization.save(update_fields=("plan", "updated_at"))
        if subscription and billing_cycle:
            subscription.billing_cycle = billing_cycle
        if subscription and (plan_id or billing_cycle):
            subscription.save(update_fields=("plan", "billing_cycle", "updated_at"))
        record_platform_action(
            request=request,
            action="organization.updated",
            organization=organization,
            object_type="Organization",
            object_id=organization.id,
            description="Cadastro da organização atualizado.",
        )
        result = self.get_queryset().get(pk=organization.pk)
        return Response(PlatformOrganizationDetailSerializer(result).data)

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

    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        organization = self.get_object()
        if not organization.is_active:
            return Response({"detail": "A organização já está arquivada."}, status=status.HTTP_400_BAD_REQUEST)
        organization.is_active = False
        organization.save(update_fields=("is_active", "updated_at"))
        User.objects.filter(organization=organization, is_active=True).update(
            session_version=F("session_version") + 1,
        )
        record_platform_action(
            request=request,
            action="organization.archived",
            organization=organization,
            object_type="Organization",
            object_id=organization.id,
            description="Organização arquivada sem exclusão dos dados.",
        )
        return Response({"detail": "Organização arquivada com sucesso."})


class PlatformDemoRequestViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = DemoRequestSerializer
    permission_classes = [IsPlatformStaff]
    search_fields = ("name", "email", "phone", "organization_name", "message")
    filterset_fields = ("status", "operation_profile")
    ordering_fields = ("created_at", "updated_at", "organization_name", "status")
    ordering = ("-created_at",)

    def get_queryset(self):
        return DemoRequest.objects.select_related("decided_by", "assigned_to").prefetch_related("appointments", "activities__actor")

    def get_permissions(self):
        if self.action in {"approve", "reject", "update_pipeline", "schedule"}:
            return [IsPlatformAdmin()]
        return super().get_permissions()

    def _decide(self, request, decision):
        demo_request = self.get_object()
        if demo_request.status not in {DemoRequest.Status.NEW, DemoRequest.Status.PENDING}:
            return Response(
                {"detail": "Esta solicitação já foi analisada."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = DemoRequestDecisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        demo_request.status = decision
        demo_request.decided_by = request.user
        demo_request.decided_at = timezone.now()
        demo_request.decision_notes = serializer.validated_data.get("notes", "")
        demo_request.save(update_fields=("status", "decided_by", "decided_at", "decision_notes", "updated_at"))
        record_platform_action(
            request=request,
            action=f"demo_request.{decision}",
            object_type="DemoRequest",
            object_id=demo_request.id,
            description=f"Solicitação de demonstração {demo_request.get_status_display().lower()}.",
            extra_data={"email": demo_request.email, "organization": demo_request.organization_name},
        )
        return Response(DemoRequestSerializer(demo_request).data)

    @action(detail=True, methods=["patch"], url_path="pipeline")
    @transaction.atomic
    def update_pipeline(self, request, pk=None):
        demo_request = self.get_object()
        serializer = DemoRequestPipelineSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        previous_status = demo_request.status
        for field, value in serializer.validated_data.items():
            setattr(demo_request, field, value)
        if demo_request.status == DemoRequest.Status.WON and not demo_request.converted_at:
            demo_request.converted_at = timezone.now()
        elif demo_request.status != DemoRequest.Status.WON:
            demo_request.converted_at = None
        demo_request.save()
        DemoRequestActivity.objects.create(
            demo_request=demo_request, actor=request.user, action="lead.pipeline_updated",
            description=f"Etapa alterada de {previous_status} para {demo_request.status}.",
            metadata={"previous_status": previous_status, "status": demo_request.status},
        )
        return Response(DemoRequestSerializer(demo_request, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def schedule(self, request, pk=None):
        demo_request = self.get_object()
        serializer = DemoAppointmentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        appointment = serializer.save(demo_request=demo_request, created_by=request.user)
        demo_request.status = DemoRequest.Status.SCHEDULED
        demo_request.next_action_at = appointment.starts_at
        demo_request.save(update_fields=("status", "next_action_at", "updated_at"))
        DemoRequestActivity.objects.create(
            demo_request=demo_request, actor=request.user, action="lead.demo_scheduled",
            description=f"Demonstração agendada para {appointment.starts_at.isoformat()}.",
            metadata={"appointment_id": str(appointment.id)},
        )
        send_mail(
            subject="Demonstração AgroManage agendada",
            message=(
                f"Olá, {demo_request.name}!\n\nSua demonstração foi agendada para "
                f"{timezone.localtime(appointment.starts_at).strftime('%d/%m/%Y às %H:%M')}.\n"
                f"Duração prevista: {appointment.duration_minutes} minutos.\n"
                f"Link: {appointment.meeting_url or 'Será enviado pela equipe.'}\n\nEquipe AgroManage"
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[demo_request.email],
            fail_silently=True,
        )
        return Response(DemoAppointmentSerializer(appointment).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def approve(self, request, pk=None):
        return self._decide(request, DemoRequest.Status.APPROVED)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def reject(self, request, pk=None):
        return self._decide(request, DemoRequest.Status.REJECTED)


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
            .exclude(affiliate_profile__portal_access_only=True)
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


class PlatformTeamViewSet(viewsets.ModelViewSet):
    """Manage the internal platform team without exposing customer accounts."""

    permission_classes = [IsPlatformAdmin]
    http_method_names = ("get", "post", "patch", "head", "options")
    lookup_field = "user_id"
    search_fields = ("user__full_name", "user__email")
    filterset_fields = ("role", "is_active", "mfa_required")
    ordering_fields = ("created_at", "updated_at", "role", "user__full_name")
    ordering = ("user__full_name",)

    def get_queryset(self):
        return PlatformStaffProfile.objects.select_related("user")

    def get_serializer_class(self):
        if self.action in {"create", "partial_update"}:
            return PlatformTeamMemberWriteSerializer
        return PlatformTeamMemberSerializer

    def _is_requester_owner(self):
        return self.request.user.platform_staff_profile.role == PlatformStaffProfile.Role.OWNER

    def _validate_owner_change(self, *, profile=None, new_role=None, blocking=False):
        affects_owner = profile and profile.role == PlatformStaffProfile.Role.OWNER
        assigning_owner = new_role == PlatformStaffProfile.Role.OWNER
        if (affects_owner or assigning_owner) and not self._is_requester_owner():
            return Response(
                {"detail": "Somente um proprietário pode gerenciar outro proprietário."},
                status=status.HTTP_403_FORBIDDEN,
            )
        removing_owner = affects_owner and (blocking or (new_role and new_role != PlatformStaffProfile.Role.OWNER))
        if removing_owner:
            other_active_owners = PlatformStaffProfile.objects.filter(
                role=PlatformStaffProfile.Role.OWNER,
                is_active=True,
                user__is_active=True,
            ).exclude(pk=profile.pk)
            if not other_active_owners.exists():
                return Response(
                    {"detail": "Não é possível remover ou bloquear o último proprietário ativo."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        return None

    @staticmethod
    def _revoke_sessions(user):
        for token in OutstandingToken.objects.filter(user=user):
            BlacklistedToken.objects.get_or_create(token=token)
        User.objects.filter(pk=user.pk).update(session_version=F("session_version") + 1)

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        owner_error = self._validate_owner_change(new_role=serializer.validated_data["role"])
        if owner_error:
            return owner_error
        password = serializer.validated_data.pop("initial_password")
        user = User.objects.create_user(
            email=serializer.validated_data["email"],
            password=password,
            full_name=serializer.validated_data["full_name"],
            is_staff=True,
            is_active=True,
            force_password_change=True,
        )
        profile = PlatformStaffProfile.objects.create(
            user=user,
            role=serializer.validated_data["role"],
            is_active=True,
            mfa_required=serializer.validated_data["mfa_required"],
        )
        record_platform_action(
            request=request,
            action="platform_team.created",
            object_type="PlatformStaffProfile",
            object_id=profile.id,
            description=f"Membro interno {user.email} cadastrado.",
            extra_data={"role": profile.role, "mfa_required": profile.mfa_required},
        )
        return Response(PlatformTeamMemberSerializer(profile).data, status=status.HTTP_201_CREATED)

    @transaction.atomic
    def partial_update(self, request, *args, **kwargs):
        profile = self.get_object()
        serializer = self.get_serializer(
            data=request.data,
            partial=True,
            context={
                "request": request,
                "is_update": True,
                "current_user_id": profile.user_id,
            },
        )
        serializer.is_valid(raise_exception=True)
        new_role = serializer.validated_data.get("role", profile.role)
        owner_error = self._validate_owner_change(profile=profile, new_role=new_role)
        if owner_error:
            return owner_error
        if profile.user_id == request.user.id and new_role != profile.role:
            return Response({"detail": "Você não pode alterar o próprio papel."}, status=status.HTTP_400_BAD_REQUEST)

        user = profile.user
        user.email = serializer.validated_data.get("email", user.email)
        user.full_name = serializer.validated_data.get("full_name", user.full_name)
        password = serializer.validated_data.get("initial_password")
        update_fields = ["email", "full_name", "updated_at"]
        if password:
            user.set_password(password)
            user.force_password_change = True
            update_fields.extend(("password", "force_password_change"))
        user.save(update_fields=update_fields)
        profile.role = new_role
        profile.mfa_required = serializer.validated_data.get("mfa_required", profile.mfa_required)
        profile.save(update_fields=("role", "mfa_required", "updated_at"))
        if password:
            self._revoke_sessions(user)
        record_platform_action(
            request=request,
            action="platform_team.updated",
            object_type="PlatformStaffProfile",
            object_id=profile.id,
            description=f"Membro interno {user.email} atualizado.",
            extra_data={"role": profile.role, "mfa_required": profile.mfa_required},
        )
        return Response(PlatformTeamMemberSerializer(profile).data)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def block(self, request, user_id=None):
        profile = self.get_object()
        if profile.user_id == request.user.id:
            return Response({"detail": "Você não pode bloquear a própria conta."}, status=status.HTTP_400_BAD_REQUEST)
        owner_error = self._validate_owner_change(profile=profile, blocking=True)
        if owner_error:
            return owner_error
        if not profile.is_active:
            return Response({"detail": "O membro já está bloqueado."}, status=status.HTTP_400_BAD_REQUEST)
        profile.is_active = False
        profile.save(update_fields=("is_active", "updated_at"))
        profile.user.is_active = False
        profile.user.save(update_fields=("is_active", "updated_at"))
        self._revoke_sessions(profile.user)
        record_platform_action(
            request=request, action="platform_team.blocked",
            object_type="PlatformStaffProfile", object_id=profile.id,
            description=f"Membro interno {profile.user.email} bloqueado.",
        )
        return Response({"detail": "Membro bloqueado com sucesso."})

    @action(detail=True, methods=["post"])
    def activate(self, request, user_id=None):
        profile = self.get_object()
        owner_error = self._validate_owner_change(profile=profile, new_role=profile.role)
        if owner_error:
            return owner_error
        profile.is_active = True
        profile.save(update_fields=("is_active", "updated_at"))
        profile.user.is_active = True
        profile.user.save(update_fields=("is_active", "updated_at"))
        record_platform_action(
            request=request, action="platform_team.activated",
            object_type="PlatformStaffProfile", object_id=profile.id,
            description=f"Membro interno {profile.user.email} reativado.",
        )
        return Response({"detail": "Membro reativado com sucesso."})

    @action(detail=True, methods=["post"], url_path="revoke-sessions")
    def revoke_sessions(self, request, user_id=None):
        profile = self.get_object()
        self._revoke_sessions(profile.user)
        record_platform_action(
            request=request, action="platform_team.sessions_revoked",
            object_type="PlatformStaffProfile", object_id=profile.id,
            description=f"Sessões de {profile.user.email} encerradas.",
        )
        return Response({"detail": "Sessões encerradas com sucesso."})


class PlatformAuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    """Immutable, filterable history of actions performed in the backoffice."""

    serializer_class = PlatformAuditLogSerializer
    permission_classes = [IsPlatformAuditor]
    search_fields = (
        "action", "description", "object_type", "object_id",
        "actor__full_name", "actor__email", "organization__name",
        "ip_address", "request_id",
    )
    ordering_fields = ("created_at", "action", "actor__full_name", "organization__name")
    ordering = ("-created_at",)
    filterset_fields = ("action", "actor", "organization", "object_type")
    http_method_names = ("get", "head", "options")

    def get_queryset(self):
        queryset = PlatformAuditLog.objects.select_related("actor", "organization")
        created_after = self.request.query_params.get("created_after")
        created_before = self.request.query_params.get("created_before")
        if created_after:
            queryset = queryset.filter(created_at__date__gte=created_after)
        if created_before:
            queryset = queryset.filter(created_at__date__lte=created_before)
        return queryset

    @action(detail=False, methods=["get"], url_path="options")
    def filter_options(self, request):
        queryset = self.filter_queryset(self.get_queryset())
        return Response({
            "actions": list(
                queryset.order_by("action").values_list("action", flat=True).distinct()
            ),
        })

    @staticmethod
    def _csv_value(value):
        text = "" if value is None else str(value)
        if text.startswith(("=", "+", "-", "@", "\t", "\r")):
            return f"'{text}"
        return text

    @action(detail=False, methods=["get"])
    def export(self, request):
        queryset = self.filter_queryset(self.get_queryset()).order_by("-created_at")[:10_000]
        response = HttpResponse(content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = 'attachment; filename="auditoria-plataforma.csv"'
        response.write("\ufeff")
        writer = csv.writer(response)
        writer.writerow([
            "Data", "Ação", "Ator", "E-mail", "Organização", "Descrição",
            "Tipo do objeto", "ID do objeto", "IP", "Request ID", "Dados adicionais",
        ])
        for log in queryset:
            writer.writerow([
                self._csv_value(timezone.localtime(log.created_at).isoformat()),
                self._csv_value(log.action),
                self._csv_value(log.actor.full_name if log.actor else ""),
                self._csv_value(log.actor.email if log.actor else ""),
                self._csv_value(log.organization.name if log.organization else ""),
                self._csv_value(log.description),
                self._csv_value(log.object_type),
                self._csv_value(log.object_id),
                self._csv_value(log.ip_address),
                self._csv_value(log.request_id),
                self._csv_value(json.dumps(log.extra_data, ensure_ascii=False, default=str)),
            ])
        record_platform_action(
            request=request,
            action="audit.exported",
            object_type="PlatformAuditLog",
            description="Relatório de auditoria exportado em CSV.",
            extra_data={"limit": 10_000},
        )
        return response


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
        if self.action in {"change_plan", "set_discount"}:
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

    @action(detail=True, methods=["post"], url_path="discount")
    @transaction.atomic
    def set_discount(self, request, pk=None):
        subscription = self.get_object()
        serializer = SubscriptionDiscountSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        previous = {
            "type": subscription.discount_type,
            "value": str(subscription.discount_value),
            "starts_at": subscription.discount_starts_at,
            "ends_at": subscription.discount_ends_at,
        }
        subscription.discount_type = data.get("discount_type", "")
        subscription.discount_value = data.get("discount_value", Decimal("0"))
        subscription.discount_starts_at = data.get("discount_starts_at")
        subscription.discount_ends_at = data.get("discount_ends_at")
        subscription.save(update_fields=[
            "discount_type", "discount_value", "discount_starts_at",
            "discount_ends_at", "updated_at",
        ])
        record_platform_action(
            request=request,
            action="subscription.discount_updated",
            organization=subscription.organization,
            object_type="Subscription",
            object_id=subscription.id,
            description="Desconto da assinatura atualizado.",
            extra_data={
                "previous": previous,
                "current": {
                    "type": subscription.discount_type,
                    "value": str(subscription.discount_value),
                    "starts_at": subscription.discount_starts_at,
                    "ends_at": subscription.discount_ends_at,
                },
            },
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
    search_fields = ("ticket_reference", "justification", "operator__full_name", "organization__name")
    filterset_fields = ("organization", "operator")
    ordering_fields = ("created_at", "expires_at", "last_used_at")
    http_method_names = ("get", "post", "head", "options")

    def get_queryset(self):
        qs = SupportAccessGrant.objects.select_related("operator", "organization")
        if self.request.user.platform_staff_profile.role == "platform_support":
            qs = qs.filter(operator=self.request.user)
        access_status = self.request.query_params.get("status")
        now = timezone.now()
        if access_status == "active":
            qs = qs.filter(revoked_at__isnull=True, expires_at__gt=now)
        elif access_status == "revoked":
            qs = qs.filter(revoked_at__isnull=False)
        elif access_status == "expired":
            qs = qs.filter(revoked_at__isnull=True, expires_at__lte=now)
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
            ticket_reference=serializer.validated_data["ticket_reference"],
            justification=serializer.validated_data["justification"],
            expires_at=timezone.now() + timedelta(minutes=duration),
        )
        token = self._issue_access_token(request.user, grant, timedelta(minutes=duration))
        record_platform_action(
            request=request, action="support_access.created", organization=organization,
            object_type="SupportAccessGrant", object_id=grant.id,
            description="Acesso assistido somente leitura iniciado.",
            extra_data={"ticket_reference": grant.ticket_reference, "justification": grant.justification, "expires_at": grant.expires_at.isoformat()},
        )
        return Response({"grant": SupportAccessGrantSerializer(grant).data, "access": str(token)}, status=status.HTTP_201_CREATED)

    @staticmethod
    def _issue_access_token(user, grant, lifetime):
        token = AccessToken.for_user(user)
        token["session_version"] = user.session_version
        token["support_grant_id"] = str(grant.id)
        token.set_exp(lifetime=lifetime)
        return token

    @action(detail=True, methods=["post"], url_path="open")
    def open_access(self, request, pk=None):
        grant = self.get_object()
        if grant.operator_id != request.user.id:
            return Response(
                {"detail": "Somente o responsável pelo acesso pode abri-lo."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if not grant.is_valid:
            return Response(
                {"detail": "O acesso está expirado ou foi revogado."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        lifetime = grant.expires_at - timezone.now()
        token = self._issue_access_token(request.user, grant, lifetime)
        record_platform_action(
            request=request, action="support_access.opened", organization=grant.organization,
            object_type="SupportAccessGrant", object_id=grant.id,
            description="Acesso assistido existente reaberto.",
        )
        return Response({"grant": SupportAccessGrantSerializer(grant).data, "access": str(token)})

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
