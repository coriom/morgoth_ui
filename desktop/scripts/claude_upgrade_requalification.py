"""Gate at most two private Claude CLI probes after an operator-local update."""
from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time
from typing import Callable

from claude_auth_safe_mode import (
    BACKEND_CODES, _version, bounded_returncode, diagnostic_environment,
    sanitize_auth,
)
from claude_env_differential import _checked_backend


MINIMUM_VERSION = (2, 1, 169)
PROMPT = "Reply with exactly OK."
REQUIRED_FLAGS = ("-p", "--output-format", "--tools", "--safe-mode",
                  "--no-session-persistence", "--debug-file")


def version_tuple(value: str) -> tuple[int, int, int] | None:
    """Parse the three numeric Claude Code version components."""
    match = re.fullmatch(r"(\d+)\.(\d+)\.(\d+) \(Claude Code\)", value)
    return tuple(map(int, match.groups())) if match else None


def sanitize_update_result(exit_code: int, private_output: str) -> tuple[int, str]:
    """Return only bounded exit and one fixed update class."""
    code = bounded_returncode(exit_code)
    if code != 0:
        return code, "UPDATE_FAILED"
    text = private_output.lower()[:65536]
    if any(signature in text for signature in (
        "already up to date", "already on the latest", "already current",
    )):
        return code, "UPDATE_ALREADY_CURRENT"
    return code, "UPDATE_OK"


def help_flags(private_help: str) -> dict[str, bool]:
    """Detect only explicit CLI option tokens, never publish help text."""
    return {flag: bool(re.search(r"(?<![\w-])" + re.escape(flag) + r"(?![\w-])", private_help))
            for flag in REQUIRED_FLAGS}


def safe_error_code(exc: BaseException) -> str | None:
    """Accept only the backend's fixed safe-code vocabulary."""
    code = getattr(exc, "safe_code", None)
    return code if isinstance(code, str) and code in BACKEND_CODES else None


def safe_returncode(exc: BaseException) -> int:
    """Extract only the backend's bounded numeric nonzero exit, if present."""
    match = re.fullmatch(r"claude CLI exited with returncode (-?\d{1,3})", str(exc))
    return bounded_returncode(int(match.group(1))) if match else -999


def _passed_response(response: str, started: float) -> dict[str, object]:
    body = response.encode("utf-8")
    if not body:
        return {"status": "BLOCKED", "safe_code": "PROBE_EMPTY_RESPONSE",
                "returncode": -999, "elapsed_ms": int((time.monotonic() - started) * 1000)}
    return {"status": "PASS", "response_bytes": len(body),
            "response_sha256": hashlib.sha256(body).hexdigest(),
            "elapsed_ms": int((time.monotonic() - started) * 1000)}


def plain_probe() -> dict[str, object]:
    """Invoke the unmodified pinned provider with runner=None, once."""
    from self_modify.reflect_llm import ReflectLLMError, _claude_cli_call
    started = time.monotonic()
    try:
        response, _ = asyncio.run(_claude_cli_call(PROMPT, runner=None))
    except ReflectLLMError as exc:
        return {"status": "BLOCKED", "safe_code": safe_error_code(exc),
                "returncode": safe_returncode(exc),
                "elapsed_ms": int((time.monotonic() - started) * 1000)}
    except Exception:
        return {"status": "BLOCKED", "safe_code": "PROBE_UNEXPECTED_ERROR",
                "returncode": -999, "elapsed_ms": int((time.monotonic() - started) * 1000)}
    return _passed_response(response, started)


def safe_mode_probe() -> dict[str, object]:
    """Use the backend argv/parser plus only two diagnostic flags, once."""
    from self_modify.reflect_llm import (
        CLAUDE_CLI_TIMEOUT_SECS, ReflectLLMError,
        _build_claude_cli_argv, _parse_claude_cli_json,
    )
    started = time.monotonic()
    with tempfile.TemporaryDirectory(prefix="morgoth-claude-upgrade-") as cwd:
        os.chmod(cwd, 0o700)
        argv = _build_claude_cli_argv(PROMPT) + ["--safe-mode", "--no-session-persistence"]
        try:
            run = subprocess.run(argv, input=PROMPT, capture_output=True, text=True,
                                 cwd=cwd, timeout=CLAUDE_CLI_TIMEOUT_SECS, check=False)
        except FileNotFoundError:
            code = "CLAUDE_CLI_NOT_FOUND"
        except subprocess.TimeoutExpired:
            code = "CLAUDE_CLI_TIMEOUT"
        else:
            if run.returncode:
                return {"status": "BLOCKED", "safe_code": "CLAUDE_CLI_EXIT_NONZERO",
                        "returncode": bounded_returncode(run.returncode),
                        "elapsed_ms": int((time.monotonic() - started) * 1000)}
            try:
                response, _, is_error = _parse_claude_cli_json(run.stdout)
            except ReflectLLMError as exc:
                return {"status": "BLOCKED", "safe_code": safe_error_code(exc),
                        "returncode": 0, "elapsed_ms": int((time.monotonic() - started) * 1000)}
            if is_error:
                return {"status": "BLOCKED", "safe_code": "CLAUDE_CLI_REPORTED_ERROR",
                        "returncode": 0, "elapsed_ms": int((time.monotonic() - started) * 1000)}
            return _passed_response(response.strip(), started)
        return {"status": "BLOCKED", "safe_code": code, "returncode": -999,
                "elapsed_ms": int((time.monotonic() - started) * 1000)}


