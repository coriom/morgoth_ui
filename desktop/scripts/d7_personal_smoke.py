"""Disposable D7 native transport/persistence proof; never opens a real account."""
from __future__ import annotations

import os
from pathlib import Path
import subprocess
import sys
import tempfile

BACKEND_SHA = "3f18a375453af0c8efe2586440b3e8612707c6f2"
BACKEND = Path("/home/corio/Morgoth/dev-desktop-d6-backend")


def git(root: Path, *args: str) -> str:
    """Read only bounded Git metadata."""
    return subprocess.check_output(["git", "-C", str(root), *args], text=True,
                                   stderr=subprocess.DEVNULL, timeout=10).strip()


def main() -> int:
    """Exercise real Management and native stores against test-owned directories."""
    ui = Path(__file__).resolve().parents[2]
    if git(BACKEND, "rev-parse", "HEAD") != BACKEND_SHA or git(BACKEND, "status", "--porcelain", "--untracked-files=all"):
        raise SystemExit("BACKEND_PIN_INVALID")
    with tempfile.TemporaryDirectory(prefix="morgoth-d7-native-") as directory:
        root = Path(directory)
        home = root / "management"
        home.mkdir(mode=0o700)
        local = root / "appdata"
        local.mkdir(mode=0o700)
        env = os.environ.copy()
        env.update({"MORGOTH_DESKTOP_BACKEND_ROOT": str(BACKEND),
                    "MORGOTH_DESKTOP_PYTHON": "/home/corio/Morgoth/morgoth/.venv/bin/python",
                    "MORGOTH_DESKTOP_HOME": str(home), "D7_SMOKE_DATA_ROOT": str(local)})
        binary = ui / "desktop/src-tauri/target/debug/d7-personal-smoke"
        subprocess.run([str(binary)], env=env, cwd=ui, check=True, timeout=60)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
