"""No-inference checks for bounded disposable SQL evidence serialization."""

import json
import unittest

from finalization_evidence import sanitize_cycle_failures, sanitize_llm_calls


class FailureEvidenceTests(unittest.TestCase):
    def test_llm_call_serialization_excludes_raw_provider_output(self) -> None:
        row = {"task": "synthesis", "provider": "claude-cli",
               "outcome": "error:ReflectLLMError", "error_code": "CLAUDE_CLI_TIMEOUT",
               "response_bytes": 0, "latency_ms": 42,
               "stderr": "TOP_SECRET_DO_NOT_PERSIST", "prompt": "TOP_SECRET_DO_NOT_PERSIST"}
        output = json.dumps(sanitize_llm_calls([row]))
        self.assertNotIn("TOP_SECRET", output)
        self.assertEqual(json.loads(output)[0]["error_code"], "CLAUDE_CLI_TIMEOUT")
        for altered in ({**row, "error_code": "TOP_SECRET_DO_NOT_PERSIST"},
                        {**row, "outcome": "error:secret text"}):
            with self.assertRaisesRegex(RuntimeError, "INVALID_LLM_CALL_RECORD"):
                sanitize_llm_calls([altered])

    def test_extra_raw_exception_fields_never_enter_json(self) -> None:
        rows = [{
            "cycle": 1, "stage": "WORK_INFERENCE", "error_class": "ReadTimeout",
            "message": "TOP_SECRET_fixture_message", "traceback": "TOP_SECRET_fixture_trace",
            "provider_payload": "TOP_SECRET_fixture_payload",
        }]
        output = json.dumps({"cycle_failures": sanitize_cycle_failures(rows)})
        self.assertEqual(json.loads(output), {"cycle_failures": [{
            "cycle": 1, "stage": "WORK_INFERENCE", "error_class": "ReadTimeout",
        }]})
        self.assertNotIn("TOP_SECRET", output)

    def test_invalid_metadata_and_overflow_fail_closed(self) -> None:
        valid = {"cycle": 1, "stage": "WORK_INFERENCE", "error_class": "ReadTimeout"}
        for altered in (
            {**valid, "stage": "UNTRUSTED"},
            {**valid, "error_class": "ReadTimeout: TOP_SECRET"},
            {**valid, "cycle": 0},
        ):
            with self.assertRaisesRegex(RuntimeError, "INVALID_CYCLE_FAILURE_RECORD"):
                sanitize_cycle_failures([altered])
        with self.assertRaisesRegex(RuntimeError, "CYCLE_FAILURE_BOUND_EXCEEDED"):
            sanitize_cycle_failures([valid] * 21)


if __name__ == "__main__":
    unittest.main()
