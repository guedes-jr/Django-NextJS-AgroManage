"""Validation helpers for Google Identity Services credentials."""
import logging

from django.conf import settings


logger = logging.getLogger(__name__)


class GoogleOAuthError(Exception):
    """Raised when Google returns an invalid or untrusted identity."""


class GoogleOAuthConfigurationError(Exception):
    """Raised when Google authentication is not configured on the server."""


def verify_google_credential(credential: str) -> dict[str, str]:
    client_id = settings.GOOGLE_OAUTH_CLIENT_ID.strip()
    if not client_id:
        raise GoogleOAuthConfigurationError("Login com Google não configurado no servidor.")
    if not credential:
        raise GoogleOAuthError("Credencial do Google não informada.")

    try:
        from google.auth.transport import requests as google_requests
        from google.oauth2 import id_token
    except ImportError as exc:  # pragma: no cover - protected by deployment dependencies
        logger.exception("google-auth is not installed in the backend environment")
        raise GoogleOAuthConfigurationError(
            "Login com Google temporariamente indisponível. Tente novamente em instantes."
        ) from exc

    try:
        payload = id_token.verify_oauth2_token(
            credential,
            google_requests.Request(),
            client_id,
        )
    except ValueError as exc:
        raise GoogleOAuthError("Credencial do Google inválida ou expirada.") from exc

    email = str(payload.get("email") or "").strip().lower()
    if not email or payload.get("email_verified") is not True:
        raise GoogleOAuthError("O Google não confirmou este endereço de e-mail.")

    return {
        "sub": str(payload.get("sub") or ""),
        "email": email,
        "name": str(payload.get("name") or email.split("@", 1)[0]).strip(),
    }
