#!/usr/bin/env python3
"""Build and seal only the two fixed D13 Windows test executables."""
from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys

from build_d11 import BRANCH, ROOT, digest, git


def main() -> None:
    if git("branch", "--show-current") != BRANCH or git("status", "--porcelain", "--untracked-files=all"):
        raise RuntimeError("SOURCE_NOT_CLEAN")
    powershell = Path("/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe")
    if not powershell.is_file() or not os.environ.get("WSL_INTEROP"):
        raise RuntimeError("WINDOWS_INTEROP_UNAVAILABLE")
    windows_root = subprocess.run(["wslpath", "-w", str(ROOT)], capture_output=True, text=True,
                                  check=False, timeout=5)
    if windows_root.returncode or not windows_root.stdout.startswith("\\\\wsl.localhost\\"):
        raise RuntimeError("WINDOWS_ROOT_UNAVAILABLE")
    script = windows_root.stdout.strip() + r"\desktop\windows\build.ps1"
    env = {"WSL_INTEROP": os.environ["WSL_INTEROP"]}
    result = subprocess.run([str(powershell), "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
                             "-File", script, "-Root", windows_root.stdout.strip()],
                            env=env, capture_output=True, timeout=120, check=False)
    if result.returncode or result.stdout.strip() != b"D13_WINDOWS_BUILD_OK":
        raise RuntimeError("WINDOWS_BUILD_FAILED")
    target_dir = ROOT / "desktop/windows/target"
    companion = target_dir / "morgoth-d13-companion.exe"
    target = target_dir / "morgoth-d13-test-target.exe"
    for item in (target_dir, companion, target):
        if item.is_symlink():
            raise RuntimeError("WINDOWS_ARTIFACT_UNTRUSTED")
    if not target_dir.is_dir() or not companion.is_file() or not target.is_file():
        raise RuntimeError("WINDOWS_ARTIFACT_MISSING")
    target_dir.chmod(0o700)
    companion.chmod(0o700)
    target.chmod(0o700)
    receipt = {"format": 1, "source_sha": git("rev-parse", "HEAD"),
               "companion_sha256": digest(companion), "target_sha256": digest(target)}
    path = target_dir / "d13-windows-receipt.json"
    temporary = target_dir / "d13-windows-receipt.json.tmp"
    temporary.write_text(json.dumps(receipt, sort_keys=True) + "\n", encoding="utf-8")
    temporary.chmod(0o600)
    os.replace(temporary, path)
    print("D13_WINDOWS_READY SOURCE_SHA=" + receipt["source_sha"])


if __name__ == "__main__":
    try:
        main()
    except (OSError, RuntimeError, subprocess.SubprocessError) as exc:
        print("D13_WINDOWS_BUILD_BLOCKED=" +
              (str(exc) if isinstance(exc, RuntimeError) else "BUILD_IO_FAILURE"), file=sys.stderr)
        raise SystemExit(2) from None
