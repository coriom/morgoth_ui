"""Bounded local launcher failure classes; no Desktop process starts."""
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import launch_d11


class LauncherDiagnostics(unittest.TestCase):
    def test_missing_private_management_home_is_explicit(self):
        with tempfile.TemporaryDirectory() as root:
            with self.assertRaisesRegex(RuntimeError, "^MANAGEMENT_HOME_MISSING$"):
                launch_d11.safe_directory(Path(root) / "absent", private=True)

    def test_symlink_and_world_readable_home_refuse(self):
        with tempfile.TemporaryDirectory() as root:
            home = Path(root) / "home"
            home.mkdir(mode=0o700)
            alias = Path(root) / "alias"
            alias.symlink_to(home)
            with self.assertRaisesRegex(RuntimeError, "^PATH_SYMLINK_REFUSED$"):
                launch_d11.safe_directory(alias, private=True)
            home.chmod(0o755)
            with self.assertRaisesRegex(RuntimeError, "^PATH_UNSAFE$"):
                launch_d11.safe_directory(home, private=True)

    def test_absent_release_is_not_generic_error(self):
        with tempfile.TemporaryDirectory() as root, patch.object(launch_d11, "DESKTOP", Path(root)), patch.object(launch_d11, "git", side_effect=[launch_d11.BRANCH, ""]), patch("sys.argv", ["launch_d11.py", "--preview", "--check"]):
            with self.assertRaisesRegex(RuntimeError, "^RELEASE_BINARY_MISSING$"):
                launch_d11.main()


if __name__ == "__main__":
    unittest.main()
