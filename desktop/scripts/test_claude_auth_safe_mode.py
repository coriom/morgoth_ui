"""No-inference tests of private diagnostic sanitization and gating."""
import contextlib
from io import StringIO
import json
import tempfile
import types
import unittest
from unittest.mock import patch

import claude_auth_safe_mode as diagnostic


class SafeModeDiagnosticTests(unittest.TestCase):
    def test_auth_json_never_returns_private_fields(self) -> None:
        secret = "TOP_SECRET_DO_NOT_PERSIST"
        raw = json.dumps({"loggedIn": True, "authMethod": "claude.ai",
                          "configDirectory": "/private/" + secret,
                          "email": secret, "organization": secret, "token": secret})
        result = diagnostic.sanitize_auth(raw, 0)
        self.assertEqual(result, {"AUTH_STATUS_EXIT": 0, "AUTH_LOGGED_IN": True,
                                  "AUTH_METHOD": "claude.ai",
                                  "AUTH_CONFIG_DIRECTORY_PRESENT": True})
        self.assertNotIn(secret, json.dumps(result))
        self.assertFalse(diagnostic.sanitize_auth(raw, 1)["AUTH_LOGGED_IN"])
        self.assertFalse(diagnostic.sanitize_auth("not json " + secret, 0)["AUTH_LOGGED_IN"])
        self.assertEqual(diagnostic.sanitize_auth('{"loggedIn":true,"authMethod":"'+secret+'"}', 0)["AUTH_METHOD"], "unknown")

    def test_doctor_and_debug_never_return_canary(self) -> None:
        secret = "TOP_SECRET_DO_NOT_PERSIST"
        self.assertEqual(diagnostic.classify_doctor(secret, "", 0), "CLAUDE_DOCTOR_OK")
        self.assertEqual(diagnostic.classify_doctor("", "invalid settings " + secret, 1),
                         "CLAUDE_DOCTOR_SETTINGS_PROBLEM")
        self.assertEqual(diagnostic.classify_doctor("", "installation broken " + secret, 1),
                         "CLAUDE_DOCTOR_INSTALL_PROBLEM")
        self.assertEqual(diagnostic.classify_doctor("", "invalid settings; installation broken", 1),
                         "CLAUDE_DOCTOR_OTHER")
        cases = {
            "please log in": "CLAUDE_DIAG_AUTH_REQUIRED",
            "session expired": "CLAUDE_DIAG_LOGIN_EXPIRED",
            "quota exceeded": "CLAUDE_DIAG_USAGE_LIMIT",
            "rate limited": "CLAUDE_DIAG_RATE_LIMITED",
            "certificate error": "CLAUDE_DIAG_NETWORK_OR_TLS",
            "unknown option": "CLAUDE_DIAG_ARGUMENT_REJECTED",
            "organization disabled": "CLAUDE_DIAG_ACCOUNT_OR_ORG",
            "invalid settings": "CLAUDE_DIAG_SETTINGS_OR_HOOK",
            "model unavailable": "CLAUDE_DIAG_MODEL_UNAVAILABLE",
            "nothing recognized": diagnostic.UNKNOWN,
            "please log in; rate limited": diagnostic.UNKNOWN,
        }
        for private, expected in cases.items():
            with self.subTest(private=private):
                result = diagnostic.classify_failure(secret, "", private)
                self.assertEqual(result, expected)
                self.assertNotIn(secret, result)

    def test_paid_selectors_removed_without_other_env_mutation(self) -> None:
        secret = "TOP_SECRET_DO_NOT_PERSIST"
        original = {key: secret for key in diagnostic.PAID_SELECTORS}
        original.update({"HOME": "/operator", "LANG": "C.UTF-8"})
        child = diagnostic.diagnostic_environment(original)
        self.assertEqual(set(child), {"HOME", "LANG"})
        self.assertNotIn(secret, json.dumps(child))

    def test_logged_out_gate_never_calls_doctor_or_inference(self) -> None:
        from subprocess import CompletedProcess
        output = StringIO()
        def fake_run(argv, env, **kwargs):
            if argv == ["claude", "auth", "status"]:
                return CompletedProcess(argv, 1, '{"loggedIn":false,"authMethod":"none","token":"TOP_SECRET_DO_NOT_PERSIST"}', "")
            raise AssertionError("doctor or inference must not run")
        with patch("sys.argv", ["probe", "--backend", "/safe/backend"]), \
             patch.object(diagnostic, "_checked_backend", return_value=diagnostic.Path("/safe/backend")), \
             patch.object(diagnostic, "_version", return_value="2.0.0 (Claude Code)"), \
             patch.object(diagnostic, "_run", side_effect=fake_run), \
             patch.object(diagnostic, "_safe_mode_probe", side_effect=AssertionError("inference")), \
             contextlib.redirect_stdout(output):
            diagnostic.main()
        self.assertIn("BLOCKED_CLAUDE_AUTH_NOT_LOGGED_IN", output.getvalue())
        self.assertNotIn("TOP_SECRET_DO_NOT_PERSIST", output.getvalue())

    def test_safe_mode_argv_debug_is_private_and_result_is_fixed(self) -> None:
        from subprocess import CompletedProcess
        secret = "TOP_SECRET_DO_NOT_PERSIST"
        fake_backend = types.ModuleType("self_modify.reflect_llm")
        fake_backend.CLAUDE_CLI_TIMEOUT_SECS = 600
        fake_backend.ReflectLLMError = RuntimeError
        fake_backend._build_claude_cli_argv = lambda prompt: ["claude", "-p", "--output-format", "json", "--tools", ""]
        fake_backend._parse_claude_cli_json = lambda stdout: ("OK", "model", False)
        seen = []
        def fake_run(argv, env, **kwargs):
            seen.append(argv)
            self.assertEqual(kwargs["prompt"], "Reply with exactly OK.")
            self.assertEqual(kwargs["timeout"], 600)
            debug = diagnostic.Path(argv[argv.index("--debug-file") + 1])
            self.assertEqual(debug.parent.stat().st_mode & 0o777, 0o700)
            debug.write_text("unknown option " + secret)
            return CompletedProcess(argv, 1, secret, "")
        with patch.dict("sys.modules", {"self_modify.reflect_llm": fake_backend}), \
             patch.object(diagnostic, "_run", side_effect=fake_run):
            result = diagnostic._safe_mode_probe(diagnostic.Path(tempfile.gettempdir()), {"HOME": "/operator"})
        self.assertEqual(result["diagnostic_class"], "CLAUDE_DIAG_ARGUMENT_REJECTED")
        self.assertEqual(result["backend_safe_code"], "CLAUDE_CLI_EXIT_NONZERO")
        self.assertNotIn(secret, json.dumps(result))
        self.assertEqual(seen[0][:6], ["claude", "-p", "--output-format", "json", "--tools", ""])
        self.assertEqual(seen[0][6:8], ["--safe-mode", "--no-session-persistence"])
        self.assertFalse(diagnostic.Path(seen[0][-1]).exists())


if __name__ == "__main__":
    unittest.main()
