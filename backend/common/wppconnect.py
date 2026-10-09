"""Shared WPPConnect transport for pairing and notification delivery."""
import json
from urllib import error as urlerror, request as urlrequest

from django.conf import settings


def is_configured():
    return bool(settings.WPP_CONNECT_URL and settings.WPP_CONNECT_SESSION and (settings.WPP_CONNECT_TOKEN or settings.WPP_CONNECT_SECRET))


def is_connected(data):
    return data.get("status") is True or data.get("status") in ("CONNECTED", "isLogged")


def wpp_request(path, method="GET", payload=None):
    base_url = getattr(settings, "WPP_CONNECT_URL", "").rstrip("/")
    token = getattr(settings, "WPP_CONNECT_TOKEN", "")
    secret = getattr(settings, "WPP_CONNECT_SECRET", "")
    session = getattr(settings, "WPP_CONNECT_SESSION", "")
    if not base_url or not session or (not token and not secret):
        return None, "WhatsApp Web não está configurado no servidor."
    if secret:
        try:
            generated = urlrequest.Request(f"{base_url}/api/{session}/{secret}/generate-token", method="POST")
            with urlrequest.urlopen(generated, timeout=getattr(settings, "WPP_CONNECT_TIMEOUT_SECONDS", 15)) as response:
                token = json.loads(response.read().decode())["token"]
        except (urlerror.URLError, ValueError, KeyError, TypeError, TimeoutError):
            return None, "Não foi possível autenticar no WhatsApp Web."
    outbound = urlrequest.Request(f"{base_url}/api/{session}/{path}", data=json.dumps(payload).encode() if payload is not None else None, headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"}, method=method)
    try:
        with urlrequest.urlopen(outbound, timeout=getattr(settings, "WPP_CONNECT_TIMEOUT_SECONDS", 15)) as response:
            data = json.loads(response.read().decode())
            if not isinstance(data, dict):
                return None, "Resposta inválida do WhatsApp Web."
            if path == "send-message" and (data.get("status") is False or data.get("status") in ("error", "ERROR") or data.get("response") is False):
                return None, "O WhatsApp Web recusou o envio da mensagem."
            return data, None
    except urlerror.HTTPError as exc:
        return None, f"WhatsApp Web respondeu HTTP {exc.code}."
    except (urlerror.URLError, ValueError, TimeoutError):
        return None, "Não foi possível comunicar com o WhatsApp Web."

