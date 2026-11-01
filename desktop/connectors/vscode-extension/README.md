# Morgoth Workspace Connector

Private, explicitly paired workspace connector for Morgoth Desktop. It runs in a
Linux or Remote-WSL VS Code extension host (`extensionKind: workspace`). It does
not connect from a Windows-local extension host to the WSL Unix socket.

Open one trusted workspace, run **Morgoth: Connect Workspace** from the VS Code
Command Palette, then enter the short code in Morgoth Desktop. Each metadata,
selection, and fixed unsaved scratch action requires separate Desktop approval.
Version 0.2.0 also accepts one explicitly approved, bounded Markdown brief from
Morgoth Missions as a new unsaved editor tab. This does not save or edit a file.
Version 0.2.1 keeps this protocol and rejects relative document identifiers
that would be truncated in the selected-text preview. D21 can use one separately
approved selection snapshot as local model context; the extension does not
start inference or give the model file access.
Use **Morgoth: Disconnect** to revoke the session. No existing file is edited.

The VSIX is local-use only. It is not published to the Marketplace. See the
Desktop D17 documentation for build, checksum, isolated installation and
Remote-WSL limitations.
