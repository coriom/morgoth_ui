"""No-inference checks for bounded disposable SQL evidence serialization."""

import json
import unittest

from finalization_evidence import sanitize_cycle_failures


class FailureEvidenceTests(unittest.TestCase):
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
