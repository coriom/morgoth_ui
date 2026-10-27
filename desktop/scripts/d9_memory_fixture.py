"""Disposable D9 PostgreSQL -> Management -> Rust proof and optional Tauri window."""
from __future__ import annotations

import argparse
import asyncio
import getpass
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
from urllib.request import ProxyHandler, build_opener
from uuid import UUID

BACKEND_SHA = "a91377c9ace8d70bf64aa44b3bd54773af612e3a"
UI_BRANCH = "feat/morgoth-desktop-d9-structured-memory-v1"
PG_BIN = Path("/usr/lib/postgresql/16/bin")
PORT = "55439"


def git(root: Path, *args: str) -> str:
    return subprocess.check_output(["git", "-C", str(root), *args], text=True, timeout=12).strip()


def pg(*args: str) -> None:
    subprocess.run(args, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=45)


async def populate(socket: Path, home: Path) -> None:
    import asyncpg
    from core.runtime import RuntimeHome
    from project_manager import ProjectManager

    manager = ProjectManager(RuntimeHome(home, home / "projects"))
    manager.create_project("alpha", name="Alpha synthétique", domain="crypto")
    manager.create_project("beta", name="Beta synthétique", domain="crypto")
    projects = {p.id: p for p in manager._catalog()}
    conn = await asyncpg.connect(host=str(socket), port=int(PORT), database="morgoth_test", user=getpass.getuser())
    try:
        for project in (projects["alpha"], projects["beta"]):
            schema = project.postgres_schema
            await conn.execute(f'CREATE SCHEMA "{schema}"')
            await conn.execute(f'''CREATE TABLE "{schema}".theses (
                thesis_id UUID PRIMARY KEY, subject TEXT, claim TEXT, confidence TEXT,
                evidence JSONB, status TEXT, objective_id TEXT, created_at TIMESTAMPTZ,
                canonical_subject TEXT, quarantine_reason TEXT, superseded_by UUID,
                code_version TEXT)''')
            await conn.execute(f'''CREATE TABLE "{schema}".contradictions (
                contradiction_id UUID PRIMARY KEY, subject_group TEXT, thesis_id_a UUID,
                thesis_id_b UUID, detected_at TIMESTAMPTZ, resolution TEXT)''')
        alpha = projects["alpha"].postgres_schema
        beta = projects["beta"].postgres_schema
        await conn.execute("CREATE ROLE desktop_memory_reader LOGIN")
        await conn.execute(f'GRANT USAGE ON SCHEMA "{alpha}" TO desktop_memory_reader')
        await conn.execute(f'GRANT SELECT ON "{alpha}".theses, "{alpha}".contradictions TO desktop_memory_reader')
        first = UUID("00000000-0000-4000-8000-000000000001")
        second = UUID("00000000-0000-4000-8000-000000000002")
        relation = UUID("00000000-0000-4000-8000-000000000003")
        for identity, subject, claim, status in ((first, "Sujet Alpha", "Affirmation synthétique A", "active"),
            (second, "Sujet Beta", "Affirmation synthétique B", "contradicted")):
            await conn.execute(f'INSERT INTO "{alpha}".theses VALUES ($1,$2,$3,$4,$5::jsonb,$6,NULL,now(),NULL,NULL,NULL,$7)',
                identity, subject, claim, "medium", '[{"source":"fixture"}]', status, "fixture-v1")
        await conn.execute(f'INSERT INTO "{alpha}".contradictions VALUES ($1,$2,$3,$4,now(),NULL)',
            relation, "Sujet partagé", first, second)
        await conn.execute(f'INSERT INTO "{beta}".theses VALUES ($1,$2,$3,$4,$5::jsonb,$6,NULL,now(),NULL,NULL,NULL,$7)',
            UUID("00000000-0000-4000-8000-000000000004"), "PRIVATE BETA", "Foreign claim", "low", "[]", "active", "fixture-v1")
    finally:
        await conn.close()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--window", action="store_true")
    parser.add_argument("--window-seconds", type=int, default=0,
                        help="bound a disposable native window smoke (5–120 seconds)")
    parser.add_argument("--x11", action="store_true")
    args = parser.parse_args()
    if args.window_seconds and (not args.window or not 5 <= args.window_seconds <= 120):
        raise SystemExit("D9_WINDOW_DURATION_INVALID")
    ui = Path(__file__).resolve().parents[2]
    backend = ui.parent / "dev-desktop-d9-backend"
    if git(ui, "branch", "--show-current") != UI_BRANCH or git(ui, "status", "--porcelain", "--untracked-files=all"):
        raise SystemExit("D9_UI_CHECKOUT_INVALID")
    if git(backend, "rev-parse", "HEAD") != BACKEND_SHA or git(backend, "status", "--porcelain", "--untracked-files=all"):
        raise SystemExit("D9_BACKEND_CHECKOUT_INVALID")
    if not PG_BIN.joinpath("initdb").is_file() or os.geteuid() == 0:
        raise SystemExit("D9_POSTGRES_PREREQUISITE_UNAVAILABLE")
    sys.path.insert(0, str(backend))
    with tempfile.TemporaryDirectory(prefix="morgoth-d9-native-") as temporary:
        root = Path(temporary)
        socket = root / "socket"
        socket.mkdir(mode=0o700)
        data = root / "pg"
        home = root / "home"
        home.mkdir(mode=0o700)
        pg(str(PG_BIN / "initdb"), "-D", str(data), "--auth-local=trust", "--auth-host=reject", "--no-instructions")
        pg(str(PG_BIN / "pg_ctl"), "-D", str(data), "-l", str(root / "postgres.log"),
            "-o", f"-k {socket} -h '' -p {PORT}", "start")
        try:
            pg(str(PG_BIN / "createdb"), "-h", str(socket), "-p", PORT, "morgoth_test")
            asyncio.run(populate(socket, home))
            config = home / "memory-reader.json"
            config.write_text(json.dumps({"schema_version": 1, "socket_dir": str(socket),
                "port": int(PORT), "database": "morgoth_test", "role": "desktop_memory_reader"}), encoding="utf-8")
            config.chmod(0o600)
            desktop = ui / "desktop"
            env = {"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "HOME": str(home), "LANG": "C.UTF-8",
                "XDG_DATA_HOME": str(home / ".local/share"), "MORGOTH_DESKTOP_BACKEND_ROOT": str(backend),
                "MORGOTH_DESKTOP_PYTHON": sys.executable, "MORGOTH_DESKTOP_HOME": str(home),
                "MORGOTH_DESKTOP_MEMORY_READ_CONFIG": str(config)}
            subprocess.run([str(desktop / "src-tauri/target/debug/d9-memory-smoke")],
                env=env, cwd=ui, check=True, timeout=40)
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
                    # Vite startup under WSL contention can exceed the old 8 s fixture wait.
                    deadline = time.monotonic() + 30
                    while time.monotonic() < deadline:
                        if vite.poll() is not None:
                            raise RuntimeError("D9_VITE_UNAVAILABLE")
                        try:
                            with opener.open("http://127.0.0.1:5173", timeout=1) as response:
                                if response.status == 200:
                                    break
                        except OSError:
                            time.sleep(.25)
                    else:
                        raise RuntimeError("D9_VITE_UNAVAILABLE")
                    print("D9_WINDOW=OPEN Select alpha > Connaissances > Mémoire structurée. Fixture synthétique.", flush=True)
                    try:
                        subprocess.run([str(desktop / "src-tauri/target/debug/morgoth-desktop")],
                            env=gui, cwd=ui, check=True,
                            timeout=args.window_seconds or None)
                    except subprocess.TimeoutExpired:
                        print("D9_WINDOW_BOUND_REACHED=true", flush=True)
                finally:
                    vite.terminate()
                    try:
                        vite.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        vite.kill(); vite.wait(timeout=5)
        finally:
            pg(str(PG_BIN / "pg_ctl"), "-D", str(data), "-m", "immediate", "stop")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
