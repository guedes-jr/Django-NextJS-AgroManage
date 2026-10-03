from dataclasses import dataclass, replace

from django.conf import settings
from django.db.models import Case, IntegerField, Q, Value, When

from ..models import AIModel, AIProviderConfiguration
from .providers import (
    AIConfigurationError,
    AIFreeTierRestrictionError,
    AIProvider,
    AIProviderError,
    AIProviderExhaustedError,
)


@dataclass(frozen=True)
class ModelCandidate:
    provider_id: str
    model_id: str
    endpoint_type: str
    is_free: bool


class AIProviderRouter(AIProvider):
    provider_id = "router"

    def _catalog_candidates(self):
        queryset = AIModel.objects.select_related("provider").filter(
            provider__is_enabled=True,
            is_enabled=True,
            is_available=True,
        )
        other_paid = ~Q(provider__provider="openrouter")
        if not settings.AI_ALLOW_PAID_FALLBACK:
            other_paid &= Q(provider__is_default=True, is_primary=True)
        queryset = queryset.filter(
            Q(is_free=True) | Q(provider__provider="openrouter", provider__allow_paid_models=True) | other_paid
        ).annotate(free_order=Case(
            When(provider__provider="openrouter", provider__prefer_free_models=True, is_free=False, then=Value(1)),
            default=Value(0), output_field=IntegerField(),
        )).order_by(
            "-provider__is_default", "free_order", "-is_primary", "priority", "display_name"
        )
        return [
            ModelCandidate(
                provider_id=model.provider.provider,
                model_id=model.external_id,
                endpoint_type=model.endpoint_type,
                is_free=model.is_free,
            )
            for model in queryset
        ]

    def _candidates(self):
        default = AIProviderConfiguration.objects.filter(is_default=True, is_enabled=True).first()
        catalog = self._catalog_candidates()
        if catalog:
            if default and default.provider == "openrouter":
                limited = catalog[:default.max_model_attempts]
                # An explicitly allowed paid fallback gets the last available
                # attempt, after free alternatives, within the configured cap.
                if default.prefer_free_models and default.allow_paid_models and len(limited) > 1 and all(item.is_free for item in limited):
                    paid = next((item for item in catalog if item.provider_id == "openrouter" and not item.is_free), None)
                    if paid:
                        limited[-1] = paid
                return limited
            return catalog
        provider_id = default.provider if default else settings.AI_DEFAULT_PROVIDER
        if provider_id == "opencode_zen":
            model_id = settings.OPENCODE_ZEN_MODEL
            endpoint_type = "chat_completions"
        elif provider_id == "openrouter":
            model_id = settings.OPENROUTER_MODEL if default and default.allow_paid_models else "openrouter/free"
            endpoint_type = "chat_completions"
        else:
            model_id = settings.OPENAI_AI_MODEL
            endpoint_type = "responses"
        return [ModelCandidate(provider_id, model_id, endpoint_type, False)]

    @staticmethod
    def _client(candidate):
        # Local import avoids a factory/router import cycle.
        from .provider_factory import create_provider_client

        return create_provider_client(
            candidate.provider_id,
            model=candidate.model_id,
            endpoint_type=candidate.endpoint_type,
        )

    def moderate(self, text):
        configuration_errors = []
        provider_errors = []
        for candidate in self._candidates():
            try:
                return self._client(candidate).moderate(text)
            except AIConfigurationError as exc:
                configuration_errors.append(str(exc))
            except AIProviderError as exc:
                provider_errors.append(str(exc))
        if provider_errors:
            raise AIProviderError("Nenhum provedor conseguiu executar a verificação de segurança.")
        if configuration_errors:
            raise AIConfigurationError("Nenhum provedor de IA habilitado possui credenciais válidas.")
        raise AIConfigurationError("Nenhum modelo de IA está disponível.")

    def generate(self, *, user, conversation, question, history, context=""):
        attempts = []
        restricted_attempts = 0
        for candidate in self._candidates():
            attempt = {"provider": candidate.provider_id, "model": candidate.model_id}
            try:
                client = self._client(candidate)
                answer = client.generate(
                    user=user,
                    conversation=conversation,
                    question=question,
                    history=history,
                    context=context,
                )
            except AIConfigurationError:
                attempts.append({**attempt, "status": "configuration_error"})
                continue
            except AIProviderError as exc:
                if isinstance(exc, AIFreeTierRestrictionError):
                    restricted_attempts += 1
                attempts.append({**attempt, "status": "provider_error"})
                continue
            attempts.append({**attempt, "status": "completed"})
            return replace(
                answer,
                provider=answer.provider or candidate.provider_id,
                attempts=tuple(attempts),
            )
        raise AIProviderExhaustedError(
            AIFreeTierRestrictionError.message
            if restricted_attempts and restricted_attempts == len(attempts)
            else "Nenhum modelo de IA disponível conseguiu concluir a resposta.",
            attempts=attempts,
        )
