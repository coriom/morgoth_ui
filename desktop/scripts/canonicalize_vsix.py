#!/usr/bin/env python3
"""Normalize the official vsce archive after checking its exact shipped files."""
from __future__ import annotations

from pathlib import Path
import os
import sys
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

EXPECTED = {
    "[Content_Types].xml", "extension.vsixmanifest", "extension/readme.md",
    "extension/package.json", "extension/out/extension.js", "extension/out/protocol.js",
}


def main() -> None:
    archive = Path(sys.argv[1]).resolve(strict=True)
    extension = archive.parent.parent
    with ZipFile(archive) as source:
        names = source.namelist()
        if len(names) != len(EXPECTED) or set(names) != EXPECTED:
            raise SystemExit("VSIX_FILES_REFUSED")
        data = {}
        for info in source.infolist():
            if info.is_dir() or info.file_size > 65_536 or info.filename.startswith("/") or ".." in Path(info.filename).parts:
                raise SystemExit("VSIX_ENTRY_REFUSED")
            data[info.filename] = source.read(info)
    if sum(map(len, data.values())) > 120_000:
        raise SystemExit("VSIX_SIZE_REFUSED")
    for name in ("extension.js", "protocol.js"):
        if data[f"extension/out/{name}"] != (extension / "out" / name).read_bytes():
            raise SystemExit("VSIX_SOURCE_MISMATCH")
    temporary = archive.with_suffix(".vsix.tmp")
    try:
        with ZipFile(temporary, "w") as target:
            for name in sorted(EXPECTED):
                info = ZipInfo(name, (1980, 1, 1, 0, 0, 0))
                info.create_system = 3
                info.external_attr = 0o100644 << 16
                target.writestr(info, data[name], compress_type=ZIP_DEFLATED, compresslevel=9)
        os.replace(temporary, archive)
    finally:
        temporary.unlink(missing_ok=True)
    print("D16_VSIX_CANONICAL_OK")


if __name__ == "__main__":
    main()
