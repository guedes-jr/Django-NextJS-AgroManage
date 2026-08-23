import time

from django.conf import settings
from openai import OpenAI

from ..prompt import build_system_prompt
from .base import AIConfigurationError, AIProvider, AIProviderError, GeneratedAnswer, ProviderModel


class OpenCodeZenProvider(AIProvider):
    provider_id = "opencode_zen"

    def __init__(self, client=None, moderation_provider=None, model=None, endpoint_type=None):
        if client is None and not settings.OPENCODE_ZEN_API_KEY:
            raise AIConfigurationError(
                "A chave do OpenCode Zen ainda não foi configurada no servidor."
            )
        self.client = client or OpenAI(
            api_key=settings.OPENCODE_ZEN_API_KEY,
            base_url=settings.OPENCODE_ZEN_BASE_URL,
            timeout=settings.OPENCODE_ZEN_TIMEOUT_SECONDS,
            max_retries=2,
        )
        self.moderation_provider = moderation_provider
        self.model = model or settings.OPENCODE_ZEN_MODEL
        self.endpoint_type = endpoint_type or "chat_completions"

    @staticmethod
    def _message_content(content):
        if isinstance(content, str):
            return content.strip()
        if isinstance(content, list):
            parts = []
            for item in content:
                if isinstance(item, dict):
                    value = item.get("text") or item.get("content")
                else:
                    value = getattr(item, "text", None)
                if value:
                    parts.append(str(value))
            return "\n".join(parts).strip()
        return ""

    def moderate(self, text):
        # Zen does not currently document a moderation endpoint. When a dedicated
        # moderator is not configured, the view's local agricultural risk layer remains active.
        if self.moderation_provider is not None:
            return self.moderation_provider.moderate(text)
        return {
            "flagged": False,
            "categories": {},
            "mode": "local_only",
        }

    def generate(self, *, user, conversation, question, history, context=""):
        system_prompt = build_system_prompt(
            subject=getattr(conversation, "subject", "general"), authorized_context=context
        )
        if self.endpoint_type == "responses":
            return self._generate_response(
                question=question, history=history, system_prompt=system_prompt
            )
        messages = [{"role": "system", "content": system_prompt}]
        messages.extend(
            {"role": item.role, "content": item.content}
            for item in history
            if item.status == item.Status.COMPLETED
        )
        messages.append({"role": "user", "content": question})
        started = time.monotonic()
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                max_tokens=settings.OPENCODE_ZEN_MAX_OUTPUT_TOKENS,
            )
        except Exception as exc:
            raise AIProviderError("O OpenCode Zen está temporariamente indisponível.") from exc

        choices = getattr(response, "choices", None) or []
        content = self._message_content(choices[0].message.content) if choices else ""
        if not content:
            raise AIProviderError("O OpenCode Zen não retornou uma resposta válida.")
        usage = getattr(response, "usage", None)
        return GeneratedAnswer(
            text=content,
            response_id=getattr(response, "id", "") or "",
            model=getattr(response, "model", self.model),
            input_tokens=getattr(usage, "prompt_tokens", 0) if usage else 0,
            output_tokens=getattr(usage, "completion_tokens", 0) if usage else 0,
            latency_ms=round((time.monotonic() - started) * 1000),
            provider=self.provider_id,
        )

    def _generate_response(self, *, question, history, system_prompt):
        request_input = [
            {"role": item.role, "content": item.content}
            for item in history
            if item.status == item.Status.COMPLETED
        ]
        request_input.append({"role": "user", "content": question})
        started = time.monotonic()
        try:
            response = self.client.responses.create(
                model=self.model,
                instructions=system_prompt,
                input=request_input,
                max_output_tokens=settings.OPENCODE_ZEN_MAX_OUTPUT_TOKENS,
                store=False,
            )
        except Exception as exc:
            raise AIProviderError("O OpenCode Zen está temporariamente indisponível.") from exc
        text = (getattr(response, "output_text", "") or "").strip()
        if not text:
            raise AIProviderError("O OpenCode Zen não retornou uma resposta válida.")
        usage = getattr(response, "usage", None)
        return GeneratedAnswer(
            text=text,
            response_id=getattr(response, "id", "") or "",
            model=getattr(response, "model", self.model),
            input_tokens=getattr(usage, "input_tokens", 0) if usage else 0,
            output_tokens=getattr(usage, "output_tokens", 0) if usage else 0,
            latency_ms=round((time.monotonic() - started) * 1000),
            provider=self.provider_id,
        )

    def list_models(self):
        try:
            response = self.client.models.list()
        except Exception as exc:
            raise AIProviderError("Não foi possível consultar os modelos do OpenCode Zen.") from exc

        catalog = []
        for item in getattr(response, "data", []) or []:
            if hasattr(item, "model_dump"):
                metadata = item.model_dump(mode="json")
            elif isinstance(item, dict):
                metadata = dict(item)
            else:
                metadata = {
                    key: value for key, value in vars(item).items() if not key.startswith("_")
                }
            external_id = str(metadata.get("id") or getattr(item, "id", "")).strip()
            if not external_id:
                continue
            display_name = str(
                metadata.get("name") or metadata.get("display_name") or external_id
            ).strip()
            catalog.append(
                ProviderModel(
                    external_id=external_id,
                    display_name=display_name,
                    metadata=metadata,
                )
            )
        return catalog
