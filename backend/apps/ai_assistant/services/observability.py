from datetime import timedelta

from django.conf import settings
from django.db.models import Avg, Count, Q, Sum
from django.utils import timezone

from ..models import AIMessage, AIModel, AIModelSyncRun, AIProviderConfiguration


def get_ai_operations_snapshot(*, period_start):
    assistant_messages = AIMessage.objects.filter(
        created_at__date__gte=period_start,
        role=AIMessage.Role.ASSISTANT,
        status=AIMessage.Status.COMPLETED,
    )
    usage_rows = [
        {
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
            answers=Count("id"),
            input_tokens=Sum("input_tokens"),
            output_tokens=Sum("output_tokens"),
            average_latency_ms=Avg("latency_ms"),
            fallback_answers=Count("id", filter=Q(fallback_count__gt=0)),
            fallback_total=Sum("fallback_count"),
        ).order_by("-answers", "provider", "model")
    ]
    completed = assistant_messages.count()
    fallback_answers = assistant_messages.filter(fallback_count__gt=0).count()
    fallback_total = assistant_messages.aggregate(total=Sum("fallback_count"))["total"] or 0

    models = AIModel.objects.all()
    providers = AIProviderConfiguration.objects.all()
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
            "paid_fallback_allowed": settings.AI_ALLOW_PAID_FALLBACK,
        },
        "model_usage": usage_rows,
        "alerts": alerts,
    }
