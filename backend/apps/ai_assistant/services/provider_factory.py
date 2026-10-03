from django.conf import settings

from .provider_router import AIProviderRouter
from .providers import (
    AIConfigurationError,
    OpenAIProvider,
    OpenCodeZenProvider,
    OpenRouterProvider,
)

PROVIDER_FACTORIES = {
    "openai": OpenAIProvider,
    "opencode_zen": OpenCodeZenProvider,
    "openrouter": OpenRouterProvider,
}


def create_provider_client(provider_id, *, model=None, endpoint_type=None):
    """Build one concrete provider client for an explicit model."""
    selected_provider = provider_id
    factory = PROVIDER_FACTORIES.get(selected_provider)
    if factory is None:
        raise AIConfigurationError(
            f'O provedor de IA "{selected_provider}" não está disponível.'
        )
    if selected_provider in {"opencode_zen", "openrouter"}:
        from ..models import AIProviderConfiguration

        # OpenRouter settings saved by the admin take precedence over the environment.
        if selected_provider == "openrouter":
            configuration = AIProviderConfiguration.objects.filter(provider=selected_provider).first()
            api_key = (configuration.get_api_key() if configuration else "") or settings.OPENROUTER_API_KEY
            return factory(
                model=model, api_key=api_key,
                timeout=configuration.timeout_seconds if configuration else None,
                max_output_tokens=configuration.max_output_tokens if configuration else None,
                allow_paid_models=configuration.allow_paid_models if configuration else False,
            )
        api_key = settings.OPENCODE_ZEN_API_KEY
        if not api_key:
            configuration = AIProviderConfiguration.objects.filter(provider=selected_provider).first()
            api_key = configuration.get_api_key() if configuration else ""
        return factory(model=model, endpoint_type=endpoint_type, api_key=api_key)
    return factory(model=model)


def get_ai_provider(provider_id=None):
    """Return the catalog router, or a concrete provider when explicitly requested."""
    if provider_id is None:
        return AIProviderRouter()
    selected_provider = provider_id or settings.AI_DEFAULT_PROVIDER
    return create_provider_client(selected_provider)
