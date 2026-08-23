import hashlib
import time

from django.conf import settings
from openai import OpenAI

from ..prompt import build_system_prompt
from .base import AIConfigurationError, AIProvider, AIProviderError, GeneratedAnswer


class OpenAIProvider(AIProvider):
    provider_id = "openai"

    def __init__(self, client=None, model=None):
        if client is None and not settings.OPENAI_API_KEY:
            raise AIConfigurationError("A chave da OpenAI ainda não foi configurada no servidor.")
        self.client = client or OpenAI(
            api_key=settings.OPENAI_API_KEY,
            timeout=settings.OPENAI_AI_TIMEOUT_SECONDS,
            max_retries=2,
        )
        self.model = model or settings.OPENAI_AI_MODEL

    @staticmethod
    def safety_identifier(user):
        raw = f"agromanage:{user.organization_id}:{user.id}".encode()
        return hashlib.sha256(raw).hexdigest()

    def moderate(self, text):
        try:
            result = self.client.moderations.create(
                model="omni-moderation-latest", input=text
            ).results[0]
        except Exception as exc:
            raise AIProviderError("Não foi possível executar a verificação de segurança.") from exc
        categories = result.categories.model_dump() if hasattr(result.categories, "model_dump") else {}
        return {"flagged": bool(result.flagged), "categories": categories}

    def generate(self, *, user, conversation, question, history, context=""):
        request_input = [
            {"role": item.role, "content": item.content}
            for item in history
            if item.status == item.Status.COMPLETED
        ]
        request_input.append({"role": "user", "content": question})
        params = {
            "model": self.model,
            "instructions": build_system_prompt(
                subject=getattr(conversation, "subject", "general"), authorized_context=context
            ),
            "input": request_input,
            "max_output_tokens": settings.OPENAI_AI_MAX_OUTPUT_TOKENS,
            "safety_identifier": self.safety_identifier(user),
            "store": settings.OPENAI_AI_STORE_RESPONSES,
            "text": {"verbosity": "medium"},
        }
        if settings.OPENAI_AI_STORE_RESPONSES and conversation.openai_previous_response_id:
            params["previous_response_id"] = conversation.openai_previous_response_id
            params["input"] = question
        started = time.monotonic()
        try:
            response = self.client.responses.create(**params)
        except Exception as exc:
            raise AIProviderError("O serviço de IA está temporariamente indisponível.") from exc
        text = (response.output_text or "").strip()
        if not text:
            raise AIProviderError("A IA não retornou uma resposta válida.")
        usage = getattr(response, "usage", None)
        return GeneratedAnswer(
            text=text,
            response_id=response.id,
            model=getattr(response, "model", self.model),
            input_tokens=getattr(usage, "input_tokens", 0) if usage else 0,
            output_tokens=getattr(usage, "output_tokens", 0) if usage else 0,
            latency_ms=round((time.monotonic() - started) * 1000),
            provider=self.provider_id,
        )
