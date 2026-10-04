"""Bounded synthetic Management API + actual native Rust client smoke."""
from __future__ import annotations

import argparse
import base64
import os
from pathlib import Path
import secrets
import socket
import subprocess
import tempfile
import time


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--backend", type=Path, required=True)
    parser.add_argument("--python", type=Path, required=True)
    args = parser.parse_args()
    backend = args.backend.resolve(strict=True)
    # A venv interpreter is often a symlink; resolving it discards site-packages.
    python = args.python.absolute()
    if not python.is_file() or not (backend / "api" / "management_app.py").is_file():
        parser.error("development backend or interpreter does not exist")
    with tempfile.TemporaryDirectory(prefix="morgoth-desktop-smoke-") as tmp:
        root = Path(tmp)
        home = root / "app-home"
        token_path = root / "management.token"
        token = base64.urlsafe_b64encode(secrets.token_bytes(48)).rstrip(b"=")
        fd = os.open(token_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "wb") as output:
            output.write(token)
        wrong_token_path = root / "wrong.token"
        wrong_fd = os.open(wrong_token_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(wrong_fd, "wb") as output:
            output.write(base64.urlsafe_b64encode(secrets.token_bytes(48)).rstrip(b"="))
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        backend_env = {"PATH": "/usr/bin:/bin", "HOME": str(root), "LANG": "C.UTF-8",
                       "PYTHONPATH": str(backend), "PYTHONDONTWRITEBYTECODE": "1"}
        server = subprocess.Popen(
            [str(python), "-m", "scripts.management_api", "--home", str(home),
             "--token-file", str(token_path), "--port", str(port)],
            cwd=backend, env=backend_env, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
        )
        try:
            deadline = time.monotonic() + 12
            while time.monotonic() < deadline:
                if server.poll() is not None:
                    detail = server.stderr.read(4096).decode("utf-8", "replace") if server.stderr else ""
                    detail = detail.replace(token.decode("ascii"), "[redacted]").replace(str(root), "[temp]")
                    raise RuntimeError(f"synthetic Management API exited before readiness: {detail[-1200:]}")
                try:
                    with socket.create_connection(("127.0.0.1", port), timeout=0.2):
                        break
                except OSError:
                    time.sleep(0.1)
            else:
                raise RuntimeError("synthetic Management API readiness timeout")
            rust_env = dict(os.environ)
            rust_env.update({"MORGOTH_DESKTOP_MANAGEMENT_PORT": str(port),
                             "MORGOTH_DESKTOP_MANAGEMENT_TOKEN_FILE": str(token_path),
                             "MORGOTH_DESKTOP_WRONG_TOKEN_FILE": str(wrong_token_path),
                             "CARGO_BUILD_JOBS": "2"})
            subprocess.run(["cargo", "run", "--locked", "--quiet", "--bin", "management-smoke"],
                           cwd=Path(__file__).resolve().parents[1] / "src-tauri", env=rust_env,
                           check=True, timeout=120)
            check = subprocess.run(
                [str(python), "-c", "from core.project import load_projects; import sys; from pathlib import Path; p=load_projects(Path(sys.argv[1])); assert {x.id for x in p} == {'default','research_a','research_b'}; print('canonical Python loader: 3 projects PASS')", str(home / "projects")],
                cwd=backend, env=backend_env, check=True, capture_output=True, text=True, timeout=15)
            print(check.stdout.strip())
        finally:
            server.terminate()
            try:
                server.wait(timeout=5)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait(timeout=5)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
