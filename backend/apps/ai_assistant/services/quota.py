from dataclasses import asdict, dataclass
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from apps.billing.models import PlanEntitlement
from apps.ai_assistant.models import AIUsage


AI_FEATURE_CODE = "ai-assistant"
CUSTOM_LIMIT_KEY = "ai_questions_per_month"
CUSTOM_ENABLED_KEY = "ai_enabled"


class AIDisabledError(Exception):
    pass


class AIQuotaExceededError(Exception):
    pass


@dataclass(frozen=True)
class AIQuota:
    enabled: bool
    used: int
    limit: int | None
    remaining: int | None
    period_start: str
    renews_at: str

    def to_dict(self):
        return asdict(self)


def _period_dates():
    today = timezone.localdate()
    start = today.replace(day=1)
    if today.month == 12:
        renewal = today.replace(year=today.year + 1, month=1, day=1)
    else:
        renewal = today.replace(month=today.month + 1, day=1)
    return start, renewal


def _subscription_rules(organization):
    subscription = getattr(organization, "subscription", None)
    if not subscription or subscription.status not in {"active", "trialing"}:
        return False, 0
    entitlement = PlanEntitlement.objects.filter(
        plan=subscription.plan, feature__code=AI_FEATURE_CODE, feature__is_active=True
    ).first()
    enabled = bool(entitlement and entitlement.is_enabled)
    limit = entitlement.limit_value if entitlement else 0
    custom_limit = subscription.custom_limits.get(CUSTOM_LIMIT_KEY)
    if custom_limit is not None:
        limit = max(int(custom_limit), 0)
        enabled = limit > 0
    custom_enabled = subscription.custom_limits.get(CUSTOM_ENABLED_KEY)
    if custom_enabled is not None:
        enabled = bool(custom_enabled) and (limit is None or limit > 0)
    return enabled, limit


def get_organization_ai_rules(organization):
    """Public read-only projection used by the platform backoffice."""
    enabled, limit = _subscription_rules(organization)
    return {"enabled": enabled, "limit": limit}


def get_ai_quota(user):
    organization = user.organization
    start, renewal = _period_dates()
    enabled, limit = _subscription_rules(organization)
    used = AIUsage.objects.filter(
        organization=organization, user=user, period_start=start
    ).values_list("questions_used", flat=True).first() or 0
    remaining = None if limit is None else max(limit - used, 0)
    return AIQuota(enabled, used, limit, remaining, start.isoformat(), renewal.isoformat())


@transaction.atomic
def consume_question(user, *, input_tokens=0, output_tokens=0, estimated_cost_usd=0):
    organization = user.organization
    start, renewal = _period_dates()
    enabled, limit = _subscription_rules(organization)
    if not enabled:
        raise AIDisabledError("O Assistente IA não está disponível neste plano.")
    usage, _ = AIUsage.objects.select_for_update().get_or_create(
        organization=organization, user=user, period_start=start
    )
    if limit is not None and usage.questions_used >= limit:
        raise AIQuotaExceededError("A franquia mensal de perguntas foi atingida.")
    usage.questions_used += 1
    usage.input_tokens += max(int(input_tokens), 0)
    usage.output_tokens += max(int(output_tokens), 0)
    usage.estimated_cost_usd += Decimal(str(estimated_cost_usd))
    usage.save(update_fields=(
        "questions_used", "input_tokens", "output_tokens", "estimated_cost_usd", "updated_at"
    ))
    remaining = None if limit is None else max(limit - usage.questions_used, 0)
    return AIQuota(True, usage.questions_used, limit, remaining, start.isoformat(), renewal.isoformat())


@transaction.atomic
def add_token_usage(user, *, input_tokens=0, output_tokens=0, estimated_cost_usd=0):
    start, _ = _period_dates()
    usage = AIUsage.objects.select_for_update().get(
        organization=user.organization, user=user, period_start=start
    )
    usage.input_tokens += max(int(input_tokens), 0)
    usage.output_tokens += max(int(output_tokens), 0)
    usage.estimated_cost_usd += Decimal(str(estimated_cost_usd))
    usage.save(update_fields=("input_tokens", "output_tokens", "estimated_cost_usd", "updated_at"))


@transaction.atomic
def release_question(user):
    start, _ = _period_dates()
    usage = AIUsage.objects.select_for_update().filter(
        organization=user.organization, user=user, period_start=start
    ).first()
    if usage and usage.questions_used > 0:
        usage.questions_used -= 1
        usage.save(update_fields=("questions_used", "updated_at"))