def qualify(plain: Callable[[], dict[str, object]],
            safe: Callable[[], dict[str, object]]) -> tuple[dict[str, object], dict[str, object] | None, str]:
    """Allow a safe-mode call only after one fixed-coded plain failure."""
    first = plain()
    if first.get("status") == "PASS":
        return first, None, "CLAUDE_PROVIDER_FIXED_BY_CLI_UPDATE"
    if first.get("status") != "BLOCKED" or first.get("safe_code") not in BACKEND_CODES:
        return first, None, "BLOCKED_PLAIN_PROVIDER_UNCLASSIFIED"
    second = safe()
    if second.get("status") == "PASS":
        return first, second, "CLAUDE_CUSTOMIZATION_CAUSE_PROVEN_ON_UPDATED_CLI"
    return first, second, "CLAUDE_PROVIDER_FAILURE_PERSISTS_AFTER_UPDATE"


def _valid_result(result: dict[str, object]) -> bool:
    if not isinstance(result, dict) or result.get("status") not in ("PASS", "BLOCKED"):
        return False
    elapsed = result.get("elapsed_ms")
    if not isinstance(elapsed, int) or isinstance(elapsed, bool) or not 0 <= elapsed <= 610000:
        return False
    if result["status"] == "PASS":
        return (isinstance(result.get("response_bytes"), int) and result["response_bytes"] > 0
                and isinstance(result.get("response_sha256"), str)
                and re.fullmatch(r"[0-9a-f]{64}", result["response_sha256"]) is not None)
    return (result.get("safe_code") in BACKEND_CODES
            and isinstance(result.get("returncode"), int)
            and not isinstance(result.get("returncode"), bool)
            and -999 <= result["returncode"] <= 255)


def _inner(backend: Path) -> None:
    _checked_backend(backend)
    sys.path.insert(0, str(backend))
    first, second, conclusion = qualify(plain_probe, safe_mode_probe)
    print(json.dumps({"plain": first, "safe_mode": second, "conclusion": conclusion}))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--backend", type=Path, required=True)
    parser.add_argument("--python", type=Path)
    parser.add_argument("--inner", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.inner:
        _inner(args.backend)
        return
    try:
        backend = _checked_backend(args.backend)
        env = diagnostic_environment(dict(os.environ))
        version = _version(env)
        print("POST_UPDATE_VERSION=" + version)
        if version_tuple(version) is None or version_tuple(version) < MINIMUM_VERSION:
            print("CONCLUSION=BLOCKED_CLAUDE_UPDATE_INCOMPATIBLE")
            return
        help_run = subprocess.run(["claude", "--help"], env=env, capture_output=True,
                                  text=True, timeout=30, check=False)
        flags = help_flags(help_run.stdout + "\n" + help_run.stderr) if help_run.returncode == 0 else {}
        for flag in REQUIRED_FLAGS:
            print("FLAG_" + flag.lstrip("-").replace("-", "_").upper() + "=" +
                  str(flags.get(flag, False)).lower())
        if not all(flags.get(flag, False) for flag in REQUIRED_FLAGS):
            print("CONCLUSION=BLOCKED_CLAUDE_UPDATE_INCOMPATIBLE")
            return
        auth_run = subprocess.run(["claude", "auth", "status"], env=env,
                                  capture_output=True, text=True, timeout=30, check=False)
        auth = sanitize_auth(auth_run.stdout, auth_run.returncode)
        for key, value in auth.items():
            print("POST_" + key + "=" + (str(value).lower() if isinstance(value, bool) else str(value)))
        if not auth["AUTH_LOGGED_IN"] or auth["AUTH_METHOD"] != "claude.ai":
            print("CONCLUSION=BLOCKED_CLAUDE_AUTH_AFTER_UPDATE")
            return
        if args.python is None or not args.python.is_absolute() or not args.python.is_file():
            print("CONCLUSION=BLOCKED_PYTHON_UNAVAILABLE")
            return
        env["PYTHONDONTWRITEBYTECODE"] = "1"
        run = subprocess.run([str(args.python), str(Path(__file__).resolve()), "--inner",
                              "--backend", str(backend)], env=env, cwd=backend,
                             stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                             text=True, timeout=1230, check=False)
        data = json.loads(run.stdout)
        first, second, conclusion = data["plain"], data["safe_mode"], data["conclusion"]
        unclassified = (conclusion == "BLOCKED_PLAIN_PROVIDER_UNCLASSIFIED"
                        and isinstance(first, dict) and first.get("status") == "BLOCKED"
                        and first.get("safe_code") is None and second is None)
        if run.returncode or (not unclassified and (
                not _valid_result(first) or
                (second is not None and not _valid_result(second)) or
                conclusion not in (
                    "CLAUDE_PROVIDER_FIXED_BY_CLI_UPDATE",
                    "CLAUDE_CUSTOMIZATION_CAUSE_PROVEN_ON_UPDATED_CLI",
                    "CLAUDE_PROVIDER_FAILURE_PERSISTS_AFTER_UPDATE",
                ))):
            raise ValueError
        if unclassified:
            print("PLAIN_PROVIDER_PROBE=BLOCKED")
            print("SAFE_MODE_PROBE=NOT_RUN")
            print("CONCLUSION=BLOCKED_PLAIN_PROVIDER_UNCLASSIFIED")
            return
        for label, result in (("PLAIN_PROVIDER_PROBE", first), ("SAFE_MODE_PROBE", second)):
            print(label + "=" + (result["status"] if result else "NOT_RUN"))
            if result:
                for key in ("safe_code", "returncode", "response_bytes", "response_sha256", "elapsed_ms"):
                    if key in result:
                        print(label + "_" + key.upper() + "=" + str(result[key]))
        print("CONCLUSION=" + conclusion)
    except Exception:
        print("CONCLUSION=BLOCKED_LOCAL_PROBE_ERROR")


if __name__ == "__main__":
    main()
