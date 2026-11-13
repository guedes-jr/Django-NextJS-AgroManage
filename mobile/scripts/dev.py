#!/usr/bin/env python3
"""Local Django + Expo supervisor. No installs, migrations or environment-file writes."""
from __future__ import annotations

import argparse
import os
import shutil
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import urlsplit

MOBILE_DIR = Path(__file__).resolve().parents[1]
ROOT_DIR = MOBILE_DIR.parent


def port_number(value: str) -> int:
    number = int(value)
    if not 1 <= number <= 65535:
        raise argparse.ArgumentTypeError("A porta deve estar entre 1 e 65535.")
    return number


def api_url(host: str, port: int, override: str | None) -> str:
    value = override if override is not None else f"http://{host}:{port}/api/v1/"
    parsed = urlsplit(value)
    if (parsed.scheme not in {"http", "https"} or not parsed.hostname
            or parsed.username or parsed.password or parsed.query or parsed.fragment):
        raise ValueError("EXPO_PUBLIC_API_URL inválida: use URL HTTP(S) absoluta sem credenciais ou parâmetros.")
    if parsed.hostname in {"0.0.0.0", "::"}:
        raise ValueError("API_HOST deve ser um endereço acessível pelo cliente, não um endereço de bind.")
    return value.rstrip("/") + "/"


def ensure_port_available(host: str, port: int) -> None:
    # A wildcard bind can coexist with an older loopback listener on macOS.
    # Check the address used for readiness before accepting a new bind.
    connect_host = "127.0.0.1" if host == "0.0.0.0" else host
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as connection:
        connection.settimeout(0.25)
        if connection.connect_ex((connect_host, port)) == 0:
            raise ValueError(f"Porta {port} indisponível. Encerre o serviço existente ou escolha outra porta.")
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            probe.bind((host, port))
        except OSError as error:
            raise ValueError(f"Porta {port} indisponível. Encerre o serviço existente ou escolha outra porta.") from error


def ensure_ngrok_available(mobile_dir: Path) -> None:
    """Fail locally before Expo offers an unrelated global package installation."""
    node = shutil.which("node")
    if not node:
        raise ValueError("Node não encontrado no PATH. Ative a versão Node do projeto.")
    try:
        result = subprocess.run(
            [node, "-e", "try { const ngrok = require('@expo/ngrok'); process.exit(typeof ngrok.connect === 'function' ? 0 : 1); } catch { process.exit(1); }"],
            cwd=mobile_dir, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            timeout=10, check=False,
        )
    except subprocess.TimeoutExpired as error:
        raise ValueError("Tempo esgotado verificando @expo/ngrok. Reinstale as dependências locais com npm ci --include=dev em mobile/.") from error
    if result.returncode:
        raise ValueError("@expo/ngrok local ausente ou inválido. Execute npm ci --include=dev em mobile/ e tente novamente. Não é necessário instalar globalmente.")


