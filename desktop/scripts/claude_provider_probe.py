"""One isolated Claude call through the exact pinned backend provider path."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import time


PINNED_BACKEND = "9b982540e4bb53a2b5045d22dc67eee525a557eb"
PROBE_CODE = r'''
import asyncio
import hashlib
import json
import time
from self_modify.reflect_llm import ReflectLLMError, _claude_cli_call

async def probe():
    start = time.monotonic()
    try:
        result, _metadata = await _claude_cli_call("Reply with exactly OK.", runner=None)
    except ReflectLLMError as exc:
        print(json.dumps({"status": "BLOCKED", "error_code": exc.safe_code,
                          "elapsed_ms": int((time.monotonic() - start) * 1000)}))
    except Exception:
        print(json.dumps({"status": "BLOCKED", "error_code": "PROBE_UNEXPECTED_ERROR",
                          "elapsed_ms": int((time.monotonic() - start) * 1000)}))
    else:
        body = result.encode("utf-8")
        print(json.dumps({"status": "PASS" if body else "BLOCKED",
                          "error_code": None if body else "PROBE_EMPTY_RESPONSE",
                          "response_bytes": len(body),
                          "response_sha256": hashlib.sha256(body).hexdigest(),
                          "elapsed_ms": int((time.monotonic() - start) * 1000)}))

asyncio.run(probe())
'''


def provider_environment() -> tuple[str, dict[str, str]]:
    """Mirror native ProviderRuntime PATH/HOME/LANG without inheriting secrets."""
    native_path = os.environ.get("PATH", "")
    home = os.environ.get("HOME", "")
    claude = shutil.which("claude", path=native_path)
    if not claude or not home or not Path(home).is_absolute():
        raise RuntimeError("BLOCKED_CLAUDE_BINARY_OR_HOME")
    dirs = [Path(claude).parent]
    with open(claude, "rb") as executable:
        shebang = executable.read(96)
    if shebang.startswith(b"#!/usr/bin/env node"):
        node = shutil.which("node", path=native_path)
        if not node:
            raise RuntimeError("BLOCKED_NODE_RUNTIME_MISSING")
        dirs.append(Path(node).parent)
    dirs.extend([Path("/usr/bin"), Path("/bin")])
    unique = []
    for directory in dirs:
        if (not directory.is_absolute() or ".." in directory.parts
                or not directory.is_dir()):
            raise RuntimeError("BLOCKED_PROVIDER_PATH_INVALID")
        if directory not in unique:
            unique.append(directory)
    return claude, {"PATH": os.pathsep.join(map(str, unique)), "HOME": home,
                    "LANG": "C.UTF-8", "PYTHONDONTWRITEBYTECODE": "1"}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--backend", type=Path, required=True)
    parser.add_argument("--python", type=Path, required=True)
    args = parser.parse_args()
    backend = args.backend.resolve(strict=True)
    python = args.python.absolute()  # preserve the virtualenv symlink
    if not python.is_file():
        raise RuntimeError("BLOCKED_PYTHON_UNAVAILABLE")
    head = subprocess.check_output(["git", "-C", str(backend), "rev-parse", "HEAD"], text=True).strip()
    if head != PINNED_BACKEND or subprocess.check_output(
        ["git", "-C", str(backend), "status", "--porcelain", "--untracked-files=all"]
    ):
        raise RuntimeError("BLOCKED_BACKEND_PIN_OR_DIRTY")
    claude, env = provider_environment()
    start = time.monotonic()
    version = subprocess.run([claude, "--version"], env=env, cwd=backend,
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                             timeout=10, check=False)
    help_result = subprocess.run([claude, "--help"], env=env, cwd=backend,
                                 stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                 timeout=10, check=False)
    help_text = (help_result.stdout + help_result.stderr).decode("utf-8", "replace")
    flags = {
        "-p": re.search(r"(?:^|\s)-p(?:[\s,]|$)", help_text) is not None,
        "--output-format": "--output-format" in help_text,
        "--tools": "--tools" in help_text,
    }
    print(json.dumps({"version_ok": version.returncode == 0,
                      "help_ok": help_result.returncode == 0, "flags": flags}))
    if version.returncode != 0 or help_result.returncode != 0 or not all(flags.values()):
        print(json.dumps({"status": "BLOCKED", "error_code": "PROBE_CLI_CONTRACT_UNAVAILABLE",
                          "elapsed_ms": int((time.monotonic() - start) * 1000)}))
        raise SystemExit(1)
    # Exactly one inference. The pinned function owns stdin transport and neutral cwd.
    try:
        completed = subprocess.run([str(python), "-c", PROBE_CODE], cwd=backend,
                                   env=env, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                   timeout=640, check=False, text=True)
    except subprocess.TimeoutExpired:
        print(json.dumps({"status": "BLOCKED", "error_code": "PROBE_OUTER_TIMEOUT",
                          "elapsed_ms": int((time.monotonic() - start) * 1000)}))
        raise SystemExit(1)
    try:
        result = json.loads(completed.stdout.strip())
        if (completed.returncode != 0 or result["status"] not in ("PASS", "BLOCKED")
                or not isinstance(result["elapsed_ms"], int)):
            raise ValueError
        if result["status"] == "BLOCKED" and result.get("error_code") not in {
            "CLAUDE_CLI_NOT_FOUND", "CLAUDE_CLI_TIMEOUT", "CLAUDE_CLI_EXIT_NONZERO",
            "CLAUDE_CLI_JSON_INVALID", "CLAUDE_CLI_JSON_NOT_OBJECT",
            "CLAUDE_CLI_REPORTED_ERROR", "PROBE_UNEXPECTED_ERROR", "PROBE_EMPTY_RESPONSE",
        }:
            raise ValueError
        if result["status"] == "PASS" and (result.get("response_bytes", 0) < 1
                                            or not re.fullmatch(r"[0-9a-f]{64}", result.get("response_sha256", ""))):
            raise ValueError
    except (KeyError, TypeError, ValueError):
        result = {"status": "BLOCKED", "error_code": "PROBE_RESULT_INVALID",
                  "elapsed_ms": int((time.monotonic() - start) * 1000)}
    print(json.dumps(result, sort_keys=True))
    if result["status"] != "PASS":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
