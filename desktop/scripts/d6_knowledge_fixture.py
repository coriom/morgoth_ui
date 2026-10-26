"""Disposable D6 native proof and optional real Tauri window; synthetic vault only."""
from __future__ import annotations

import argparse
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
from urllib.request import ProxyHandler, build_opener

BACKEND_SHA = "3f18a375453af0c8efe2586440b3e8612707c6f2"
BRANCH = "feat/morgoth-desktop-d6-knowledge-v1"


def git(root: Path, *args: str) -> str:
    return subprocess.check_output(["git", "-C", str(root), *args], text=True, timeout=8).strip()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--window", action="store_true")
    parser.add_argument("--x11", action="store_true")
    args = parser.parse_args()
    ui = Path(__file__).resolve().parents[2]
    backend = ui.parent / "dev-desktop-d6-backend"
    if git(ui, "branch", "--show-current") != BRANCH or git(ui, "status", "--porcelain", "--untracked-files=all"):
        raise SystemExit("D6_UI_CHECKOUT_INVALID")
    if git(backend, "rev-parse", "HEAD") != BACKEND_SHA or git(backend, "status", "--porcelain", "--untracked-files=all"):
        raise SystemExit("D6_BACKEND_CHECKOUT_INVALID")
    sys.path.insert(0, str(backend))
    from core.runtime import RuntimeHome
    from project_manager import ProjectManager
    with tempfile.TemporaryDirectory(prefix="morgoth-d6-fixture-") as temporary:
        home = Path(temporary) / "home"
        home.mkdir(mode=0o700)
        manager = ProjectManager(RuntimeHome(home, home / "projects"))
        manager.create_project("project_a", name="Projet A synthétique", domain="crypto")
        manager.create_project("project_b", name="Projet B synthétique", domain="crypto")
        vault = home / "projects" / "project_a" / "vault"
        (vault / "index.md").write_text("# Index synthétique\n\n[[topic|Procédure]] et [[missing|Lien absent]].\n", encoding="utf-8")
        (vault / "topic.md").write_text("# Procédure synthétique\n\nConnaissance persistée, fixture seulement.\n", encoding="utf-8")
        desktop = ui / "desktop"
        env = {"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "HOME": str(home), "LANG": "C.UTF-8",
               "XDG_DATA_HOME": str(home / ".local" / "share"),
               "MORGOTH_DESKTOP_BACKEND_ROOT": str(backend),
               "MORGOTH_DESKTOP_PYTHON": sys.executable,
               "MORGOTH_DESKTOP_HOME": str(home)}
        subprocess.run([str(desktop / "src-tauri/target/debug/d6-knowledge-smoke")], env=env, cwd=ui, check=True, timeout=35)
        if args.window:
            gui = {**env, "DISPLAY": os.environ.get("DISPLAY", ""),
                   "WAYLAND_DISPLAY": os.environ.get("WAYLAND_DISPLAY", ""),
                   "XDG_RUNTIME_DIR": os.environ.get("XDG_RUNTIME_DIR", "")}
            if args.x11:
                gui["GDK_BACKEND"] = "x11"
            vite = subprocess.Popen(["npm", "run", "dev", "--", "--strictPort"], cwd=desktop,
                                    env=gui, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            try:
                opener = build_opener(ProxyHandler({}))
                for _ in range(40):
                    if vite.poll() is not None:
                        raise RuntimeError("D6_VITE_UNAVAILABLE")
                    try:
                        with opener.open("http://127.0.0.1:5173", timeout=1) as response:
                            if response.status == 200:
                                break
                    except OSError:
                        time.sleep(.2)
                else:
                    raise RuntimeError("D6_VITE_UNAVAILABLE")
                print("D6_WINDOW=OPEN Select project_a, Knowledge > Morgoth; project_b is empty. Synthetic data only.", flush=True)
                subprocess.run([str(desktop / "src-tauri/target/debug/morgoth-desktop")], env=gui, cwd=ui, check=True)
            finally:
                vite.terminate()
                try:
                    vite.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    vite.kill(); vite.wait(timeout=5)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
