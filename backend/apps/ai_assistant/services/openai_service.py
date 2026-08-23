"""Backward-compatible imports for code that still references the old module."""

from .providers import (
    AIConfigurationError,
    AIProviderError,
    GeneratedAnswer,
    OpenAIProvider,
)


OpenAIRuralAssistant = OpenAIProvider

__all__ = (
    "AIConfigurationError",
    "AIProviderError",
    "GeneratedAnswer",
    "OpenAIRuralAssistant",
    "OpenAIProvider",
)
