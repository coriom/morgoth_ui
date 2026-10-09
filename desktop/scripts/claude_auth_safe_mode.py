"""One gated Claude safe-mode diagnostic; never publish provider output."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time

from claude_env_differential import _checked_backend, operator_environment


AUTH_METHODS = frozenset({
    "none", "claude.ai", "oauth_token", "api_key", "api_key_helper",
    "third_party", "unknown",
})
PAID_SELECTORS = frozenset({"ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN",
                            "CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX",
                            "CLAUDE_CODE_USE_FOUNDRY"})
BACKEND_CODES = frozenset({
    "CLAUDE_CLI_NOT_FOUND", "CLAUDE_CLI_TIMEOUT", "CLAUDE_CLI_EXIT_NONZERO",
    "CLAUDE_CLI_JSON_INVALID", "CLAUDE_CLI_JSON_NOT_OBJECT",
    "CLAUDE_CLI_REPORTED_ERROR", "PROBE_EMPTY_RESPONSE", "PROBE_UNEXPECTED_ERROR",
})
UNKNOWN = "CLAUDE_DIAG_UNKNOWN_NONZERO"
SIGNATURES = {
    "CLAUDE_DIAG_LOGIN_EXPIRED": r"(?:session|login|oauth token)\s+(?:has\s+)?expired",
    "CLAUDE_DIAG_AUTH_REQUIRED": r"(?:please\s+(?:log|sign)\s+in|not\s+logged\s+in|authentication\s+required)",
    "CLAUDE_DIAG_USAGE_LIMIT": r"(?:usage\s+limit|quota\s+exceeded|out\s+of\s+usage)",
    "CLAUDE_DIAG_RATE_LIMITED": r"(?:rate\s+limit(?:ed)?|too\s+many\s+requests|\b429\b)",
    "CLAUDE_DIAG_NETWORK_OR_TLS": r"(?:ECONNRESET|ENOTFOUND|CERTIFICATE_VERIFY_FAILED|UNABLE_TO_VERIFY_LEAF_SIGNATURE|(?:network|proxy|tls|certificate)\s+error|connection\s+refused|fetch\s+failed)",
    "CLAUDE_DIAG_ARGUMENT_REJECTED": r"(?:unknown\s+option|unrecognized\s+option|invalid\s+argument|unknown\s+flag)",
    "CLAUDE_DIAG_ACCOUNT_OR_ORG": r"(?:(?:account|organization)\s+(?:disabled|not\s+found)|no\s+organization)",
    "CLAUDE_DIAG_SETTINGS_OR_HOOK": r"(?:(?:invalid|malformed)\s+settings|(?:hook|plugin|mcp)\s+(?:failed|error))",
    "CLAUDE_DIAG_MODEL_UNAVAILABLE": r"(?:model\s+(?:is\s+)?unavailable|model\s+not\s+found|unsupported\s+model)",
}


def diagnostic_environment(parent: dict[str, str]) -> dict[str, str]:
    """Preserve operator context while removing paid-provider selectors."""
    return {k: v for k, v in operator_environment(parent).items() if k not in PAID_SELECTORS}


def sanitize_auth(raw: str, exit_code: int) -> dict[str, object]:
    """Extract only fixed authentication fields from private CLI JSON."""
    try:
        data = json.loads(raw)
    except (ValueError, TypeError):
        data = None
    if not isinstance(data, dict):
        data = {}
    method = data.get("authMethod")
    if not isinstance(method, str) or method not in AUTH_METHODS:
        method = "unknown"
    logged_in = exit_code == 0 and data.get("loggedIn") is True
    return {"AUTH_STATUS_EXIT": bounded_returncode(exit_code),
            "AUTH_LOGGED_IN": bool(logged_in), "AUTH_METHOD": method,
            "AUTH_CONFIG_DIRECTORY_PRESENT": "configDirectory" in data}


def classify_doctor(stdout: str, stderr: str, exit_code: int) -> str:
    """Classify a private doctor result without publishing its contents."""
    if exit_code == 0:
        return "CLAUDE_DOCTOR_OK"
    body = (stdout + "\n" + stderr)[:65536]
    matches = []
    if re.search(r"(?:invalid|malformed)\s+settings", body, re.I):
        matches.append("CLAUDE_DOCTOR_SETTINGS_PROBLEM")
    if re.search(r"(?:installation\s+(?:corrupt|broken)|binary\s+not\s+found)", body, re.I):
        matches.append("CLAUDE_DOCTOR_INSTALL_PROBLEM")
    return matches[0] if len(matches) == 1 else "CLAUDE_DOCTOR_OTHER"


def classify_failure(stdout: str, stderr: str, debug: str) -> str:
    """Return a single fixed class only for an unambiguous signature."""
    body = (stdout[:65536] + "\n" + stderr[:65536] + "\n" + debug[:65536])
    matches = [code for code, signature in SIGNATURES.items()
               if re.search(signature, body, re.I)]
    return matches[0] if len(matches) == 1 else UNKNOWN


def bounded_returncode(code: int) -> int:
    """Keep subprocess status bounded and free of arbitrary text."""
    return code if isinstance(code, int) and not isinstance(code, bool) and -255 <= code <= 255 else -999


def _run(argv: list[str], env: dict[str, str], *, timeout: int = 30,
         cwd: str | None = None, prompt: str | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(argv, env=env, cwd=cwd, input=prompt,
                          stdin=subprocess.DEVNULL if prompt is None else None,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                          text=True, timeout=timeout, check=False)


def _version(env: dict[str, str]) -> str:
    run = _run(["claude", "--version"], env)
    value = run.stdout.strip()
    if run.returncode or not re.fullmatch(r"[0-9][A-Za-z0-9 .()+_-]{0,79}", value):
        raise RuntimeError("BLOCKED_CLAUDE_VERSION")
    return value


def _safe_mode_probe(backend: Path, env: dict[str, str]) -> dict[str, object]:
    """Run the one authorized inference using the pinned backend argv builder."""
    sys.path.insert(0, str(backend))
    from self_modify.reflect_llm import (
        CLAUDE_CLI_TIMEOUT_SECS, ReflectLLMError,
        _build_claude_cli_argv, _parse_claude_cli_json,
    )

    prompt = "Reply with exactly OK."
    started = time.monotonic()
    with tempfile.TemporaryDirectory(prefix="morgoth-claude-safe-") as temp:
        os.chmod(temp, 0o700)
        debug = Path(temp) / "debug.log"
        argv = _build_claude_cli_argv(prompt) + [
            "--safe-mode", "--no-session-persistence", "--debug-file", str(debug),
        ]
        try:
            run = _run(argv, env, timeout=CLAUDE_CLI_TIMEOUT_SECS, cwd=temp, prompt=prompt)
            debug_text = ""
            if run.returncode and debug.is_file() and not debug.is_symlink():
                with debug.open("r", encoding="utf-8", errors="replace") as private_file:
                    debug_text = private_file.read(65536)
            if run.returncode:
                return {"SAFE_MODE_PROBE": "BLOCKED", "backend_safe_code": "CLAUDE_CLI_EXIT_NONZERO",
                        "diagnostic_class": classify_failure(run.stdout, run.stderr, debug_text),
                        "returncode": bounded_returncode(run.returncode),
                        "elapsed_ms": int((time.monotonic() - started) * 1000)}
            try:
                response, _, is_error = _parse_claude_cli_json(run.stdout)
            except ReflectLLMError as exc:
                code = exc.safe_code if exc.safe_code in BACKEND_CODES else "PROBE_UNEXPECTED_ERROR"
                return {"SAFE_MODE_PROBE": "BLOCKED", "backend_safe_code": code,
                        "diagnostic_class": UNKNOWN, "returncode": 0,
                        "elapsed_ms": int((time.monotonic() - started) * 1000)}
            if is_error or not response.strip():
                return {"SAFE_MODE_PROBE": "BLOCKED",
                        "backend_safe_code": "CLAUDE_CLI_REPORTED_ERROR" if is_error else "PROBE_EMPTY_RESPONSE",
                        "diagnostic_class": UNKNOWN, "returncode": 0,
                        "elapsed_ms": int((time.monotonic() - started) * 1000)}
            body = response.strip().encode("utf-8")
            return {"SAFE_MODE_PROBE": "PASS", "response_bytes": len(body),
                    "response_sha256": hashlib.sha256(body).hexdigest(),
                    "elapsed_ms": int((time.monotonic() - started) * 1000)}
        except FileNotFoundError:
            code = "CLAUDE_CLI_NOT_FOUND"
        except subprocess.TimeoutExpired:
            code = "CLAUDE_CLI_TIMEOUT"
        return {"SAFE_MODE_PROBE": "BLOCKED", "backend_safe_code": code,
                "diagnostic_class": UNKNOWN, "returncode": -999,
                "elapsed_ms": int((time.monotonic() - started) * 1000)}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--backend", type=Path, required=True)
    args = parser.parse_args()
    try:
        backend = _checked_backend(args.backend)
        env = diagnostic_environment(dict(os.environ))
        print(f"CLAUDE_VERSION={_version(env)}")
        auth_run = _run(["claude", "auth", "status"], env)
        auth = sanitize_auth(auth_run.stdout, auth_run.returncode)
        for key, value in auth.items():
            print(f"{key}={str(value).lower() if isinstance(value, bool) else value}")
        if not auth["AUTH_LOGGED_IN"]:
            print("CONCLUSION=BLOCKED_CLAUDE_AUTH_NOT_LOGGED_IN")
            return
        try:
            doctor = _run(["claude", "doctor"], env, timeout=60)
            doctor_exit = bounded_returncode(doctor.returncode)
            doctor_class = classify_doctor(doctor.stdout, doctor.stderr, doctor.returncode)
        except subprocess.TimeoutExpired:
            doctor_exit, doctor_class = -999, "CLAUDE_DOCTOR_OTHER"
        print(f"DOCTOR_EXIT={doctor_exit}")
        print(f"DOCTOR_CLASS={doctor_class}")
        result = _safe_mode_probe(backend, env)
        for key, value in result.items():
            print(f"{key}={value}")
        print("CONCLUSION=" + ("CLAUDE_CUSTOMIZATION_CAUSE_PROVEN" if result["SAFE_MODE_PROBE"] == "PASS"
                              else "CLAUDE_CUSTOMIZATION_CAUSE_NOT_PROVEN"))
    except Exception:
        # Even an unexpected local failure must not print private CLI output.
        print("DIAGNOSTIC=BLOCKED_LOCAL_PREFLIGHT")


if __name__ == "__main__":
    main()
