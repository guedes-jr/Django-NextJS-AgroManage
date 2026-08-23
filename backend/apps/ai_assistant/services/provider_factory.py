from django.conf import settings

from .providers import AIConfigurationError, OpenAIProvider, OpenCodeZenProvider
from .provider_router import AIProviderRouter


PROVIDER_FACTORIES = {
    "openai": OpenAIProvider,
    "opencode_zen": OpenCodeZenProvider,
}


def create_provider_client(provider_id, *, model=None, endpoint_type=None):
    """Build one concrete provider client for an explicit model."""
    selected_provider = provider_id
    factory = PROVIDER_FACTORIES.get(selected_provider)
    if factory is None:
        raise AIConfigurationError(
            f'O provedor de IA "{selected_provider}" não está disponível.'
        )
    if selected_provider == "opencode_zen":
        return factory(model=model, endpoint_type=endpoint_type)
    return factory(model=model)


def get_ai_provider(provider_id=None):
    """Return the catalog router, or a concrete provider when explicitly requested."""
    if provider_id is None:
        return AIProviderRouter()
    selected_provider = provider_id or settings.AI_DEFAULT_PROVIDER
    return create_provider_client(selected_provider)