def stop_services(children: list[subprocess.Popen], grace: float = 3.0) -> None:
    # Each service owns a new process group, including Django's autoreloader and npm/Metro children.
    # Never kill by port/name: unrelated user processes must remain untouched.
    for child in reversed(children):
        try:
            os.killpg(child.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
    deadline = time.monotonic() + grace
    for child in children:
        try:
            child.wait(timeout=max(0, deadline - time.monotonic()))
        except subprocess.TimeoutExpired:
            pass
    for child in reversed(children):
        try:
            os.killpg(child.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        child.wait()


def _setup_signals() -> tuple[list[int], dict[int, signal.Handlers]]:
    received: list[int] = []
    previous: dict[int, signal.Handlers] = {}
    for number in (signal.SIGINT, signal.SIGTERM):
        previous[number] = signal.signal(number, lambda signum, _frame: received.append(signum))
    return received, previous


def _restore_signals(previous: dict[int, signal.Handlers]) -> None:
    for number, handler in previous.items():
        signal.signal(number, handler)


def supervise_mobile_only(mobile_command: list[str], *, mobile_dir: Path,
                          mobile_env: dict[str, str]) -> int:
    """Run only the Expo dev server (no local backend)."""
    children: list[subprocess.Popen] = []
    received_signal, previous = _setup_signals()
    try:
        print("[MOBILE] Iniciando Expo (backend externo). Ctrl+C encerra.", flush=True)
        mobile = subprocess.Popen(mobile_command, cwd=mobile_dir, env=mobile_env, start_new_session=True)
        children.append(mobile)
        while not received_signal:
            code = mobile.poll()
            if code is not None:
                return code if code >= 0 else 128 - code
            time.sleep(0.1)
        return 0 if received_signal[-1] == signal.SIGINT else 143
    finally:
        print("\n[DEV] Encerrando os processos iniciados por este comando…", flush=True)
        stop_services(children)
        _restore_signals(previous)


def supervise(backend_command: list[str], mobile_command: list[str], *, backend_dir: Path,
              mobile_dir: Path, backend_env: dict[str, str], mobile_env: dict[str, str],
              backend_port: int, ready_host: str = "127.0.0.1", startup_timeout: float = 30) -> int:
    children: list[subprocess.Popen] = []
    received_signal, previous = _setup_signals()
    try:
        print(f"[BACKEND] Iniciando Django na porta {backend_port} (config.settings.dev).", flush=True)
        backend = subprocess.Popen(backend_command, cwd=backend_dir, env=backend_env,
                                   stdin=subprocess.DEVNULL, start_new_session=True)
        children.append(backend)
        deadline = time.monotonic() + startup_timeout
        while True:
            if received_signal:
                return 0 if received_signal[-1] == signal.SIGINT else 143
            code = backend.poll()
            if code is not None:
                print("[DEV] O backend encerrou antes de ficar disponível.", file=sys.stderr)
                return code if code > 0 else 1
            try:
                with socket.create_connection((ready_host, backend_port), timeout=0.2):
                    break
            except OSError:
                if time.monotonic() >= deadline:
                    print("[DEV] Tempo esgotado aguardando o backend. Confira os logs e a conexão com o banco.", file=sys.stderr)
                    return 1
                time.sleep(0.1)
        print("[MOBILE] Iniciando Expo. Use os atalhos/QR code exibidos abaixo. Ctrl+C encerra os dois serviços.", flush=True)
        # Inherit terminal input/output so Expo retains its interactive menu and QR code.
        mobile = subprocess.Popen(mobile_command, cwd=mobile_dir, env=mobile_env, start_new_session=True)
        children.append(mobile)
        while not received_signal:
            code = mobile.poll()
            if code is not None:
                return code if code >= 0 else 128 - code
            code = backend.poll()
            if code is not None:
                print("[DEV] O backend encerrou; encerrando também o Expo.", file=sys.stderr)
                return code if code > 0 else 1
            time.sleep(0.1)
        return 0 if received_signal[-1] == signal.SIGINT else 143
    finally:
        print("\n[DEV] Encerrando os processos iniciados por este comando…", flush=True)
        stop_services(children)
        _restore_signals(previous)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backend-bind", default="0.0.0.0")
    parser.add_argument("--backend-port", type=port_number, default=8000)
    parser.add_argument("--api-host", default="127.0.0.1")
    parser.add_argument("--expo-port", type=port_number, default=8081)
    parser.add_argument("--platform", choices=("default", "web", "android", "ios"), default="default")
    parser.add_argument("--tunnel", action="store_true", help="Use Expo tunnel mode (requires @expo/ngrok).")
    parser.add_argument("--clear", action="store_true", help="Clear Metro bundler cache.")
    parser.add_argument("--no-backend", action="store_true", help="Skip local Django; use with EXPO_PUBLIC_API_URL.")
    args = parser.parse_args()
    try:
        if os.name != "posix":
            raise ValueError("Este comando suporta macOS/Linux; no Windows, use WSL.")
        if not (MOBILE_DIR / "node_modules").is_dir():
            raise ValueError("Dependências mobile ausentes. Execute npm ci dentro de mobile/.")
        npm = shutil.which("npm")
        if not npm:
            raise ValueError("npm não encontrado no PATH. Ative a versão Node do projeto.")
        if args.tunnel:
            ensure_ngrok_available(MOBILE_DIR)

        # Auto-detect: skip backend when EXPO_PUBLIC_API_URL points to an external host.
        external_url = os.environ.get("EXPO_PUBLIC_API_URL")
        skip_backend = args.no_backend
        if external_url and not skip_backend:
            parsed = urlsplit(external_url)
            if parsed.hostname not in {None, "127.0.0.1", "localhost", "0.0.0.0", "::"}:
                skip_backend = True
                print(f"[DEV] EXPO_PUBLIC_API_URL aponta para host externo — pulando backend local.", flush=True)

        url = api_url(args.api_host, args.backend_port, external_url)
        ensure_port_available("0.0.0.0", args.expo_port)
        mobile_env = {**os.environ, "EXPO_PUBLIC_API_URL": url}
        mobile_command = [npm, "start", "--", "--port", str(args.expo_port)]
        if args.clear:
            mobile_command.append("-c")
        if args.tunnel:
            mobile_command.extend(["--tunnel", "ngrok"])
        if args.platform != "default":
            mobile_command.append(f"--{args.platform}")

        if skip_backend:
            if not external_url:
                raise ValueError("Use EXPO_PUBLIC_API_URL para informar a URL da API quando --no-backend está ativo.")
            return supervise_mobile_only(mobile_command, mobile_dir=MOBILE_DIR, mobile_env=mobile_env)

        backend_dir = ROOT_DIR / "backend"
        if not (backend_dir / ".env").is_file():
            raise ValueError("Configure backend/.env antes de iniciar. Nenhum arquivo de ambiente será criado automaticamente.")
        if args.backend_port == args.expo_port:
            raise ValueError("BACKEND_PORT e EXPO_PORT precisam ser diferentes.")
        ensure_port_available(args.backend_bind, args.backend_port)
        backend_env = {**os.environ, "DJANGO_SETTINGS_MODULE": "config.settings.dev", "PYTHONUNBUFFERED": "1"}
        if args.api_host in {"127.0.0.1", "localhost"} and not external_url:
            print("[DEV] API local: para celular físico/Android emulador, informe API_HOST acessível pelo dispositivo.", flush=True)
        return supervise([sys.executable, "manage.py", "runserver", f"{args.backend_bind}:{args.backend_port}"],
                         mobile_command, backend_dir=backend_dir, mobile_dir=MOBILE_DIR,
                         backend_env=backend_env, mobile_env=mobile_env, backend_port=args.backend_port,
                         ready_host="127.0.0.1" if args.backend_bind == "0.0.0.0" else args.backend_bind)
    except (OSError, ValueError) as error:
        # Messages never include environment file contents or the configured API URL.
        print(f"[DEV] {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
