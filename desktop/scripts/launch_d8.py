#!/usr/bin/env python3
"""Launch the real D8 Tauri Desktop and its owned Vite/Management children."""
from __future__ import annotations

import argparse
import os
from pathlib import Path
import signal
import socket
import stat
import subprocess
import sys
import tempfile
import time
from urllib.request import ProxyHandler, build_opener

BACKEND_SHA = "3f18a375453af0c8efe2586440b3e8612707c6f2"
BACKEND = Path("/home/corio/Morgoth/dev-desktop-d6-backend")
BRANCH = "feat/morgoth-desktop-d8-workspace-backup-v1"


def git(root: Path, *args: str) -> str:
    """Return bounded Git metadata without stderr or user configuration output."""
    result = subprocess.run(["git", "-C", str(root), *args], capture_output=True,
                            text=True, timeout=10, check=False)
    if result.returncode or len(result.stdout) > 4096:
        raise RuntimeError("GIT_CHECK_FAILED")
    return result.stdout.strip()


def ensure_home(path: Path) -> None:
    """Create only the explicitly selected leaf; reject unsafe existing homes."""
    if not path.is_absolute() or path == Path(path.anchor) or ".." in path.parts:
        raise RuntimeError("HOME_PATH_INVALID")
    for component in (path, *path.parents):
        if component.is_symlink():
            raise RuntimeError("HOME_SYMLINK_REFUSED")
    if not path.exists():
        if not path.parent.is_dir():
            raise RuntimeError("HOME_PARENT_UNAVAILABLE")
        path.mkdir(mode=0o700)
        parent = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            os.fsync(parent)
        finally:
            os.close(parent)
    meta = path.stat()
    if not stat.S_ISDIR(meta.st_mode) or meta.st_uid != os.getuid() or stat.S_IMODE(meta.st_mode) & 0o077:
        raise RuntimeError("HOME_UNSAFE")


def check_port() -> None:
    """Refuse an already occupied Vite port; never connect to an unrelated UI."""
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 5173))


def stop_owned(process: subprocess.Popen[bytes]) -> None:
    """Stop only a subprocess group created by this launcher."""
    if process.poll() is not None:
        return
    os.killpg(process.pid, signal.SIGTERM)
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        if process.poll() is None:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait(timeout=5)


def main() -> int:
    """Run one foreground native window; never initialize agent storage."""
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--home", type=Path, help="explicit persistent Management home")
    group.add_argument("--preview", action="store_true", help="temporary, empty synthetic workspace")
    parser.add_argument("--check", action="store_true", help="validate paths without launching")
    args = parser.parse_args()
    ui = Path(__file__).resolve().parents[2]
    desktop = ui / "desktop"
    if git(ui, "branch", "--show-current") != BRANCH or git(BACKEND, "rev-parse", "HEAD") != BACKEND_SHA:
        raise RuntimeError("CHECKOUT_MISMATCH")
    if git(BACKEND, "status", "--porcelain", "--untracked-files=all"):
        raise RuntimeError("BACKEND_NOT_CLEAN")
    python = Path("/home/corio/Morgoth/morgoth/.venv/bin/python")
    if not python.is_file() or not (desktop / "node_modules/.bin/vite").is_file():
        raise RuntimeError("DEPENDENCIES_UNAVAILABLE")
    temporary = tempfile.TemporaryDirectory(prefix="morgoth-d8-preview-") if args.preview else None
    try:
        home = Path(temporary.name) / "management" if temporary else args.home
        if temporary:
            home.mkdir(mode=0o700)
        ensure_home(home)
        if args.check:
            print("D8_CHECK_OK=true MODE=" + ("DISPOSABLE" if temporary else "PERSISTENT"))
            return 0
        check_port()
        binary = desktop / "src-tauri/target/debug/morgoth-desktop"
        subprocess.run(["cargo", "build", "--locked", "--offline", "--features", "desktop",
                        "--bin", "morgoth-desktop"], cwd=desktop / "src-tauri", check=True)
        env = os.environ.copy()
        env.update({"MORGOTH_DESKTOP_BACKEND_ROOT": str(BACKEND),
                    "MORGOTH_DESKTOP_PYTHON": str(python), "MORGOTH_DESKTOP_HOME": str(home)})
        if temporary:
            env["HOME"] = temporary.name
            env["XDG_DATA_HOME"] = str(Path(temporary.name) / ".local/share")
        vite = subprocess.Popen(["npm", "run", "dev", "--", "--strictPort"], cwd=desktop,
                                env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                start_new_session=True)
        try:
            opener = build_opener(ProxyHandler({}))
            for _ in range(50):
                if vite.poll() is not None:
                    raise RuntimeError("VITE_START_FAILED")
                try:
                    with opener.open("http://127.0.0.1:5173/src/main.tsx", timeout=.5) as response:
                        if response.status == 200 and b"App.tsx" in response.read(4096):
                            break
                except OSError:
                    pass
                time.sleep(.2)
            else:
                raise RuntimeError("VITE_START_TIMEOUT")
            print("D8_WINDOW_START MODE=" + ("DISPOSABLE" if temporary else "PERSISTENT")
                  + " MANAGEMENT_HOME=" + str(home), flush=True)
            app = subprocess.Popen([str(binary)], cwd=ui, env=env, start_new_session=True)
            try:
                return app.wait()
            except KeyboardInterrupt:
                stop_owned(app)
                return 130
        finally:
            stop_owned(vite)
    finally:
        if temporary:
            temporary.cleanup()


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (RuntimeError, OSError, subprocess.SubprocessError) as exc:
        code = str(exc) if isinstance(exc, RuntimeError) else "LAUNCH_FAILED"
        print("D8_LAUNCH_BLOCKED=" + code, file=sys.stderr)
        raise SystemExit(2) from None
