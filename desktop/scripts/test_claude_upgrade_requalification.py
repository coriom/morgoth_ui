"""Pure checks of version gates and the two-call maximum; no live inference."""
import hashlib
import json
import types
import unittest
from unittest.mock import patch

import claude_upgrade_requalification as upgrade
from claude_auth_safe_mode import sanitize_auth


class UpgradeQualificationTests(unittest.TestCase):
    def test_semantic_version_gate(self) -> None:
        self.assertLess(upgrade.version_tuple("2.1.138 (Claude Code)"), upgrade.MINIMUM_VERSION)
        self.assertEqual(upgrade.version_tuple("2.1.169 (Claude Code)"), upgrade.MINIMUM_VERSION)
        self.assertGreater(upgrade.version_tuple("2.2.0 (Claude Code)"), upgrade.MINIMUM_VERSION)
        self.assertIsNone(upgrade.version_tuple("not a version"))

    def test_update_and_help_sanitizers(self) -> None:
        secret = "TOP_SECRET_DO_NOT_PERSIST"
        self.assertEqual(upgrade.sanitize_update_result(0, "already up to date " + secret),
                         (0, "UPDATE_ALREADY_CURRENT"))
        self.assertEqual(upgrade.sanitize_update_result(0, secret), (0, "UPDATE_OK"))
        self.assertEqual(upgrade.sanitize_update_result(1, secret), (1, "UPDATE_FAILED"))
        help_text = "-p, --print\n--output-format json\n--tools list\n--safe-mode\n--no-session-persistence\n--debug-file path\n" + secret
        self.assertTrue(all(upgrade.help_flags(help_text).values()))
        self.assertFalse(upgrade.help_flags(help_text.replace("--safe-mode", "--unsafe-mode"))["--safe-mode"])
        self.assertNotIn(secret, json.dumps(upgrade.help_flags(help_text)))
        auth = sanitize_auth('{"loggedIn":true,"authMethod":"claude.ai","token":"'+secret+'"}', 0)
        self.assertTrue(auth["AUTH_LOGGED_IN"])
        self.assertNotIn(secret, json.dumps(auth))

    def test_plain_pass_never_calls_safe_mode(self) -> None:
        calls = []
        def plain():
            calls.append("plain")
            return {"status": "PASS", "response_bytes": 2,
                    "response_sha256": hashlib.sha256(b"OK").hexdigest(), "elapsed_ms": 5}
        def safe():
            calls.append("safe")
            raise AssertionError("second inference forbidden")
        first, second, outcome = upgrade.qualify(plain, safe)
        self.assertEqual(calls, ["plain"])
        self.assertIsNone(second)
        self.assertEqual(outcome, "CLAUDE_PROVIDER_FIXED_BY_CLI_UPDATE")
        self.assertTrue(upgrade._valid_result(first))

    def test_failure_allows_at_most_one_safe_mode_call(self) -> None:
        calls = []
        def plain():
            calls.append("plain")
            return {"status": "BLOCKED", "safe_code": "CLAUDE_CLI_EXIT_NONZERO",
                    "returncode": 1, "elapsed_ms": 5}
        def safe():
            calls.append("safe")
            return {"status": "BLOCKED", "safe_code": "CLAUDE_CLI_TIMEOUT",
                    "returncode": -999, "elapsed_ms": 600000}
        first, second, outcome = upgrade.qualify(plain, safe)
        self.assertEqual(calls, ["plain", "safe"])
        self.assertEqual(outcome, "CLAUDE_PROVIDER_FAILURE_PERSISTS_AFTER_UPDATE")
        self.assertTrue(upgrade._valid_result(first))
        self.assertTrue(upgrade._valid_result(second))
        calls.clear()
        first, second, outcome = upgrade.qualify(lambda: {"status": "BLOCKED", "safe_code": None}, safe)
        self.assertIsNone(second)
        self.assertEqual(calls, [])
        self.assertEqual(outcome, "BLOCKED_PLAIN_PROVIDER_UNCLASSIFIED")

    def test_plain_probe_uses_exact_backend_call_and_sanitizes_response(self) -> None:
        secret = "TOP_SECRET_DO_NOT_PERSIST"
        backend = types.ModuleType("self_modify.reflect_llm")
        backend.ReflectLLMError = RuntimeError
        async def call(prompt, runner):
            self.assertEqual(prompt, "Reply with exactly OK.")
            self.assertIsNone(runner)
            return "OK", {"private": secret}
        backend._claude_cli_call = call
        with patch.dict("sys.modules", {"self_modify.reflect_llm": backend}):
            result = upgrade.plain_probe()
        self.assertEqual(result["status"], "PASS")
        self.assertEqual(result["response_bytes"], 2)
        self.assertNotIn(secret, json.dumps(result))

    def test_safe_mode_probe_uses_backend_argv_and_private_output(self) -> None:
        from subprocess import CompletedProcess
        secret = "TOP_SECRET_DO_NOT_PERSIST"
        backend = types.ModuleType("self_modify.reflect_llm")
        backend.CLAUDE_CLI_TIMEOUT_SECS = 600
        backend.ReflectLLMError = RuntimeError
        backend._build_claude_cli_argv = lambda prompt: ["claude", "-p", "--output-format", "json", "--tools", ""]
        backend._parse_claude_cli_json = lambda stdout: ("OK", "model", False)
        seen = []
        def fake_run(argv, **kwargs):
            seen.append(argv)
            self.assertEqual(kwargs["input"], "Reply with exactly OK.")
            return CompletedProcess(argv, 1, secret, secret)
        with patch.dict("sys.modules", {"self_modify.reflect_llm": backend}), \
             patch.object(upgrade.subprocess, "run", side_effect=fake_run):
            result = upgrade.safe_mode_probe()
        self.assertEqual(seen, [["claude", "-p", "--output-format", "json", "--tools", "",
                                 "--safe-mode", "--no-session-persistence"]])
        self.assertEqual(result["safe_code"], "CLAUDE_CLI_EXIT_NONZERO")
        self.assertNotIn(secret, json.dumps(result))


if __name__ == "__main__":
    unittest.main()
