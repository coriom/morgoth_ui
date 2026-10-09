"""One operator-environment differential through the pinned Claude CLI path.

The child sees operator environment except explicitly forbidden paid-provider
selectors. Provider output is inspected only inside the child and discarded.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time


PINNED_BACKEND = "9b982540e4bb53a2b5045d22dc67eee525a557eb"
FORBIDDEN = frozenset({
    "ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN",
    "CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX",
})
DIAGNOSTIC_CLASSES = frozenset({
    "CLAUDE_DIAG_AUTH_REQUIRED", "CLAUDE_DIAG_USAGE_LIMIT",
    "CLAUDE_DIAG_RATE_LIMITED", "CLAUDE_DIAG_NETWORK_OR_TLS",
    "CLAUDE_DIAG_ARGUMENT_REJECTED", "CLAUDE_DIAG_ACCOUNT_OR_ORG",
    "CLAUDE_DIAG_UNKNOWN_NONZERO",
})
BACKEND_CODES = frozenset({
    "CLAUDE_CLI_NOT_FOUND", "CLAUDE_CLI_TIMEOUT", "CLAUDE_CLI_EXIT_NONZERO",
    "CLAUDE_CLI_JSON_INVALID", "CLAUDE_CLI_JSON_NOT_OBJECT",
    "CLAUDE_CLI_REPORTED_ERROR", "PROBE_EMPTY_RESPONSE", "PROBE_UNEXPECTED_ERROR",
})

# Deliberately narrow signatures. Multiple classes or no class => UNKNOWN.
_SIGNATURES = {
    "CLAUDE_DIAG_AUTH_REQUIRED": re.compile(
        r"(?:please\s+(?:log|sign)\s+in|(?:login|authentication)\s+required|not\s+logged\s+in|invalid\s+oauth\s+token)", re.I),
    "CLAUDE_DIAG_USAGE_LIMIT": re.compile(
        r"(?:usage\s+limit|quota\s+exceeded|out\s+of\s+usage)", re.I),
    "CLAUDE_DIAG_RATE_LIMITED": re.compile(
        r"(?:rate\s+limit(?:ed)?|too\s+many\s+requests|\b429\b)", re.I),
    "CLAUDE_DIAG_NETWORK_OR_TLS": re.compile(
        r"(?:ECONNRESET|ENOTFOUND|CERTIFICATE_VERIFY_FAILED|UNABLE_TO_VERIFY_LEAF_SIGNATURE|"
        r"(?:network|proxy|tls|certificate)\s+error|connection\s+refused|fetch\s+failed)", re.I),
    "CLAUDE_DIAG_ARGUMENT_REJECTED": re.compile(
        r"(?:unknown\s+option|unrecognized\s+option|invalid\s+argument|unknown\s+flag)", re.I),
    "CLAUDE_DIAG_ACCOUNT_OR_ORG": re.compile(
        r"(?:(?:account|organization)\s+(?:disabled|not\s+found)|no\s+organization)", re.I),
}


def classify_nonzero(stdout: str, stderr: str) -> str:
    """Return one fixed class without retaining or returning provider content."""
    private_text = (stdout + "\n" + stderr)[:65536]
    matches = [code for code, pattern in _SIGNATURES.items() if pattern.search(private_text)]
    return matches[0] if len(matches) == 1 else "CLAUDE_DIAG_UNKNOWN_NONZERO"


def operator_environment(parent: dict[str, str]) -> dict[str, str]:
    """Copy the operator process environment minus paid-provider selectors."""
    return {key: value for key, value in parent.items() if key not in FORBIDDEN}


def _checked_backend(root: Path) -> Path:
    backend = root.resolve(strict=True)
    head = subprocess.check_output(
        ["git", "-C", str(backend), "rev-parse", "HEAD"], text=True,
        stderr=subprocess.DEVNULL,
    ).strip()
    dirty = subprocess.check_output(
        ["git", "-C", str(backend), "status", "--porcelain", "--untracked-files=all"],
        stderr=subprocess.DEVNULL,
    )
    if head != PINNED_BACKEND or dirty:
        raise RuntimeError("BLOCKED_BACKEND_PIN_OR_DIRTY")
    return backend


def _inner(backend: Path) -> None:
    """Perform the only inference; stdout is strictly a sanitized JSON record."""
    sys.path.insert(0, str(backend))
    from self_modify.reflect_llm import (
        CLAUDE_CLI_TIMEOUT_SECS, ReflectLLMError, _claude_cli_call,
    )
    import asyncio

    diagnostic = "CLAUDE_DIAG_UNKNOWN_NONZERO"
    returncode = -999  # fixed sentinel when the CLI never returned

    def runner(argv: list[str], cwd: str, prompt: str = "") -> subprocess.CompletedProcess[str]:
        nonlocal diagnostic, returncode
        completed = subprocess.run(
            argv, input=prompt, capture_output=True, text=True,
            timeout=CLAUDE_CLI_TIMEOUT_SECS, cwd=cwd, check=False,
        )
        returncode = completed.returncode if -255 <= completed.returncode <= 255 else -999
        if completed.returncode != 0:
            diagnostic = classify_nonzero(completed.stdout, completed.stderr)
        return completed

    async def call() -> dict[str, object]:
        started = time.monotonic()
        try:
            response, _metadata = await _claude_cli_call("Reply with exactly OK.", runner=runner)
        except ReflectLLMError as exc:
            return {"status": "BLOCKED", "backend_safe_code": exc.safe_code,
                    "diagnostic_class": diagnostic, "returncode": returncode,
                    "elapsed_ms": int((time.monotonic() - started) * 1000)}
        except Exception:
            return {"status": "BLOCKED", "backend_safe_code": "PROBE_UNEXPECTED_ERROR",
                    "diagnostic_class": "CLAUDE_DIAG_UNKNOWN_NONZERO", "returncode": -999,
                    "elapsed_ms": int((time.monotonic() - started) * 1000)}
        body = response.encode("utf-8")
        if not body:
            return {"status": "BLOCKED", "backend_safe_code": "PROBE_EMPTY_RESPONSE",
                    "diagnostic_class": "CLAUDE_DIAG_UNKNOWN_NONZERO", "returncode": returncode,
                    "elapsed_ms": int((time.monotonic() - started) * 1000)}
        return {"status": "PASS", "response_bytes": len(body),
                "response_sha256": hashlib.sha256(body).hexdigest(),
                "elapsed_ms": int((time.monotonic() - started) * 1000)}

    print(json.dumps(asyncio.run(call()), sort_keys=True))


def _outer(backend: Path, python: Path) -> None:
    """Validate and print only fixed fields from the isolated probe child."""
    backend = _checked_backend(backend)
    if not python.is_absolute() or not python.is_file():
        raise RuntimeError("BLOCKED_PYTHON_UNAVAILABLE")
    env = operator_environment(dict(os.environ))
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    started = time.monotonic()
    try:
        completed = subprocess.run(
            [str(python), str(Path(__file__).resolve()), "--inner", "--backend", str(backend)],
            cwd=backend, env=env, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            timeout=640, check=False, text=True,
        )
        data = json.loads(completed.stdout.strip())
        if completed.returncode != 0 or not isinstance(data, dict):
            raise ValueError
        elapsed = data["elapsed_ms"]
        if not isinstance(elapsed, int) or isinstance(elapsed, bool) or not 0 <= elapsed <= 640000:
            raise ValueError
        if data["status"] == "PASS":
            size, digest = data["response_bytes"], data["response_sha256"]
            if (not isinstance(size, int) or isinstance(size, bool) or size <= 0
                    or not isinstance(digest, str)
                    or re.fullmatch(r"[0-9a-f]{64}", digest) is None):
                raise ValueError
            print("OPERATOR_ENV_PROBE=PASS")
            print(f"response_bytes={size}")
            print(f"response_sha256={digest}")
            print(f"elapsed_ms={elapsed}")
            return
        if (data["status"] != "BLOCKED" or data["backend_safe_code"] not in BACKEND_CODES
                or data["diagnostic_class"] not in DIAGNOSTIC_CLASSES
                or not isinstance(data["returncode"], int)
                or isinstance(data["returncode"], bool)
                or not -999 <= data["returncode"] <= 255):
            raise ValueError
        print("OPERATOR_ENV_PROBE=BLOCKED")
        print(f"backend_safe_code={data['backend_safe_code']}")
        print(f"diagnostic_class={data['diagnostic_class']}")
        print(f"returncode={data['returncode']}")
        print(f"elapsed_ms={elapsed}")
        raise SystemExit(1)
    except (KeyError, TypeError, ValueError, subprocess.TimeoutExpired):
        print("OPERATOR_ENV_PROBE=BLOCKED")
        print("backend_safe_code=PROBE_RESULT_INVALID")
        print("diagnostic_class=CLAUDE_DIAG_UNKNOWN_NONZERO")
        print("returncode=-999")
        print(f"elapsed_ms={int((time.monotonic() - started) * 1000)}")
        raise SystemExit(1) from None


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--backend", type=Path, required=True)
    parser.add_argument("--python", type=Path)
    parser.add_argument("--inner", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.inner:
        _inner(_checked_backend(args.backend))
    else:
        if args.python is None:
            parser.error("--python is required")
        _outer(args.backend, args.python.absolute())  # keep venv symlink intact


if __name__ == "__main__":
    main()
