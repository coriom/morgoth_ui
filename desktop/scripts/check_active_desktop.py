#!/usr/bin/env python3
"""Run the full Desktop Python suite against the exact pinned D9 backend."""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path
import unittest

BACKEND_SHA = "a91377c9ace8d70bf64aa44b3bd54773af612e3a"


def main() -> int:
    """Reject an incompatible import root instead of misclassifying a test failure."""
    scripts = Path(__file__).resolve().parent
    backend = scripts.parents[2] / "dev-desktop-d9-backend"
    try:
        head = subprocess.run(["git", "-C", str(backend), "rev-parse", "HEAD"],
                              capture_output=True, text=True, timeout=10, check=False)
    except (OSError, subprocess.TimeoutExpired):
        print("PINNED_BACKEND_UNAVAILABLE", file=sys.stderr)
        return 2
    if head.returncode or head.stdout.strip() != BACKEND_SHA:
        print("PINNED_BACKEND_MISMATCH", file=sys.stderr)
        return 2
    try:
        status = subprocess.run(["git", "-C", str(backend), "status", "--porcelain", "--untracked-files=all"],
                                capture_output=True, text=True, timeout=10, check=False)
    except (OSError, subprocess.TimeoutExpired):
        print("PINNED_BACKEND_UNAVAILABLE", file=sys.stderr)
        return 2
    if status.returncode or status.stdout.strip():
        print("PINNED_BACKEND_DIRTY", file=sys.stderr)
        return 2
    sys.path.insert(0, str(backend))
    sys.path.insert(1, str(scripts))
    suite = unittest.defaultTestLoader.discover(str(scripts), pattern="test_*.py")
    result = unittest.TextTestRunner(verbosity=1).run(suite)
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    raise SystemExit(main())
