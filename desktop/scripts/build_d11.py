#!/usr/bin/env python3
"""Build the local Linux Tauri release and seal its source and binary identity."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
DESKTOP = ROOT / "desktop"
BRANCH = "feat/morgoth-desktop-d16-github-connector-v1"


def git(*args: str) -> str:
    """Read bounded Git metadata without emitting subprocess diagnostics."""
    result = subprocess.run(["git", "-C", str(ROOT), *args], capture_output=True,
                            text=True, timeout=20, check=False)
    if result.returncode or len(result.stdout) > 4096:
        raise RuntimeError("SOURCE_CHECK_FAILED")
    return result.stdout.strip()


def digest(path: Path) -> str:
    """Return the SHA-256 of one local build artifact."""
    value = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            value.update(chunk)
    return value.hexdigest()


def main() -> None:
    """Build once, then publish a private local receipt after success."""
    if git("branch", "--show-current") != BRANCH or git("status", "--porcelain", "--untracked-files=all"):
        raise RuntimeError("SOURCE_NOT_CLEAN")
    if not (DESKTOP / "node_modules/.bin/tauri").is_file():
        raise RuntimeError("BUILD_DEPENDENCIES_UNAVAILABLE")
    extension = DESKTOP / "connectors/vscode-extension"
    if subprocess.run(["npm", "run", "package:vsix"], cwd=extension, check=False).returncode or not (extension / "out/extension.js").is_file() or not (extension / "out/protocol.js").is_file():
        raise RuntimeError("VSCODE_EXTENSION_BUILD_FAILED")
    vsix = extension / "dist/morgoth-vscode-connector-0.1.0.vsix"
    if not vsix.is_file():
        raise RuntimeError("VSCODE_VSIX_MISSING")
    env = os.environ.copy()
    env["CARGO_NET_OFFLINE"] = "true"
    env["MORGOTH_D13_SOURCE_SHA"] = git("rev-parse", "HEAD")
    command = [str(DESKTOP / "node_modules/.bin/tauri"), "build", "--no-bundle", "--features", "desktop,desktop-release", "--ci"]
    if subprocess.run(command, cwd=DESKTOP, env=env, check=False).returncode:
        raise RuntimeError("TAURI_RELEASE_BUILD_FAILED")
    binary = DESKTOP / "src-tauri/target/release/morgoth-desktop"
    index = DESKTOP / "dist/index.html"
    fonts = list((DESKTOP / "dist").rglob("*.woff2"))
    if not binary.is_file() or not index.is_file() or not fonts:
        raise RuntimeError("RELEASE_ASSETS_MISSING")
    receipt = {"format": 3, "source_sha": git("rev-parse", "HEAD"),
               "binary_sha256": digest(binary), "asset_index_sha256": digest(index),
               "extension_sha256": digest(extension / "out/extension.js"),
               "extension_protocol_sha256": digest(extension / "out/protocol.js"),
               "vsix_sha256": digest(vsix)}
    path = binary.parent / "morgoth-d16-release.json"
    temporary = path.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(receipt, sort_keys=True) + "\n", encoding="utf-8")
    os.replace(temporary, path)
    print("D16_RELEASE_READY SOURCE_SHA=" + receipt["source_sha"])


if __name__ == "__main__":
    try:
        main()
    except (OSError, RuntimeError, subprocess.SubprocessError) as exc:
        print("D12_BUILD_BLOCKED=" + (str(exc) if isinstance(exc, RuntimeError) else "BUILD_IO_FAILURE"), file=sys.stderr)
        raise SystemExit(2) from None
