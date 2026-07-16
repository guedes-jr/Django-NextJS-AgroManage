import http.client
import json
import socket

from django.conf import settings


class SandboxUnavailable(RuntimeError):
    pass


class UnixHTTPConnection(http.client.HTTPConnection):
    def __init__(self, socket_path, timeout):
        super().__init__("localhost", timeout=timeout)
        self.socket_path = socket_path

    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(self.timeout)
        self.sock.connect(self.socket_path)


class SandboxClient:
    def __init__(self, socket_path=None, token=None, timeout=None):
        self.socket_path = socket_path or settings.SANDBOX_EXECUTOR_SOCKET
        self.token = token if token is not None else settings.SANDBOX_EXECUTOR_TOKEN
        self.timeout = timeout or settings.SANDBOX_EXECUTOR_TIMEOUT
        if not self.socket_path.startswith("/"):
            raise SandboxUnavailable("O socket do sandbox deve usar um caminho absoluto.")
        if len(self.token) < 32:
            raise SandboxUnavailable("O token interno do sandbox não está configurado.")

    def execute(self, code):
        payload = json.dumps({"code": code}).encode("utf-8")
        connection = UnixHTTPConnection(self.socket_path, self.timeout)
        try:
            connection.request(
                "POST",
                "/execute",
                body=payload,
                headers={
                    "Authorization": f"Bearer {self.token}",
                    "Content-Type": "application/json",
                    "Content-Length": str(len(payload)),
                },
            )
            response = connection.getresponse()
            body = response.read(160_000)
        except (OSError, TimeoutError, http.client.HTTPException) as exc:
            raise SandboxUnavailable("O executor isolado está indisponível.") from exc
        finally:
            connection.close()
        try:
            data = json.loads(body)
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise SandboxUnavailable("O executor retornou uma resposta inválida.") from exc
        if response.status != 200:
            raise SandboxUnavailable(str(data.get("detail", "Falha no executor."))[:300])
        return data

    def health(self):
        connection = UnixHTTPConnection(self.socket_path, self.timeout)
        try:
            connection.request("GET", "/health")
            response = connection.getresponse()
            body = response.read(16_000)
        except (OSError, TimeoutError, http.client.HTTPException) as exc:
            raise SandboxUnavailable("O executor isolado está indisponível.") from exc
        finally:
            connection.close()
        try:
            data = json.loads(body)
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise SandboxUnavailable("O executor retornou uma resposta inválida.") from exc
        if response.status != 200 or data.get("status") != "healthy":
            raise SandboxUnavailable("O executor isolado não está saudável.")
        return data
