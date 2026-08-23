from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Any

from django.db import transaction
from django.utils import timezone

from ..models import AIModel, AIModelSyncRun, AIProviderConfiguration
from .providers import AIProviderError, OpenCodeZenProvider, ProviderModel


OPENCODE_ZEN_PROVIDER_ID = "opencode_zen"
OPENCODE_ZEN_DISPLAY_NAME = "OpenCode Zen"
OPENCODE_ZEN_BASE_URL = "https://opencode.ai/zen/v1"
OPENCODE_ZEN_API_KEY_ENV_VAR = "OPENCODE_ZEN_API_KEY"


@dataclass(frozen=True)
class CatalogSyncResult:
    run_id: str
    models_found: int
    free_models_found: int
    models_created: int
    models_updated: int
    models_unavailable: int


def _decimal_price(value: Any):
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, str):
        normalized = value.strip().lower().replace("$", "").replace(",", ".")
        if normalized in {"free", "grátis", "gratis"}:
            return Decimal("0")
        value = normalized
    try:
        price = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return None
    return price if price >= 0 else None


def _pricing(metadata: dict):
    pricing = metadata.get("pricing") or metadata.get("price") or metadata.get("cost") or {}
    if not isinstance(pricing, dict):
        return None, None
    input_price = _decimal_price(
        pricing.get("input")
        if "input" in pricing
        else pricing.get("prompt", pricing.get("input_tokens"))
    )
    output_price = _decimal_price(
        pricing.get("output")
        if "output" in pricing
        else pricing.get("completion", pricing.get("output_tokens"))
    )
    return input_price, output_price


def _endpoint_type(metadata: dict):
    candidates = (
        metadata.get("endpoint"),
        metadata.get("endpoint_type"),
        metadata.get("api"),
    )
    value = " ".join(str(item).lower() for item in candidates if item)
    if "response" in value:
        return AIModel.EndpointType.RESPONSES
    return AIModel.EndpointType.CHAT_COMPLETIONS


def _capability(metadata: dict, capability: str):
    direct = metadata.get(f"supports_{capability}")
    if isinstance(direct, bool):
        return direct
    capabilities = metadata.get("capabilities") or []
    if isinstance(capabilities, dict):
        return bool(capabilities.get(capability))
    if isinstance(capabilities, list):
        return capability in {str(item).lower() for item in capabilities}
    return False


def _context_window(metadata: dict):
    value = metadata.get("context_window") or metadata.get("context_length")
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None


def get_or_create_opencode_zen_configuration():
    provider, _ = AIProviderConfiguration.objects.get_or_create(
        provider=OPENCODE_ZEN_PROVIDER_ID,
        defaults={
            "display_name": OPENCODE_ZEN_DISPLAY_NAME,
            "base_url": OPENCODE_ZEN_BASE_URL,
            "api_key_env_var": OPENCODE_ZEN_API_KEY_ENV_VAR,
            "is_enabled": True,
        },
    )
    return provider


def sync_opencode_zen_models(*, trigger=AIModelSyncRun.Trigger.MANUAL, provider_client=None):
    provider_config = get_or_create_opencode_zen_configuration()
    started_at = timezone.now()
    run = AIModelSyncRun.objects.create(
        provider=provider_config,
        status=AIModelSyncRun.Status.RUNNING,
        trigger=trigger,
        started_at=started_at,
    )

    try:
        catalog = (provider_client or OpenCodeZenProvider()).list_models()
        if not catalog:
            raise AIProviderError("O OpenCode Zen retornou um catálogo vazio.")
        result = _persist_catalog(provider_config, run, catalog)
    except Exception as exc:
        finished_at = timezone.now()
        AIModelSyncRun.objects.filter(pk=run.pk).update(
            status=AIModelSyncRun.Status.FAILURE,
            finished_at=finished_at,
            error_class=exc.__class__.__name__[:150],
            error_message=str(exc)[:4000],
        )
        AIProviderConfiguration.objects.filter(pk=provider_config.pk).update(
            last_health_check_at=finished_at,
            last_health_status=AIProviderConfiguration.HealthStatus.UNAVAILABLE,
            last_health_message="Falha ao consultar o catálogo de modelos.",
        )
        if isinstance(exc, AIProviderError):
            raise
        raise AIProviderError("Não foi possível sincronizar os modelos do OpenCode Zen.") from exc
    return result


@transaction.atomic
def _persist_catalog(provider_config, run, catalog: list[ProviderModel]):
    now = timezone.now()
    provider_config = AIProviderConfiguration.objects.select_for_update().get(pk=provider_config.pk)
    seen_ids = set()
    added_ids = []
    created_count = 0
    updated_count = 0
    free_count = 0

    for provider_model in catalog:
        external_id = provider_model.external_id.strip()
        if not external_id or external_id in seen_ids:
            continue
        seen_ids.add(external_id)
        metadata = provider_model.metadata or {}
        input_price, output_price = _pricing(metadata)
        is_free = input_price == 0 and output_price == 0
        free_count += int(is_free)
        defaults = {
            "display_name": provider_model.display_name or external_id,
            "endpoint_type": _endpoint_type(metadata),
            "is_free": is_free,
            "is_available": True,
            "input_price": input_price,
            "output_price": output_price,
            "supports_streaming": _capability(metadata, "streaming"),
            "supports_tools": _capability(metadata, "tools"),
            "context_window": _context_window(metadata),
            "metadata": metadata,
            "last_seen_at": now,
            "last_verified_at": now,
        }
        model, created = AIModel.objects.get_or_create(
            provider=provider_config,
            external_id=external_id,
            defaults={**defaults, "is_enabled": is_free, "first_seen_at": now},
        )
        if created:
            created_count += 1
            added_ids.append(external_id)
            continue
        for field, value in defaults.items():
            setattr(model, field, value)
        if not is_free:
            model.is_enabled = False
            model.is_primary = False
        model.save()
        updated_count += 1

    unavailable = list(
        AIModel.objects.filter(provider=provider_config, is_available=True)
        .exclude(external_id__in=seen_ids)
        .values_list("external_id", flat=True)
    )
    if unavailable:
        AIModel.objects.filter(provider=provider_config, external_id__in=unavailable).update(
            is_available=False,
            is_enabled=False,
            is_primary=False,
            last_verified_at=now,
            updated_at=now,
        )

    run.status = AIModelSyncRun.Status.SUCCESS
    run.finished_at = now
    run.models_found = len(seen_ids)
    run.free_models_found = free_count
    run.models_created = created_count
    run.models_updated = updated_count
    run.models_unavailable = len(unavailable)
    run.added_model_ids = added_ids
    run.unavailable_model_ids = unavailable
    run.response_summary = {
        "provider": OPENCODE_ZEN_PROVIDER_ID,
        "catalog_items": len(catalog),
        "unique_models": len(seen_ids),
    }
    run.save()
    provider_config.last_health_check_at = now
    provider_config.last_health_status = AIProviderConfiguration.HealthStatus.HEALTHY
    provider_config.last_health_message = "Catálogo consultado com sucesso."
    provider_config.save(
        update_fields=(
            "last_health_check_at", "last_health_status", "last_health_message", "updated_at"
        )
    )
    return CatalogSyncResult(
        run_id=str(run.id),
        models_found=run.models_found,
        free_models_found=run.free_models_found,
        models_created=run.models_created,
        models_updated=run.models_updated,
        models_unavailable=run.models_unavailable,
    )
