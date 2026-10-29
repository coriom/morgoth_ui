#!/usr/bin/env python3
"""Run the sealed D11 native release without Node, Vite or compilation."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile

from build_d11 import BRANCH, DESKTOP, ROOT, digest, git

BACKEND_SHA = "a91377c9ace8d70bf64aa44b3bd54773af612e3a"


def safe_directory(path: Path, *, private: bool = False) -> None:
    """Validate a trusted operator-selected directory without resolving symlinks."""
    if not path.is_absolute() or ".." in path.parts:
        raise RuntimeError("PATH_INVALID")
    for part in (path, *path.parents):
        if part.is_symlink():
            raise RuntimeError("PATH_SYMLINK_REFUSED")
    try:
        meta = path.stat()
    except FileNotFoundError as exc:
        raise RuntimeError("MANAGEMENT_HOME_MISSING" if private else "BACKEND_ROOT_MISSING") from exc
    except OSError as exc:
        raise RuntimeError("PATH_UNAVAILABLE") from exc
    if not stat.S_ISDIR(meta.st_mode) or (private and (meta.st_uid != os.getuid() or stat.S_IMODE(meta.st_mode) & 0o077)):
        raise RuntimeError("PATH_UNSAFE")


def main() -> int:
    """Verify the release and launch only the compatible local backend owner."""
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--home", type=Path, help="existing, private persistent Management home")
    mode.add_argument("--preview", action="store_true", help="disposable empty application data")
    parser.add_argument("--backend-root", type=Path, default=Path("/home/corio/Morgoth/dev-desktop-d9-backend"))
    parser.add_argument("--python", type=Path, default=Path("/home/corio/Morgoth/morgoth/.venv/bin/python"))
    parser.add_argument("--memory-read-config", type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if git("branch", "--show-current") != BRANCH or git("status", "--porcelain", "--untracked-files=all"):
        raise RuntimeError("SOURCE_NOT_CLEAN")
    binary = DESKTOP / "src-tauri/target/release/morgoth-desktop"
    receipt_path = binary.parent / "morgoth-d13-release.json"
    if not binary.is_file():
        raise RuntimeError("RELEASE_BINARY_MISSING")
    if not receipt_path.is_file():
        raise RuntimeError("RELEASE_RECEIPT_MISSING")
    try:
        receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise RuntimeError("RELEASE_RECEIPT_INVALID") from exc
    if set(receipt) != {"format", "source_sha", "binary_sha256", "asset_index_sha256"} or receipt["format"] != 1 or receipt["source_sha"] != git("rev-parse", "HEAD") or receipt["binary_sha256"] != digest(binary) or receipt["asset_index_sha256"] != digest(DESKTOP / "dist/index.html"):
        raise RuntimeError("RELEASE_IDENTITY_MISMATCH")
    safe_directory(args.backend_root)
    try:
        backend = subprocess.run(["git", "-C", str(args.backend_root), "rev-parse", "HEAD"], capture_output=True, text=True, timeout=20)
        status = subprocess.run(["git", "-C", str(args.backend_root), "status", "--porcelain", "--untracked-files=all"], capture_output=True, text=True, timeout=20)
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError("BACKEND_CHECKOUT_TIMEOUT") from exc
    except OSError as exc:
        raise RuntimeError("BACKEND_CHECKOUT_UNAVAILABLE") from exc
    if backend.returncode or backend.stdout.strip() != BACKEND_SHA or status.returncode or status.stdout.strip():
        raise RuntimeError("BACKEND_CHECKOUT_MISMATCH")
    if not args.python.is_absolute() or ".." in args.python.parts or not args.python.is_file() or not os.access(args.python, os.X_OK):
        raise RuntimeError("PYTHON_UNAVAILABLE")
    if args.memory_read_config is not None:
        config = args.memory_read_config
        if args.preview or not config.is_absolute() or ".." in config.parts or config.is_symlink():
            raise RuntimeError("MEMORY_CONFIG_REFUSED")
        meta = config.stat()
        if not stat.S_ISREG(meta.st_mode) or meta.st_uid != os.getuid() or stat.S_IMODE(meta.st_mode) & 0o077:
            raise RuntimeError("MEMORY_CONFIG_REFUSED")
    temporary = tempfile.TemporaryDirectory(prefix="morgoth-d11-preview-") if args.preview and not args.check else None
    try:
        home = Path(temporary.name) / "management" if temporary else args.home
        if temporary:
            home.mkdir(mode=0o700)
        if home is not None:
            safe_directory(home, private=True)
        if args.check:
            print("D13_RELEASE_CHECK_OK")
            return 0
        env = os.environ.copy()
        env.pop("MORGOTH_DESKTOP_MEMORY_READ_CONFIG", None)
        env.update({"MORGOTH_DESKTOP_BACKEND_ROOT": str(args.backend_root),
                    "MORGOTH_DESKTOP_PYTHON": str(args.python), "MORGOTH_DESKTOP_HOME": str(home)})
        if args.memory_read_config is not None:
            env["MORGOTH_DESKTOP_MEMORY_READ_CONFIG"] = str(args.memory_read_config)
        if temporary:
            env["HOME"] = temporary.name
            env["XDG_DATA_HOME"] = str(Path(temporary.name) / ".local/share")
        print("D13_RELEASE_START MODE=" + ("DISPOSABLE" if temporary else "PERSISTENT"), flush=True)
        app = subprocess.Popen([str(binary)], cwd=ROOT, env=env, start_new_session=True)
        try:
            return app.wait()
        except KeyboardInterrupt:
            app.terminate()
            try:
                app.wait(timeout=5)
            except subprocess.TimeoutExpired:
                app.kill()
                app.wait(timeout=5)
            return 130
    finally:
        if temporary:
            temporary.cleanup()


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, RuntimeError, ValueError, KeyError, subprocess.SubprocessError) as exc:
        print("D13_LAUNCH_BLOCKED=" + (str(exc) if isinstance(exc, RuntimeError) else "LOCAL_PREFLIGHT_FAILURE"), file=sys.stderr)
        raise SystemExit(2) from None
