from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any


class AIConfigurationError(Exception):
    """Raised when the selected AI provider is not configured correctly."""


class AIProviderError(Exception):
    """Raised when an AI provider cannot complete a request."""


class AIProviderExhaustedError(AIProviderError):
    """Raised after every eligible model fails, with sanitized attempt metadata."""

    def __init__(self, message, *, attempts=()):
        super().__init__(message)
        self.attempts = tuple(attempts)


@dataclass(frozen=True)
class GeneratedAnswer:
    text: str
    response_id: str
    model: str
    input_tokens: int
    output_tokens: int
    latency_ms: int
    provider: str = ""
    attempts: tuple[dict[str, str], ...] = ()


@dataclass(frozen=True)
class ProviderModel:
    external_id: str
    display_name: str
    metadata: dict[str, Any]


class AIProvider(ABC):
    """Provider-neutral contract used by the rural assistant workflow."""

    provider_id: str

    @abstractmethod
    def moderate(self, text: str) -> dict:
        """Return at least ``flagged`` and ``categories`` for the supplied text."""

    @abstractmethod
    def generate(self, *, user, conversation, question: str, history, context="") -> GeneratedAnswer:
        """Generate an answer using the provider implementation."""

    def list_models(self) -> list[ProviderModel]:
        """Return the provider catalog when the provider exposes one."""
        raise AIProviderError(f'O provedor "{self.provider_id}" não expõe um catálogo de modelos.')
