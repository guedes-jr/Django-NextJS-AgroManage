"""Shared WPPConnect transport for pairing and notification delivery."""
import errno
import json
import socket
import ssl
from urllib import error as urlerror, request as urlrequest
from urllib.parse import urlsplit

from django.conf import settings


def is_configured():
    return bool(settings.WPP_CONNECT_URL and settings.WPP_CONNECT_SESSION and (settings.WPP_CONNECT_TOKEN or settings.WPP_CONNECT_SECRET))


def is_connected(data):
    return data.get("status") is True or data.get("status") in ("CONNECTED", "isLogged")


def _connection_error(exc):
    """Report actionable errors without exposing URLs, tokens or raw responses."""
    reason = exc.reason if isinstance(exc, urlerror.URLError) else exc
    if isinstance(reason, TimeoutError):
        return "O WPPConnect demorou para responder. Aguarde e atualize o status antes de tentar novamente."
    if isinstance(reason, socket.gaierror):
        return "O endereço do WPPConnect não foi encontrado. Verifique WPP_CONNECT_URL e o DNS do servidor."
    if isinstance(reason, ssl.SSLError):
        return "Falha na conexão segura com o WPPConnect. Verifique o certificado HTTPS do serviço."
    if isinstance(reason, ConnectionRefusedError) or getattr(reason, "errno", None) == errno.ECONNREFUSED:
        return "O serviço WPPConnect recusou a conexão. Verifique se está em execução e se a porta configurada está acessível pelo backend."
    return "Não foi possível alcançar o WPPConnect. Verifique o serviço, a rede e WPP_CONNECT_URL."


def _http_error(code, authenticating=False):
    if code in (401, 403):
        return "O WPPConnect recusou a autenticação. Verifique WPP_CONNECT_SECRET ou WPP_CONNECT_TOKEN e a sessão configurada."
    if code == 404:
        return "A rota do WPPConnect não foi encontrada (HTTP 404). Confira WPP_CONNECT_URL e a compatibilidade da API do serviço."
    if code == 429:
        return "O WPPConnect limitou as tentativas de conexão (HTTP 429). Aguarde antes de tentar novamente."
    if code >= 500:
        return f"O serviço WPPConnect apresentou um erro interno (HTTP {code}). Verifique os logs do serviço no servidor."
    if authenticating:
        return f"Não foi possível autenticar no WPPConnect (HTTP {code}). Verifique a chave secreta e a sessão configurada."
    return f"WhatsApp Web respondeu HTTP {code}."


def wpp_request(path, method="GET", payload=None):
    base_url = getattr(settings, "WPP_CONNECT_URL", "").rstrip("/")
    token = getattr(settings, "WPP_CONNECT_TOKEN", "")
    secret = getattr(settings, "WPP_CONNECT_SECRET", "")
    session = getattr(settings, "WPP_CONNECT_SESSION", "")
    if not base_url or not session or (not token and not secret):
        return None, "WhatsApp Web não está configurado no servidor. Configure WPP_CONNECT_URL, WPP_CONNECT_SESSION e WPP_CONNECT_SECRET ou WPP_CONNECT_TOKEN no backend."
    try:
        parsed_url = urlsplit(base_url)
        valid_url = parsed_url.scheme in ("http", "https") and bool(parsed_url.hostname)
        parsed_url.port  # Validate the configured port without exposing the URL.
    except ValueError:
        valid_url = False
    if not valid_url:
        return None, "WPP_CONNECT_URL inválida. Configure um endereço HTTP ou HTTPS válido para o serviço."
    timeout = getattr(settings, "WPP_CONNECT_TIMEOUT_SECONDS", 15)
    if secret:
        try:
            generated = urlrequest.Request(f"{base_url}/api/{session}/{secret}/generate-token", method="POST")
            with urlrequest.urlopen(generated, timeout=timeout) as response:
                token = json.loads(response.read().decode())["token"]
            if not isinstance(token, str) or not token.strip():
                return None, "O WPPConnect não retornou um token válido. Verifique a chave secreta e a versão do serviço."
        except urlerror.HTTPError as exc:
            return None, _http_error(exc.code, authenticating=True)
        except (urlerror.URLError, TimeoutError, ConnectionError) as exc:
            return None, _connection_error(exc)
        except (ValueError, KeyError, TypeError):
            return None, "Resposta de autenticação inválida do WPPConnect. Verifique o endereço e a versão do serviço."
    outbound = urlrequest.Request(f"{base_url}/api/{session}/{path}", data=json.dumps(payload).encode() if payload is not None else None, headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"}, method=method)
    try:
        with urlrequest.urlopen(outbound, timeout=timeout) as response:
            data = json.loads(response.read().decode())
            if not isinstance(data, dict):
                return None, "Resposta inválida do WhatsApp Web."
            if path in ("send-message", "start-session", "close-session", "logout-session") and (
                data.get("status") is False
                or str(data.get("status", "")).lower() == "error"
                or data.get("response") is False
            ):
                detail = "O WhatsApp Web recusou o envio da mensagem." if path == "send-message" else "O WhatsApp Web não conseguiu concluir a operação da sessão. Verifique os logs do WPPConnect no servidor."
                return None, detail
            return data, None
    except urlerror.HTTPError as exc:
        return None, _http_error(exc.code)
    except (urlerror.URLError, TimeoutError, ConnectionError) as exc:
        return None, _connection_error(exc)
    except ValueError:
        return None, "O WPPConnect retornou uma resposta inválida. Verifique o endereço e a compatibilidade da API do serviço."
