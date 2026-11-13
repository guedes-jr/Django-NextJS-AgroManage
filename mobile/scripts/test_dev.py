"""Supervisor checks use synthetic processes only; never start Django or Expo."""
import argparse
import contextlib
import io
import os
import signal
import socket
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from dev import (
    api_url,
    ensure_ngrok_available,
    ensure_port_available,
    main,
    port_number,
    supervise,
)


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def listener(port):
    return [sys.executable, "-u", "-c",
            "import socket,time; s=socket.socket(); "
            f"s.bind(('127.0.0.1',{port})); s.listen(); time.sleep(60)"]


class ConfigurationTests(unittest.TestCase):
    @patch("dev.subprocess.run")
    @patch("dev.shutil.which", return_value="node")
    def test_tunnel_uses_local_ngrok_without_installing_globally(self, _which, run):
        run.return_value.returncode = 0
        ensure_ngrok_available(Path("/temporary/mobile"))
        self.assertEqual(run.call_args.kwargs["cwd"], Path("/temporary/mobile"))
        self.assertIn("require('@expo/ngrok')", run.call_args.args[0][-1])
        self.assertEqual(run.call_args.kwargs["stdout"], -3)
        self.assertEqual(run.call_args.kwargs["stderr"], -3)

    @patch("dev.subprocess.run")
    @patch("dev.shutil.which", return_value="node")
    def test_missing_tunnel_dependency_has_local_recovery_instructions(self, _which, run):
        run.return_value.returncode = 1
        with self.assertRaisesRegex(ValueError, "npm ci --include=dev"):
            ensure_ngrok_available(Path("/temporary/mobile"))

    @patch("dev.supervise")
    @patch("dev.ensure_port_available")
    @patch("dev.ensure_ngrok_available", side_effect=ValueError("ngrok local ausente"))
    @patch("dev.shutil.which", return_value="npm")
    @patch("dev.Path.is_dir", return_value=True)
    @patch("dev.sys.argv", ["dev.py", "--tunnel"])
    def test_missing_ngrok_stops_before_opening_ports_or_starting_backend(self, _is_dir, _which, ngrok, ports, supervise_mock):
        with contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(main(), 1)
        ngrok.assert_called_once()
        ports.assert_not_called()
        supervise_mock.assert_not_called()

    def test_default_url_and_explicit_override(self):
        self.assertEqual(api_url("192.168.1.20", 8010, None), "http://192.168.1.20:8010/api/v1/")
        self.assertEqual(api_url("127.0.0.1", 8000, "https://api.example.com/api/v1"), "https://api.example.com/api/v1/")

    def test_invalid_urls_never_expose_supplied_value(self):
        for value in ["https://user:private@example.com/api", "file:///api", "https://example.com?private=x", "http://0.0.0.0:8000/api"]:
            with self.subTest(value=value):
                with self.assertRaises(ValueError) as caught:
                    api_url("127.0.0.1", 8000, value)
                self.assertNotIn("private", str(caught.exception))
        with self.assertRaises(ValueError):
            api_url("0.0.0.0", 8000, None)

    def test_valid_port_range(self):
        self.assertEqual(port_number("8000"), 8000)
        for value in ["0", "65536"]:
            with self.assertRaises(argparse.ArgumentTypeError):
                port_number(value)

    @patch("dev.socket.socket")
    def test_wildcard_bind_cannot_hide_an_existing_loopback_listener(self, socket_factory):
        probe = socket_factory.return_value.__enter__.return_value
        probe.connect_ex.return_value = 0
        with self.assertRaisesRegex(ValueError, "Porta 8000 indisponível"):
            ensure_port_available("0.0.0.0", 8000)
        probe.connect_ex.assert_called_once_with(("127.0.0.1", 8000))
        probe.bind.assert_not_called()

    def test_occupied_port_is_reported_without_stopping_owner(self):
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            sock.listen()
            with self.assertRaises(ValueError):
                ensure_port_available("127.0.0.1", sock.getsockname()[1])
            self.assertGreaterEqual(sock.fileno(), 0)


@unittest.skipUnless(os.name == "posix", "Process groups require POSIX")
class LifecycleTests(unittest.TestCase):
    def run_services(self, backend, mobile, port, timeout=3):
        with tempfile.TemporaryDirectory(prefix="agromanage-dev-test-") as directory:
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                return supervise(backend, mobile, backend_dir=Path(directory), mobile_dir=Path(directory),
                                 backend_env=dict(os.environ), mobile_env=dict(os.environ),
                                 backend_port=port, startup_timeout=timeout)

    def test_backend_failure_does_not_start_mobile(self):
        port = free_port()
        code = self.run_services([sys.executable, "-c", "raise SystemExit(9)"],
                                 ["/this-mobile-command-must-not-run"], port)
        self.assertEqual(code, 9)

    def test_mobile_failure_stops_backend_and_preserves_exit_status(self):
        port = free_port()
        code = self.run_services(listener(port), [sys.executable, "-c", "raise SystemExit(7)"], port)
        self.assertEqual(code, 7)
        ensure_port_available("127.0.0.1", port)

    def test_backend_timeout_does_not_start_mobile(self):
        port = free_port()
        code = self.run_services([sys.executable, "-c", "import time; time.sleep(60)"],
                                 ["/this-mobile-command-must-not-run"], port, timeout=0.2)
        self.assertEqual(code, 1)

    def test_ctrl_c_stops_both_services(self):
        port = free_port()
        mobile = [sys.executable, "-c", "import os,signal,time; os.kill(os.getppid(),signal.SIGINT); time.sleep(60)"]
        self.assertEqual(self.run_services(listener(port), mobile, port), 0)
        ensure_port_available("127.0.0.1", port)

    def test_mobile_exit_stops_its_remaining_descendants(self):
        backend_port, child_port = free_port(), free_port()
        while child_port == backend_port:
            child_port = free_port()
        child_command = repr(listener(child_port))
        mobile = [sys.executable, "-c",
                  "import subprocess,socket,time; "
                  f"subprocess.Popen({child_command}); "
                  "deadline=time.monotonic()+3\n"
                  "while time.monotonic()<deadline:\n"
                  " try:\n"
                  f"  s=socket.create_connection(('127.0.0.1',{child_port}),timeout=.1); s.close(); break\n"
                  " except OSError: time.sleep(.05)\n"
                  "else: raise SystemExit(8)\n"
                  "raise SystemExit(7)"]
        self.assertEqual(self.run_services(listener(backend_port), mobile, backend_port), 7)
        ensure_port_available("127.0.0.1", backend_port)
        ensure_port_available("127.0.0.1", child_port)
