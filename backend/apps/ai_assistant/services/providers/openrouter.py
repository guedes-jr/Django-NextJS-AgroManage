import time

from django.conf import settings
from openai import OpenAI

from ..consumption import openrouter_cost, value
from ..prompt import build_system_prompt
from .base import (
    AIConfigurationError,
    AIProvider,
    AIProviderError,
    GeneratedAnswer,
    ProviderModel,
)


class OpenRouterProvider(AIProvider):
    provider_id = "openrouter"

    def __init__(
        self, client=None, model=None, endpoint_type=None, api_key=None, timeout=None,
        max_output_tokens=None, allow_paid_models=False,
    ):
        key = api_key or settings.OPENROUTER_API_KEY
        if client is None and not key:
            raise AIConfigurationError(
                "A chave do OpenRouter ainda não foi configurada. Peça ao administrador para configurá-la no painel de IA."
            )
        self.client = client or OpenAI(
            api_key=key,
            base_url=settings.OPENROUTER_BASE_URL,
            timeout=timeout or settings.OPENROUTER_TIMEOUT_SECONDS,
            max_retries=1,
            default_headers={"X-Title": "AgroManage"},
        )
        self.model = model or settings.OPENROUTER_MODEL
        self.max_output_tokens = max_output_tokens or settings.OPENROUTER_MAX_OUTPUT_TOKENS
        self.allow_paid_models = allow_paid_models

    def moderate(self, text):
        # OpenRouter has no OpenAI moderation endpoint. Keep the existing local
        # agricultural risk checks and system prompt active, as with Zen.
        return {"flagged": False, "categories": {}, "mode": "local_only"}

    @staticmethod
    def _error(exc):
        messages = {
            401: "A chave do OpenRouter é inválida. Peça ao administrador para atualizar a credencial.",
            402: "O OpenRouter informou saldo insuficiente para este modelo. Peça ao administrador para conferir o saldo ou escolher um modelo gratuito.",
            403: "O OpenRouter não autorizou o uso deste modelo. Peça ao administrador para conferir as permissões da conta.",
            429: "O limite de requisições do OpenRouter foi atingido. Tente novamente mais tarde.",
        }
        return AIProviderError(
            messages.get(
                getattr(exc, "status_code", None),
                "O OpenRouter está temporariamente indisponível.",
            )
        )

    def generate(self, *, user, conversation, question, history, context=""):
        messages = [
            {
                "role": "system",
                "content": build_system_prompt(
                    subject=getattr(conversation, "subject", "general"),
                    authorized_context=context,
                ),
            }
        ]
        messages.extend(
            {"role": item.role, "content": item.content}
            for item in history
            if item.status == item.Status.COMPLETED
        )
        messages.append({"role": "user", "content": question})
        started = time.monotonic()
        extra_body = {"usage": {"include": True}}
        if not self.allow_paid_models:
            extra_body["provider"] = {"max_price": {"prompt": 0, "completion": 0}}
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                max_tokens=self.max_output_tokens,
                extra_body=extra_body,
            )
        except Exception as exc:
            raise self._error(exc) from exc
        choices = getattr(response, "choices", None) or []
        content = choices[0].message.content if choices else None
        if not isinstance(content, str) or not content.strip():
            raise AIProviderError("O OpenRouter não retornou uma resposta válida.")
        usage = getattr(response, "usage", None)
        input_tokens = value(usage, "prompt_tokens", 0) or 0
        output_tokens = value(usage, "completion_tokens", 0) or 0
        cached_tokens = value(value(usage, "prompt_tokens_details"), "cached_tokens", 0) or 0
        reasoning_tokens = value(value(usage, "completion_tokens_details"), "reasoning_tokens", 0) or 0
        cost, cost_source = openrouter_cost(
            usage, model=self.model, input_tokens=input_tokens,
            output_tokens=output_tokens, cached_tokens=cached_tokens,
        )
        return GeneratedAnswer(
            text=content.strip(),
            response_id=getattr(response, "id", "") or "",
            model=getattr(response, "model", None) or self.model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            latency_ms=round((time.monotonic() - started) * 1000),
            provider=self.provider_id,
            cost_usd=cost, cost_source=cost_source, cached_tokens=cached_tokens,
            reasoning_tokens=reasoning_tokens, requested_model=self.model,
        )

    def list_models(self):
        try:
            response = self.client.models.list()
        except Exception as exc:
            raise self._error(exc) from exc
        models = []
        for item in getattr(response, "data", []) or []:
            metadata = item if isinstance(item, dict) else item.model_dump(mode="json")
            architecture = metadata.get("architecture") or {}
            if "text" not in architecture.get("output_modalities", ["text"]) or "text" not in architecture.get("input_modalities", ["text"]):
                continue
            external_id = str(metadata.get("id") or "").strip()
            if not external_id:
                continue
            metadata = {
                **metadata,
                "endpoint_type": "chat_completions",
                "supports_streaming": True,
                "supports_tools": "tools"
                in (metadata.get("supported_parameters") or []),
            }
            models.append(
                ProviderModel(
                    external_id, metadata.get("name") or external_id, metadata
                )
            )
        return models
