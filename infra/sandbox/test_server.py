import importlib.util
from pathlib import Path
import unittest


SPEC = importlib.util.spec_from_file_location("sandbox_server", Path(__file__).with_name("server.py"))
server = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(server)


class ExecutorTestCase(unittest.TestCase):
    def test_executes_isolated_python_and_captures_output(self):
        result = server.execute_python("print(6 * 7)")
        self.assertEqual(result["status"], "success")
        self.assertEqual(result["stdout"].strip(), "42")

    def test_rejects_empty_and_oversized_code(self):
        with self.assertRaises(ValueError):
            server.execute_python("")
        with self.assertRaises(ValueError):
            server.execute_python("x" * (server.MAX_CODE_BYTES + 1))

    def test_enforces_timeout(self):
        original = server.TIMEOUT_SECONDS
        server.TIMEOUT_SECONDS = 0.05
        try:
            result = server.execute_python("while True: pass")
        finally:
            server.TIMEOUT_SECONDS = original
        self.assertEqual(result["status"], "timeout")


if __name__ == "__main__":
    unittest.main()
