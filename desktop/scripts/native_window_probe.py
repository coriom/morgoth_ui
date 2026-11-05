#!/usr/bin/env python3
"""Bounded sealed-window smoke on an explicitly isolated X11 display."""
from __future__ import annotations

import argparse
import os
from pathlib import Path
import re
import signal
import subprocess
import time

from build_d11 import DESKTOP
from launch_d11 import safe_directory


STAGES = (
    "RELEASE_PREFLIGHT_OK",
    "MANAGEMENT_SUPERVISOR_STARTED",
    "TAURI_SETUP_STARTED",
    "MAIN_WINDOW_CREATED",
    "WEBVIEW_DOCUMENT_LOADED",
    "MANAGEMENT_READY",
)


def main() -> int:
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--home", type=Path, help="existing test-owned Management home")
    mode.add_argument("--preview", action="store_true")
    parser.add_argument("--test-root", type=Path, required=True,
                        help="existing private directory for isolated application data")
    parser.add_argument("--timeout", type=int, default=45)
    args = parser.parse_args()
    if os.environ.get("MORGOTH_D25_ISOLATED_DISPLAY") != "1" or not os.environ.get("DISPLAY"):
        raise RuntimeError("ISOLATED_X11_REQUIRED")
    if not 5 <= args.timeout <= 90:
        raise RuntimeError("TIMEOUT_INVALID")
    safe_directory(args.test_root, private=True)
    if args.home:
        safe_directory(args.home, private=True)
    for name in ("home", "data", "cache"):
        path = args.test_root / name
        path.mkdir(mode=0o700, exist_ok=True)
        safe_directory(path, private=True)
    env = {name: os.environ[name] for name in ("DISPLAY", "XAUTHORITY") if name in os.environ}
    env.update({"HOME": str(args.test_root / "home"),
                "XDG_DATA_HOME": str(args.test_root / "data"),
                "XDG_CACHE_HOME": str(args.test_root / "cache"),
                "XDG_RUNTIME_DIR": os.environ.get("XDG_RUNTIME_DIR", "/run/user/1000"),
                "GDK_BACKEND": "x11", "LANG": "C.UTF-8", "PATH": "/usr/bin:/bin"})
    command = ["/usr/bin/python3", str(DESKTOP / "scripts/launch_d11.py")]
    command += ["--home", str(args.home)] if args.home else ["--preview"]
    log_path = args.test_root / ("native-persistent.log" if args.home else "native-preview.log")
    with log_path.open("w", encoding="utf-8") as log:
        process = subprocess.Popen(command, cwd=DESKTOP, env=env, stdout=log,
                                   stderr=subprocess.STDOUT)
        window_seen = False
        started = time.monotonic()
        try:
            while time.monotonic() - started < args.timeout and process.poll() is None:
                time.sleep(0.5)
                tree = subprocess.run(["/usr/bin/xwininfo", "-root", "-tree"], env=env,
                                      capture_output=True, text=True, timeout=5, check=False)
                window_seen = tree.returncode == 0 and any(
                    re.search(r'0x[0-9a-f]+\s+"Morgoth · Command Center"', line)
                    for line in tree.stdout.splitlines())
                lines = log_path.read_text(encoding="utf-8", errors="replace").splitlines()
                stages = [stage for stage in STAGES if stage in lines]
                if window_seen and "WEBVIEW_DOCUMENT_LOADED" in stages:
                    break
            lines = log_path.read_text(encoding="utf-8", errors="replace").splitlines()
            stages = [stage for stage in STAGES if stage in lines]
            failures = [line for line in lines if re.fullmatch(r"(?:STARTUP_FAILED|MANAGEMENT_FAILED|D25_LAUNCH_BLOCKED)=[A-Z_]+", line)]
            passed = window_seen and "WEBVIEW_DOCUMENT_LOADED" in stages and process.poll() is None
            print("D25_NATIVE_WINDOW=" + ("PASS" if passed else "FAIL"))
            print("D25_NATIVE_STAGES=" + ",".join(stages))
            print("D25_NATIVE_FAILURES=" + ",".join(failures[:3]))
            print("D25_NATIVE_ELAPSED_SECONDS=" + str(round(time.monotonic() - started, 1)))
            return 0 if passed else 2
        finally:
            if process.poll() is None:
                process.send_signal(signal.SIGINT)
                try:
                    process.wait(timeout=15)
                except subprocess.TimeoutExpired:
                    process.terminate()
                    process.wait(timeout=5)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, RuntimeError, subprocess.SubprocessError) as exc:
        print("D25_NATIVE_PROBE_BLOCKED=" + (str(exc) if isinstance(exc, RuntimeError) else "LOCAL_PROBE_FAILURE"))
        raise SystemExit(2) from None
