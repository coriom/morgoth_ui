"""Bounded real Ollama / Rust / backend / disposable PostgreSQL qualification."""
from __future__ import annotations

import argparse
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile

import httpx


def run(argv: list[str], *, timeout: int = 90) -> None:
    """Execute one bounded local infrastructure command."""
    subprocess.run(argv, check=True, timeout=timeout, stdout=subprocess.DEVNULL,
                   stderr=subprocess.DEVNULL)


def main() -> None:
    """Run only with an already-installed local Ollama model and a clean pinned backend."""
    parser = argparse.ArgumentParser()
    parser.add_argument("--backend", type=Path, required=True)
    parser.add_argument("--python", type=Path, required=True)
    parser.add_argument("--binary", type=Path, required=True)
    parser.add_argument("--model", default="llama3.1:8b")
    args = parser.parse_args()
    backend = args.backend.resolve(strict=True)
    # Preserve the venv executable path; resolving its symlink loses venv detection.
    python = args.python.absolute()
    assert python.is_file()
    binary = args.binary.resolve(strict=True)
    pinned = "9b982540e4bb53a2b5045d22dc67eee525a557eb"
    assert subprocess.check_output(["git", "-C", str(backend), "rev-parse", "HEAD"], text=True).strip() == pinned
    assert not subprocess.check_output(["git", "-C", str(backend), "status", "--porcelain", "--untracked-files=all"])
    assert args.model in {m["name"] for m in httpx.get(
        "http://127.0.0.1:11434/api/tags", timeout=3, trust_env=False
    ).json()["models"]}, "BLOCKED_OLLAMA_MODEL_NOT_INSTALLED"
    assert shutil.which("claude"), "BLOCKED_CLAUDE_BINARY_UNAVAILABLE"
    pg_bin = Path("/usr/lib/postgresql/16/bin")
    with tempfile.TemporaryDirectory(prefix="morgoth-real-start-") as directory:
        root = Path(directory)
        data, sockets = root / "pgdata", root / "sockets"
        sockets.mkdir(mode=0o700)
        with socket.socket() as probe:
            probe.bind(("127.0.0.1", 0))
            port = probe.getsockname()[1]
        run([str(pg_bin / "initdb"), "-D", str(data), "-A", "trust", "--no-instructions"])
        started = False
        try:
            run([str(pg_bin / "pg_ctl"), "-D", str(data), "-l", str(root / "postgres.log"),
                 "-o", f"-h '' -k {sockets} -p {port}", "start"])
            started = True
            run([str(pg_bin / "createdb"), "-h", str(sockets), "-p", str(port), "morgoth_test"])
            dsn = f"postgresql:///morgoth_test?host={sockets}&port={port}"
            env = {
                "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
                "HOME": os.environ["HOME"],
                "LANG": "C.UTF-8",
                "MORGOTH_DESKTOP_BACKEND_ROOT": str(backend),
                "MORGOTH_DESKTOP_PYTHON": str(python),
                "MORGOTH_TEST_POSTGRES_URL": dsn,
                "MORGOTH_DESKTOP_RESEARCH_POSTGRES_URL": dsn,
                "MORGOTH_DESKTOP_RESEARCH_OLLAMA_BASE_URL": "http://127.0.0.1:11434",
                "MORGOTH_DESKTOP_RESEARCH_OLLAMA_PRIMARY_MODEL": args.model,
                "MORGOTH_DESKTOP_RESEARCH_OLLAMA_AGENT_MODEL": args.model,
                "MORGOTH_DESKTOP_RESEARCH_MAX_CONCURRENT_AGENTS": "1",
                "MORGOTH_DESKTOP_RESEARCH_LOG_RETENTION_DAYS": "1",
                "MORGOTH_DESKTOP_RESEARCH_LOG_LEVEL_THOUGHT": "false",
                "MORGOTH_DESKTOP_RESEARCH_CONNECTIVITY_CHECK_ENABLED": "false",
                "MORGOTH_DESKTOP_RESEARCH_METRIC_RECORDER_ENABLED": "false",
                "MORGOTH_DESKTOP_RESEARCH_SOURCE_CACHE_ENABLED": "false",
                "MORGOTH_DESKTOP_RESEARCH_PROVIDER_HEARTBEAT_MINUTES": "999999",
                "MORGOTH_DESKTOP_RESEARCH_AUTONOMOUS_CYCLE_MINUTES": "60",
                "ANTHROPIC_API_KEY": "FAKE_PARENT_ONLY_DO_NOT_INHERIT",
            }
            subprocess.run([str(binary)], env=env, check=True, timeout=420)
            print("disposable Unix-socket morgoth_test only; no production database PASS")
        finally:
            if started:
                run([str(pg_bin / "pg_ctl"), "-D", str(data), "-m", "immediate", "stop"],
                    timeout=15)


if __name__ == "__main__":
    main()
