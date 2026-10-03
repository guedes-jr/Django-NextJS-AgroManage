from datetime import timedelta

from django.conf import settings
from django.db.models import Avg, Count, Q, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone

from ..models import AIMessage, AIModel, AIModelSyncRun, AIProviderConfiguration


def consumption_aggregates():
    return {
        "requests": Count("id"), "answers": Count("id", filter=Q(status=AIMessage.Status.COMPLETED)),
        "blocked_answers": Count("id", filter=Q(status=AIMessage.Status.BLOCKED)),
        "input_tokens": Sum("input_tokens"), "output_tokens": Sum("output_tokens"),
        "cached_tokens": Sum("cached_tokens"), "reasoning_tokens": Sum("reasoning_tokens"),
        "known_cost": Sum("cost_usd"), "recorded_cost_requests": Count("cost_usd"),
        "reported_cost_usd": Sum("cost_usd", filter=Q(cost_source="reported")),
        "estimated_cost_usd": Sum("cost_usd", filter=Q(cost_source="estimated")),
        "zero_cost_requests": Count("id", filter=Q(cost_usd=0)),
        "paid_requests": Count("id", filter=Q(cost_usd__gt=0)),
    }


def consumption_row(row):
    result = {key: row.get(key) or 0 for key in (
        "requests", "answers", "blocked_answers", "input_tokens", "output_tokens",
        "cached_tokens", "reasoning_tokens", "recorded_cost_requests", "zero_cost_requests", "paid_requests",
    )}
    for key in ("cost_usd", "reported_cost_usd", "estimated_cost_usd"):
        source = "known_cost" if key == "cost_usd" else key
        result[key] = float(row[source]) if row.get(source) is not None else None
    result["unknown_cost_requests"] = result["requests"] - result["recorded_cost_requests"]
    return result


def get_ai_operations_snapshot(*, period_start):
    assistant_messages = AIMessage.objects.filter(
        created_at__date__gte=period_start,
        role=AIMessage.Role.ASSISTANT,
        status__in=[AIMessage.Status.COMPLETED, AIMessage.Status.BLOCKED],
    )
    usage_rows = [
        {
            **consumption_row(row),
            "provider": row["provider"] or "legacy",
            "model": row["model"] or "Não informado",
            "answers": row["answers"],
            "input_tokens": row["input_tokens"] or 0,
            "output_tokens": row["output_tokens"] or 0,
            "average_latency_ms": round(row["average_latency_ms"] or 0),
            "fallback_answers": row["fallback_answers"],
            "fallback_total": row["fallback_total"] or 0,
        }
        for row in assistant_messages.values("provider", "model").annotate(
            **consumption_aggregates(),
            average_latency_ms=Avg("latency_ms"),
            fallback_answers=Count("id", filter=Q(fallback_count__gt=0)),
            fallback_total=Sum("fallback_count"),
        ).order_by("-answers", "provider", "model")
    ]
    completed_messages = assistant_messages.filter(status=AIMessage.Status.COMPLETED)
    completed = completed_messages.count()
    fallback_answers = completed_messages.filter(fallback_count__gt=0).count()
    fallback_total = completed_messages.aggregate(total=Sum("fallback_count"))["total"] or 0
    consumption = consumption_row(assistant_messages.aggregate(**consumption_aggregates()))
    daily_usage = [
        {"date": row["date"].isoformat(), **consumption_row(row)}
        for row in assistant_messages.annotate(date=TruncDate("created_at")).values("date")
        .annotate(**consumption_aggregates()).order_by("-date")
    ]

    models = AIModel.objects.all()
    providers = AIProviderConfiguration.objects.all()
    default_provider = providers.filter(is_enabled=True, is_default=True).first()
    last_run = AIModelSyncRun.objects.order_by("-started_at").first()
    last_success = AIModelSyncRun.objects.filter(
        status=AIModelSyncRun.Status.SUCCESS
    ).order_by("-finished_at").first()
    stale_limit = timezone.now() - timedelta(days=settings.AI_MODEL_CATALOG_STALE_DAYS)
    catalog_stale = not last_success or not last_success.finished_at or last_success.finished_at < stale_limit
    available_free = models.filter(is_free=True, is_available=True).count()
    enabled_free = models.filter(
        is_free=True, is_available=True, is_enabled=True, provider__is_enabled=True
    ).count()
    primary_models = models.filter(
        is_primary=True, is_available=True, is_enabled=True, provider__is_enabled=True
    ).count()

    alerts = []
    if not providers.filter(is_enabled=True).exists():
        alerts.append({
            "code": "no_enabled_provider", "severity": "critical",
            "message": "Nenhum provedor de IA está habilitado.",
        })
    if available_free == 0:
        alerts.append({
            "code": "no_free_models", "severity": "critical",
            "message": "Nenhum modelo gratuito disponível foi encontrado no catálogo.",
        })
    elif enabled_free == 0:
        alerts.append({
            "code": "no_enabled_free_model", "severity": "warning",
            "message": "Existem modelos gratuitos, mas nenhum está habilitado para uso.",
        })
    if primary_models == 0:
        alerts.append({
            "code": "no_primary_model", "severity": "warning",
            "message": "Nenhum modelo principal válido está configurado.",
        })
    if catalog_stale:
        alerts.append({
            "code": "catalog_stale", "severity": "warning",
            "message": (
                f"O catálogo não possui sincronização válida nos últimos "
                f"{settings.AI_MODEL_CATALOG_STALE_DAYS} dias."
            ),
        })
    if last_run and last_run.status == AIModelSyncRun.Status.FAILURE:
        alerts.append({
            "code": "last_sync_failed", "severity": "warning",
            "message": "A última tentativa de sincronização do catálogo falhou.",
        })

    return {
        "catalog": {
            "providers": providers.count(),
            "enabled_providers": providers.filter(is_enabled=True).count(),
            "models": models.count(),
            "available_free_models": available_free,
            "enabled_free_models": enabled_free,
            "primary_models": primary_models,
            "is_stale": catalog_stale,
            "stale_after_days": settings.AI_MODEL_CATALOG_STALE_DAYS,
            "last_sync_at": last_run.finished_at.isoformat() if last_run and last_run.finished_at else None,
            "last_success_at": last_success.finished_at.isoformat() if last_success and last_success.finished_at else None,
        },
        "routing": {
            "completed_answers": completed,
            "fallback_answers": fallback_answers,
            "fallback_total": fallback_total,
            "fallback_rate": round(fallback_answers / completed * 100, 1) if completed else 0,
            "paid_fallback_allowed": default_provider.allow_paid_models
            if default_provider and default_provider.provider == "openrouter" else settings.AI_ALLOW_PAID_FALLBACK,
        },
        "model_usage": usage_rows,
        "consumption": consumption,
        "daily_usage": daily_usage,
        "alerts": alerts,
    }
