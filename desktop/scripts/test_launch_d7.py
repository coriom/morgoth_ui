"""Hermetic guards for the one-command D7 launcher."""
from __future__ import annotations

import importlib.util
from pathlib import Path
import tempfile
import unittest

MODULE = Path(__file__).with_name("launch_d7.py")
SPEC = importlib.util.spec_from_file_location("d7_launcher", MODULE)
assert SPEC is not None and SPEC.loader is not None
launcher = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(launcher)


class LaunchGuards(unittest.TestCase):
    def test_explicit_private_home_is_stable(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory) / "managed"
            launcher.ensure_home(home)
            launcher.ensure_home(home)
            self.assertTrue(home.is_dir())
            self.assertEqual(home.stat().st_mode & 0o777, 0o700)

    def test_symlink_and_unsafe_existing_home_refuse(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            real = root / "real"
            real.mkdir(mode=0o700)
            link = root / "link"
            link.symlink_to(real)
            with self.assertRaisesRegex(RuntimeError, "HOME_SYMLINK_REFUSED"):
                launcher.ensure_home(link)
            real.chmod(0o755)
            with self.assertRaisesRegex(RuntimeError, "HOME_UNSAFE"):
                launcher.ensure_home(real)

    def test_missing_parent_and_relative_home_refuse(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(RuntimeError, "HOME_PARENT_UNAVAILABLE"):
                launcher.ensure_home(Path(directory) / "missing" / "home")
            with self.assertRaisesRegex(RuntimeError, "HOME_PATH_INVALID"):
                launcher.ensure_home(Path("relative"))


if __name__ == "__main__":
    unittest.main()
