from decimal import Decimal, InvalidOperation

from ..models import AIModel, AIUsage
from .quota import add_token_usage


def value(obj, key, default=None):
    return obj.get(key, default) if isinstance(obj, dict) else getattr(obj, key, default)


def nonnegative_decimal(raw):
    if raw is None or isinstance(raw, bool):
        return None
    try:
        parsed = Decimal(str(raw))
        return parsed if parsed.is_finite() and 0 <= parsed < Decimal(1000000000) else None
    except (InvalidOperation, ValueError, TypeError):
        return None


def openrouter_cost(usage, *, model, input_tokens, output_tokens, cached_tokens):
    reported = nonnegative_decimal(value(usage, "cost"))
    if reported is not None:
        return reported, "reported"
    # Cache/reasoning and BYOK pricing can differ. Do not reconstruct a price
    # from today's catalogue when the actual charged usage cannot be established.
    if cached_tokens:
        return None, "unknown"
    catalog = AIModel.objects.filter(provider__provider="openrouter", external_id=model).first()
    if not catalog or catalog.input_price is None or catalog.output_price is None:
        return None, "unknown"
    pricing = value(catalog.metadata, "pricing", {}) or {}
    if not isinstance(pricing, dict):
        return None, "unknown"
    request_price = nonnegative_decimal(pricing.get("request", 0))
    if request_price is None:
        return None, "unknown"
    return catalog.input_price * input_tokens + catalog.output_price * output_tokens + request_price, "estimated"


def generation_metadata(answer):
    return {"cost_usd": answer.cost_usd, "cost_source": answer.cost_source,
            "cached_tokens": answer.cached_tokens, "reasoning_tokens": answer.reasoning_tokens,
            "requested_model": answer.requested_model}


def record_generation_usage(user, answer):
    from django.utils import timezone

    AIUsage.objects.get_or_create(
        organization=user.organization, user=user,
        period_start=timezone.localdate().replace(day=1),
    )
    add_token_usage(user, input_tokens=answer.input_tokens, output_tokens=answer.output_tokens,
                    estimated_cost_usd=answer.cost_usd or 0)
