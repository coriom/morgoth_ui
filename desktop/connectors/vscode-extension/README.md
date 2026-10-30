# Morgoth Workspace Connector

Private, explicitly paired workspace connector for Morgoth Desktop. It runs in a
Linux or Remote-WSL VS Code extension host (`extensionKind: workspace`). It does
not connect from a Windows-local extension host to the WSL Unix socket.

Open one trusted workspace, run **Morgoth: Connect Workspace** from the VS Code
Command Palette, then enter the short code in Morgoth Desktop. Each metadata,
selection, and fixed unsaved scratch action requires separate Desktop approval.
Use **Morgoth: Disconnect** to revoke the session. No existing file is edited.

The VSIX is local-use only. It is not published to the Marketplace. See the
Desktop D16 documentation for build, checksum, isolated installation and
Remote-WSL limitations.
