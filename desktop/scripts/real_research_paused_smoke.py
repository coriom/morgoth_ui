"""Bounded Rust-owned real research smoke using only disposable local services."""
from __future__ import annotations

import argparse
import base64
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import secrets
import shutil
import socket
import subprocess
import tempfile
import threading

import httpx


class FakeOllama(BaseHTTPRequestHandler):
    requests: list[str] = []
    include_agent = True

    def do_GET(self) -> None:
        self.requests.append(f"GET {self.path}")
        if self.path != "/api/tags":
            self.send_error(404)
            return
        names = ["test-primary", "test-agent"] if self.include_agent else ["test-primary"]
        payload = json.dumps({"models": [{"name": name} for name in names]}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_POST(self) -> None:
        self.requests.append(f"POST {self.path}")
        self.send_error(405)

    def log_message(self, *_args: object) -> None:
        """Never echo request paths, headers, or payloads in diagnostics."""


def run(command: list[str], *, timeout: int = 90, **kwargs: object) -> None:
    """Execute one bounded local test command, without printing its environment."""
    subprocess.run(command, check=True, timeout=timeout, **kwargs)


def native_window(
    root: Path, backend: Path, python: Path, binary: Path, env: dict[str, str],
    *, seconds: int, domain: str = "crypto",
) -> None:
    """Pre-populate through the real API, then launch the actual Tauri window."""
    home = root / "window-home"
    home.mkdir(mode=0o700)
    token_path = root / "bootstrap-token"
    token = base64.urlsafe_b64encode(secrets.token_bytes(48)).rstrip(b"=")
    fd = os.open(token_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "wb") as stream:
        stream.write(token)
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    bootstrap_env = {"PATH": "/usr/bin:/bin", "HOME": str(root), "LANG": "C.UTF-8",
                     "PYTHONDONTWRITEBYTECODE": "1"}
    bootstrap = subprocess.Popen(
        [str(python), "-B", "-m", "scripts.management_api", "--home", str(home),
         "--token-file", str(token_path), "--port", str(port)],
        cwd=backend, env=bootstrap_env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    try:
        import time
        url = f"http://127.0.0.1:{port}/management/v1"
        headers = {"X-Morgoth-Management-Token": token.decode("ascii")}
        # The exact header name comes from the pinned Management contract.
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            assert bootstrap.poll() is None, "bootstrap Management exited"
            try:
                response = httpx.get(f"{url}/status", headers=headers, timeout=1, trust_env=False)
                if response.status_code == 200:
                    break
            except httpx.HTTPError:
                pass
            time.sleep(0.1)
        else:
            raise AssertionError("bootstrap Management readiness timeout")
        created = httpx.post(f"{url}/projects", headers=headers,
                             json={"id": "desktop_probe", "name": "Desktop probe", "domain": domain},
                             timeout=5, trust_env=False)
        assert created.status_code == 201 and created.json()["created"]
        assert (home / "projects" / "desktop_probe" / "project.yaml").is_file()
    finally:
        bootstrap.terminate()
        try:
            bootstrap.wait(timeout=5)
        except subprocess.TimeoutExpired:
            bootstrap.kill()
            bootstrap.wait(timeout=5)
        token_path.unlink()
    gui_env = dict(env)
    gui_env["MORGOTH_DESKTOP_HOME"] = str(home)
    for name in ("DISPLAY", "WAYLAND_DISPLAY", "XDG_RUNTIME_DIR", "DBUS_SESSION_BUS_ADDRESS",
                 "PULSE_SERVER", "GDK_BACKEND"):
        if name in os.environ:
            gui_env[name] = os.environ[name]
    assert gui_env.get("DISPLAY") or gui_env.get("WAYLAND_DISPLAY"), "no graphical session"
    desktop = Path(__file__).resolve().parents[1]
    node = shutil.which("node")
    assert node, "Node executable unavailable"
    vite = subprocess.Popen(
        [node, str(desktop / "node_modules/vite/bin/vite.js"), "--host", "127.0.0.1",
         "--port", "5173", "--strictPort"], cwd=desktop,
        env={"PATH": f"{Path(node).parent}:/usr/bin:/bin", "HOME": str(root), "LANG": "C.UTF-8"},
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    window = None
    try:
        import time
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            assert vite.poll() is None, "local Vite exited"
            try:
                if httpx.get("http://127.0.0.1:5173", timeout=1, trust_env=False).status_code == 200:
                    break
            except httpx.HTTPError:
                pass
            time.sleep(0.1)
        else:
            raise AssertionError("local Vite readiness timeout")
        gui_env["GDK_BACKEND"] = "x11"
        window = subprocess.Popen([str(binary)], env=gui_env, cwd=binary.parent,
                                  stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print("native WSLg window launched; inspecting for bounded interval", flush=True)
        deadline = time.monotonic() + seconds
        management_seen = False
        while time.monotonic() < deadline:
            assert window.poll() is None, "native window exited early"
            for children in Path(f"/proc/{window.pid}/task").glob("*/children"):
                if children.is_file():
                    for child_id in children.read_text().split():
                        cmdline = Path(f"/proc/{child_id}/cmdline")
                        if cmdline.is_file() and b"scripts.management_api" in cmdline.read_bytes():
                            management_seen = True
            time.sleep(0.2)
        assert management_seen, "native Management child never observed"
        print("native window alive; Rust-owned Management child observed; disposable Project manifest present PASS")
    finally:
        if window is not None:
            window.terminate()
            try:
                window.wait(timeout=8)
            except subprocess.TimeoutExpired:
                window.kill()
                window.wait(timeout=5)
        vite.terminate()
        try:
            vite.wait(timeout=5)
        except subprocess.TimeoutExpired:
            vite.kill()
            vite.wait(timeout=5)


def main() -> int:
    """Build fixture infrastructure, run two Rust-owned smoke modes, clean it."""
    parser = argparse.ArgumentParser()
    parser.add_argument("--backend", type=Path, required=True)
    parser.add_argument("--python", type=Path, required=True)
    parser.add_argument("--binary", type=Path, required=True)
    parser.add_argument("--native-binary", type=Path)
    parser.add_argument("--window-seconds", type=int, default=20)
    parser.add_argument("--native-only", action="store_true")
    parser.add_argument("--codex-readiness", action="store_true",
                        help="Non-inference installed CLI and confined ChatGPT-login facts")
    parser.add_argument("--window-domain", choices=("crypto", "weather"), default="crypto")
    args = parser.parse_args()
    if args.native_only and not args.native_binary:
        parser.error("--native-only requires --native-binary")
    backend = args.backend.resolve(strict=True)
    python = args.python.absolute()
    binary = args.binary.resolve(strict=True)
    assert python.is_file() and binary.is_file()
    assert subprocess.check_output(["git", "-C", str(backend), "rev-parse", "HEAD"], text=True).strip() == "7bff6c92ffe958cb11411a1f23fa6f917cf0fe32"
    assert not subprocess.check_output(["git", "-C", str(backend), "status", "--porcelain", "--untracked-files=all"])
    pg_bin = Path("/usr/lib/postgresql/16/bin")
    with tempfile.TemporaryDirectory(prefix="morgoth-real-paused-") as directory:
        root = Path(directory)
        data, sockets = root / "pgdata", root / "sockets"
        sockets.mkdir(mode=0o700)
        with socket.socket() as probe:
            probe.bind(("127.0.0.1", 0))
            pg_port = probe.getsockname()[1]
        run([str(pg_bin / "initdb"), "-D", str(data), "-A", "trust", "--no-instructions"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        pg_started = False
        server = None
        thread = None
        try:
            run([str(pg_bin / "pg_ctl"), "-D", str(data), "-l", str(root / "postgres.log"),
                 "-o", f"-h '' -k {sockets} -p {pg_port}", "start"],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            pg_started = True
            run([str(pg_bin / "createdb"), "-h", str(sockets), "-p", str(pg_port), "morgoth_test"],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            dsn = f"postgresql:///morgoth_test?host={sockets}&port={pg_port}"
            server = ThreadingHTTPServer(("127.0.0.1", 0), FakeOllama)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            env = {
                "PATH": "/usr/bin:/bin", "HOME": str(root), "LANG": "C.UTF-8",
                "MORGOTH_DESKTOP_BACKEND_ROOT": str(backend),
                "MORGOTH_DESKTOP_PYTHON": str(python),
                "MORGOTH_TEST_POSTGRES_URL": dsn,
                "MORGOTH_DESKTOP_RESEARCH_POSTGRES_URL": dsn,
                "MORGOTH_DESKTOP_RESEARCH_OLLAMA_BASE_URL": f"http://127.0.0.1:{server.server_port}",
                "MORGOTH_DESKTOP_RESEARCH_OLLAMA_PRIMARY_MODEL": "test-primary",
                "MORGOTH_DESKTOP_RESEARCH_OLLAMA_AGENT_MODEL": "test-agent",
                "MORGOTH_DESKTOP_RESEARCH_MAX_CONCURRENT_AGENTS": "1",
                "MORGOTH_DESKTOP_RESEARCH_LOG_RETENTION_DAYS": "1",
                "MORGOTH_DESKTOP_RESEARCH_LOG_LEVEL_THOUGHT": "false",
            }
            if args.codex_readiness:
                codex = shutil.which("codex")
                node = shutil.which("node")
                assert codex and node, "BLOCKED_CODEX_NATIVE_RUNTIME"
                runtime_dirs = dict.fromkeys((str(Path(codex).parent), str(Path(node).parent),
                                              "/usr/bin", "/bin"))
                env["PATH"] = ":".join(runtime_dirs)
                env["HOME"] = os.environ["HOME"]
            if not args.native_only:
                run([str(binary), *(["--codex-readiness"] if args.codex_readiness else [])],
                    env=env, timeout=180)
                assert FakeOllama.requests and set(FakeOllama.requests) == {"GET /api/tags"}, FakeOllama.requests
                normal_count = len(FakeOllama.requests)
                FakeOllama.include_agent = False
                run([str(binary), "--not-ready"], env=env, timeout=120)
                assert len(FakeOllama.requests) > normal_count
                assert set(FakeOllama.requests) == {"GET /api/tags"}, FakeOllama.requests
                print(f"fake Ollama: {len(FakeOllama.requests)} GET /api/tags only; no chat/pull/other request PASS")
                print("PostgreSQL: disposable Unix-socket morgoth_test; generated schemas dropped PASS")
            if args.native_binary:
                assert 5 <= args.window_seconds <= 120
                native_window(root, backend, python, args.native_binary.resolve(strict=True),
                              env, seconds=args.window_seconds, domain=args.window_domain)
        finally:
            if server is not None:
                server.shutdown()
                server.server_close()
            if thread is not None:
                thread.join(timeout=5)
            if pg_started:
                run([str(pg_bin / "pg_ctl"), "-D", str(data), "-m", "immediate", "stop"],
                    timeout=15, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
