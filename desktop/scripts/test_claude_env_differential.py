"""No-inference safety checks for the one-shot operator environment probe."""

import json
import unittest

from claude_env_differential import classify_nonzero, operator_environment


class DifferentialSafetyTests(unittest.TestCase):
    def test_private_output_produces_only_fixed_class(self) -> None:
        secret = "TOP_SECRET_DO_NOT_PERSIST"
        cases = {
            "please log in": "CLAUDE_DIAG_AUTH_REQUIRED",
            "quota exceeded": "CLAUDE_DIAG_USAGE_LIMIT",
            "rate limited": "CLAUDE_DIAG_RATE_LIMITED",
            "certificate error": "CLAUDE_DIAG_NETWORK_OR_TLS",
            "unknown option": "CLAUDE_DIAG_ARGUMENT_REJECTED",
            "organization not found": "CLAUDE_DIAG_ACCOUNT_OR_ORG",
            "unrecognized private failure": "CLAUDE_DIAG_UNKNOWN_NONZERO",
            "please log in; rate limited": "CLAUDE_DIAG_UNKNOWN_NONZERO",
        }
        for private_text, expected in cases.items():
            with self.subTest(expected=expected):
                code = classify_nonzero(secret, private_text)
                self.assertEqual(code, expected)
                self.assertNotIn(secret, code)
                self.assertNotIn(secret, json.dumps({"diagnostic_class": code}))

    def test_operator_copy_excludes_paid_provider_selectors(self) -> None:
        parent = {
            "HOME": "/operator/home", "PATH": "/usr/bin",
            "HTTPS_PROXY": "TOP_SECRET_DO_NOT_PERSIST",
            "CLAUDE_CODE_OAUTH_TOKEN": "TOP_SECRET_DO_NOT_PERSIST",
            "ANTHROPIC_API_KEY": "TOP_SECRET_DO_NOT_PERSIST",
            "ANTHROPIC_AUTH_TOKEN": "TOP_SECRET_DO_NOT_PERSIST",
            "CLAUDE_CODE_USE_BEDROCK": "1", "CLAUDE_CODE_USE_VERTEX": "1",
        }
        child = operator_environment(parent)
        self.assertEqual(child["HOME"], parent["HOME"])
        self.assertEqual(child["HTTPS_PROXY"], parent["HTTPS_PROXY"])
        self.assertEqual(child["CLAUDE_CODE_OAUTH_TOKEN"], parent["CLAUDE_CODE_OAUTH_TOKEN"])
        for name in ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN",
                     "CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX"):
            self.assertNotIn(name, child)


if __name__ == "__main__":
    unittest.main()
