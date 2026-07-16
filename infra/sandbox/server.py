"""Minimal, dependency-free execution service reachable only through a Unix socket."""

import hmac
import json
import os
import resource
import socketserver
import subprocess
import sys
import tempfile
from http.server import BaseHTTPRequestHandler


SOCKET_PATH = os.environ.get("SANDBOX_SOCKET", "/run/agromanage-sandbox/executor.sock")
AUTH_TOKEN = os.environ.get("SANDBOX_AUTH_TOKEN", "")
MAX_CODE_BYTES = 20_000
MAX_OUTPUT_BYTES = 64_000
TIMEOUT_SECONDS = 5


def _limit_process():
    resource.setrlimit(resource.RLIMIT_CPU, (3, 3))
    resource.setrlimit(resource.RLIMIT_AS, (256 * 1024 * 1024, 256 * 1024 * 1024))
    resource.setrlimit(resource.RLIMIT_FSIZE, (1024 * 1024, 1024 * 1024))
    resource.setrlimit(resource.RLIMIT_NOFILE, (32, 32))
    resource.setrlimit(resource.RLIMIT_NPROC, (16, 16))


def execute_python(code):
    if not isinstance(code, str) or not code.strip():
        raise ValueError("Código vazio.")
    encoded = code.encode("utf-8")
    if len(encoded) > MAX_CODE_BYTES:
        raise ValueError("Código excede 20 KB.")

    with tempfile.TemporaryDirectory(dir="/tmp") as workdir:
        try:
            completed = subprocess.run(
                [sys.executable, "-I", "-S", "-c", code],
                cwd=workdir,
                env={"PATH": "/usr/local/bin:/usr/bin:/bin", "HOME": workdir, "PYTHONIOENCODING": "utf-8"},
                stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=TIMEOUT_SECONDS,
                check=False,
                preexec_fn=_limit_process,
            )
        except subprocess.TimeoutExpired as exc:
            return {"status": "timeout", "exit_code": None, "stdout": _text(exc.stdout), "stderr": "Tempo limite excedido."}
    return {
        "status": "success" if completed.returncode == 0 else "error",
        "exit_code": completed.returncode,
        "stdout": _text(completed.stdout),
        "stderr": _text(completed.stderr),
    }


def _text(value):
    if not value:
        return ""
    return bytes(value)[:MAX_OUTPUT_BYTES].decode("utf-8", errors="replace")


class Handler(BaseHTTPRequestHandler):
    server_version = "AgroManageSandbox/1"

    def do_GET(self):
        if self.path != "/health":
            return self._send(404, {"detail": "Not found"})
        return self._send(200, {"status": "healthy", "executor": "python-isolated"})

    def do_POST(self):
        if self.path != "/execute":
            return self._send(404, {"detail": "Not found"})
        supplied = self.headers.get("Authorization", "").removeprefix("Bearer ")
        if not AUTH_TOKEN or not hmac.compare_digest(supplied, AUTH_TOKEN):
            return self._send(401, {"detail": "Unauthorized"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length < 1 or length > MAX_CODE_BYTES + 1024:
                raise ValueError("Payload inválido.")
            payload = json.loads(self.rfile.read(length))
            return self._send(200, execute_python(payload.get("code")))
        except (ValueError, json.JSONDecodeError) as exc:
            return self._send(400, {"detail": str(exc)})

    def _send(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_args):
        return


class UnixServer(socketserver.UnixStreamServer):
    allow_reuse_address = True


def main():
    if not AUTH_TOKEN or len(AUTH_TOKEN) < 32:
        raise SystemExit("SANDBOX_AUTH_TOKEN deve possuir ao menos 32 caracteres.")
    os.makedirs(os.path.dirname(SOCKET_PATH), exist_ok=True)
    if os.path.exists(SOCKET_PATH):
        os.unlink(SOCKET_PATH)
    with UnixServer(SOCKET_PATH, Handler) as server:
        os.chmod(SOCKET_PATH, 0o660)
        server.serve_forever()


if __name__ == "__main__":
    main()
