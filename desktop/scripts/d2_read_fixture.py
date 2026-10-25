"""Owned, disposable morgoth_test native-read proof and optional D2 window preview.

Never accepts a database URL, real Project home, external destination or production grant.
"""
from __future__ import annotations

import argparse
import asyncio
import os
from pathlib import Path
import pwd
import subprocess
import sys
import tempfile
import time
from urllib.request import ProxyHandler, build_opener


def _run(argv: list[str], *, env: dict[str, str] | None = None) -> None:
    subprocess.run(argv, check=True, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=45)


async def _seed(socket: Path, projects: tuple[object, object]) -> str:
    import asyncpg
    from agents.generalist_mission_engine import CapabilityRecord, CapabilityState, MissionRecord, MissionState
    from agents.generalist_mission_store import _DDL
    conn = await asyncpg.connect(host=str(socket), database="morgoth_test", user=pwd.getpwuid(os.getuid()).pw_name,
                                 timeout=3, command_timeout=5)
    try:
        assert await conn.fetchval("SELECT current_database()") == "morgoth_test"
        for project in projects:
            await conn.execute(f'CREATE SCHEMA "{project.postgres_schema}"')
            await conn.execute(f'SET search_path TO "{project.postgres_schema}"')
            for ddl in _DDL:
                await conn.execute(ddl)
        a = projects[0]
        mission = MissionRecord(project_id=a.id, objective="SYNTHETIC D2 preview mission",
                                state=MissionState.PENDING,
                                state_history=[MissionState.RECEIVED.value, MissionState.PENDING.value])
        capability = CapabilityRecord(project_id=a.id, capability_id="synthetic_read", version="1",
                                      documentation_identity="fixture:desktop_d2", documentation_digest="a" * 64,
                                      operations=["read"], required_scopes=[], valid_until_tick=10,
                                      state=CapabilityState.PENDING_APPROVAL, validation_state="PASSED")
        await conn.execute(f'''INSERT INTO "{a.postgres_schema}".generalist_missions
            (mission_id, project_id, user_id, state, record) VALUES($1,$2,$3,$4,$5::jsonb)''',
            mission.mission_id, a.id, mission.user_id, mission.state.value, mission.model_dump_json())
        await conn.execute(f'''INSERT INTO "{a.postgres_schema}".generalist_capabilities
            (project_id,user_id,capability_id,version,document_digest,record)
            VALUES($1,$2,$3,$4,$5,$6::jsonb)''',
            a.id, capability.user_id, capability.capability_id, capability.version,
            capability.documentation_digest, capability.model_dump_json())
        return str(mission.mission_id)
    finally:
        await conn.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Disposable D2 native read proof")
    parser.add_argument("--window", action="store_true", help="open one local Tauri window after the native read proof")
    args = parser.parse_args()
    ui = Path(__file__).resolve().parents[2]
    root = ui.parent
    backend = root / "dev-desktop-d2-backend"
    branch = subprocess.check_output(["git", "-C", str(ui), "branch", "--show-current"], text=True).strip()
    if branch not in {"feat/morgoth-desktop-d3-model-observability-v1", "feat/morgoth-desktop-d4-mission-workspace-v1"}:
        raise SystemExit("DESKTOP_UI_BRANCH_MISMATCH")
    if subprocess.check_output(["git", "-C", str(ui), "status", "--porcelain", "--untracked-files=all"], text=True).strip():
        raise SystemExit("D2_UI_DIRTY")
    sha = "5fc01cc6f465ff021cac7735d44245ca6e79e87b"
    if subprocess.check_output(["git", "-C", str(backend), "rev-parse", "HEAD"], text=True).strip() != sha:
        raise SystemExit("D2_BACKEND_PIN_MISMATCH")
    if subprocess.check_output(["git", "-C", str(backend), "status", "--porcelain", "--untracked-files=all"], text=True).strip():
        raise SystemExit("D2_BACKEND_DIRTY")
    sys.path.insert(0, str(backend))
    from core.runtime import RuntimeHome
    from project_manager import ProjectManager
    pg_bin = Path("/usr/lib/postgresql/16/bin")
    desktop = ui / "desktop"
    with tempfile.TemporaryDirectory(prefix="morgoth-d2-preview-") as temporary:
        root_tmp = Path(temporary)
        safe_env = {"PATH": "/usr/bin:/bin", "HOME": str(root_tmp), "LANG": "C.UTF-8"}
        socket = root_tmp / "socket"
        socket.mkdir(mode=0o700)
        cluster = root_tmp / "db"
        home = root_tmp / "home"
        home.mkdir(mode=0o700)
        manager = ProjectManager(RuntimeHome(home, home / "projects"))
        for project_id in ("project_a", "project_b"):
            manager.create_project(project_id, name=project_id, domain="crypto")
        projects = tuple(next(p for p in manager._catalog() if p.id == ident) for ident in ("project_a", "project_b"))
        _run([str(pg_bin / "initdb"), "-D", str(cluster), "-A", "trust", "-U", pwd.getpwuid(os.getuid()).pw_name,
              "--no-instructions"], env=safe_env)
        started = False
        vite: subprocess.Popen[bytes] | None = None
        try:
            _run([str(pg_bin / "pg_ctl"), "-D", str(cluster), "-o",
                  f"-c listen_addresses= -k {socket} -c unix_socket_permissions=0700",
                  "-l", str(root_tmp / "postgres.log"), "start"], env=safe_env)
            started = True
            _run(["/usr/bin/createdb", "-h", str(socket), "-U", pwd.getpwuid(os.getuid()).pw_name, "morgoth_test"], env=safe_env)
            mission_id = asyncio.run(_seed(socket, projects))
            env = {"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "HOME": str(home), "LANG": "C.UTF-8",
                   "MORGOTH_DESKTOP_BACKEND_ROOT": str(backend), "MORGOTH_DESKTOP_PYTHON": sys.executable,
                   "MORGOTH_DESKTOP_HOME": str(home), "MORGOTH_DESKTOP_TEST_PG_SOCKET": str(socket),
                   "MORGOTH_D2_TEST_MISSION_ID": mission_id}
            _run([str(desktop / "src-tauri/target/debug/d2-read-smoke")], env=env)
            # A second native process owns a new Management child and token; it
            # must recover the same persisted read without re-seeding the DB.
            _run([str(desktop / "src-tauri/target/debug/d2-read-smoke")], env=env)
            print("D2_NATIVE_PROJECT_READ_PASS=true D2_FRESH_PROCESS_READ_PASS=true DISPOSABLE_TEST_ONLY=true PRODUCTION_QUALIFIED=false", flush=True)
            if args.window:
                opener = build_opener(ProxyHandler({}))
                gui_env = {**env, "DISPLAY": os.environ.get("DISPLAY", ""),
                           "WAYLAND_DISPLAY": os.environ.get("WAYLAND_DISPLAY", ""),
                           "XDG_RUNTIME_DIR": os.environ.get("XDG_RUNTIME_DIR", "")}
                vite = subprocess.Popen(["npm", "run", "dev", "--", "--strictPort"], cwd=desktop, env=gui_env,
                                        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                for _ in range(30):
                    if vite.poll() is not None:
                        raise RuntimeError("D2_VITE_UNAVAILABLE")
                    try:
                        with opener.open("http://127.0.0.1:5173", timeout=1) as response:
                            if response.status == 200 and vite.poll() is None:
                                break
                    except OSError:
                        time.sleep(0.2)
                else:
                    raise RuntimeError("D2_VITE_UNAVAILABLE")
                print("D2_WINDOW_PREVIEW=OPEN Select project_a for one synthetic mission; project_b must remain empty.", flush=True)
                subprocess.run([str(desktop / "src-tauri/target/debug/morgoth-desktop")], env=gui_env,
                               cwd=ui, check=True)
                if branch == "feat/morgoth-desktop-d4-mission-workspace-v1":
                    print("D4_WINDOW_RESTART=OPEN Same disposable app-data HOME; verify saved local brief persists.", flush=True)
                    subprocess.run([str(desktop / "src-tauri/target/debug/morgoth-desktop")], env=gui_env,
                                   cwd=ui, check=True)
        finally:
            if vite is not None:
                vite.terminate()
                try:
                    vite.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    vite.kill()
                    vite.wait(timeout=5)
            if started:
                _run([str(pg_bin / "pg_ctl"), "-D", str(cluster), "stop", "-m", "immediate"], env=safe_env)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
