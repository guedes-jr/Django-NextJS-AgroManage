from dataclasses import dataclass, replace

from django.conf import settings
from django.db.models import Q

from ..models import AIModel
from .providers import AIConfigurationError, AIProvider, AIProviderError, AIProviderExhaustedError


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
        if not settings.AI_ALLOW_PAID_FALLBACK:
            queryset = queryset.filter(
                Q(is_free=True) | Q(provider__is_default=True, is_primary=True)
            )
        queryset = queryset.order_by(
            "-provider__is_default", "-is_primary", "priority", "display_name"
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
        catalog = self._catalog_candidates()
        if catalog:
            return catalog
        provider_id = settings.AI_DEFAULT_PROVIDER
        if provider_id == "opencode_zen":
            model_id = settings.OPENCODE_ZEN_MODEL
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
            except AIProviderError:
                attempts.append({**attempt, "status": "provider_error"})
                continue
            attempts.append({**attempt, "status": "completed"})
            return replace(
                answer,
                provider=answer.provider or candidate.provider_id,
                attempts=tuple(attempts),
            )
        raise AIProviderExhaustedError(
            "Nenhum modelo de IA disponível conseguiu concluir a resposta.",
            attempts=attempts,
        )
