# D15 — VS Code workspace connector

## Scope and security

D15 adds a real Visual Studio Code extension using the official `vscode` API. It declares `extensionKind: ["workspace"]` and runs only in a Linux or Remote-WSL extension host. The qualified host is a disposable Linux VS Code 1.140.0 Extension Development Host; the installed Windows CLI is also 1.140.0, but Remote-WSL was absent from its inspected extension profile. Windows-host operation is not inferred from the Linux test.

The extension is idle until the user runs **Morgoth: Connect Workspace**. It opens one Unix socket in an owner-only directory (socket mode 0600), displays a random 128-bit pairing code and accepts one same-user peer. Morgoth requires a separate GTK pairing confirmation. Rust checks socket type, owner, mode and `SO_PEERCRED`; the response must identify the fixed extension, protocol, trusted single workspace, Linux/WSL host and the two JavaScript artifact digests sealed in the release receipt. Sessions last at most ten minutes. **Morgoth: Disconnect** and the Desktop disconnect button revoke access. A crash never authorizes automatic reconnection.

| Fixed operation | Authorization | Data or effect |
| --- | --- | --- |
| Pair | VS Code command, short code and Desktop GTK approval | Bounded workspace label, canonical-root hash, host and session |
| Inspect editor | Separate GTK approval | Active eligible file's relative ID, language, version, dirty flag and selected length |
| Read selection | Separate GTK approval | Only the selected text, at most 1 KiB, in the approved workspace |
| Open scratch | Separate GTK approval | One unsaved plain-text tab with fixed synthetic text, read back through VS Code |
| Disconnect | Either application | Session and socket revoked |

The extension refuses untrusted or multi-root workspaces, unsupported hosts or URI schemes, changed workspace identity, files escaping the root after `realpath`, and file types outside `.md`, `.txt`, `.ts` and `.js`. It never enumerates workspace files, forwards `executeCommand`, reads terminals or edits existing files. The user selects text in VS Code before requesting it in Morgoth. The scratch tab is never saved. There is no D15 file-edit operation.

This is a same-user capability boundary, not a sandbox against another malicious process or extension with the same privileges. The fixed connector catalog supplies identity, family, scope, risk, permission, expiry and last-verification data; external metadata cannot add operations. MCP D12, Windows D13 and browser D14 retain independent sessions and grants. No note, web page, tool response, model or backend thesis invokes VS Code. Human Gate 3 and `SAFE_FOR_WORKLOADS=False` remain unchanged.

## Reproducible build and tests

`vscode.d.ts` is copied from the installed official VS Code 1.140.0 package (MIT header; original SHA-256 `b702638b10d57bb5c61dbe79cb3c071a0bee6a8b8b074de0f8a03f333b4b9270`; committed LF-normalized SHA-256 `a4321528e86dcdcb8450287f2a263055c46a622119cdb186de85ac3b19ce9608`), with the corresponding Microsoft MIT license. The pinned Desktop lockfile provides TypeScript 5.9.3 and Node types. No Marketplace extension is installed automatically.

```bash
cd /home/corio/Morgoth/dev-desktop-d15-ui/desktop
npm ci --offline
npm run typecheck
npm run contract:check
npm test -- --reporter=dot --pool=threads --maxWorkers=1 --no-file-parallelism
npm run build
cd connectors/vscode-extension
npm run build && npm test
```

The real API test uses the official VS Code 1.140.0 Linux archive under ignored `.vscode-test/`, downloaded from `update.code.visualstudio.com` and checked against its `x-sha256` header (`d32031e9e213d59532af3cf32fcb8b357a1cdd10417967b4f5b5ba30436dc0dc`). The Extension Development Host has isolated user-data and extension directories, a synthetic `sample.md`, and Xvfb. It opens that file through official APIs, reads the active editor and selected text, creates a visible unsaved scratch tab, reads it back and disconnects. A second run drives the same real host through the Rust gateway. These are not mocks and do not prove Windows Remote-WSL placement or a personal workspace connection.

## Release and operator use

After committing a clean D15 branch:

```bash
cd /home/corio/Morgoth/dev-desktop-d15-ui
python3 desktop/scripts/build_d13_windows.py  # optional: retain D13 in this checkout
python3 desktop/scripts/build_d11.py
python3 desktop/scripts/launch_d11.py --home /home/corio/Morgoth/personal-management --check
python3 desktop/scripts/launch_d11.py --home /home/corio/Morgoth/personal-management
```

`--preview` uses disposable Desktop data. `--vscode-socket-dir` can point the preview at a pre-existing owner-only test directory. Normal use derives the socket directory from the same Linux HOME in the Desktop and workspace extension host. Morgoth opens without Node, Vite or VS Code.

To use the extension without installing into a personal profile, build it, then launch a trusted Linux/Remote-WSL workspace in an isolated Extension Development Host with `--extensionDevelopmentPath=/home/corio/Morgoth/dev-desktop-d15-ui/desktop/connectors/vscode-extension`. Run **Morgoth: Connect Workspace** from VS Code's command palette, copy the code into **Réglages → Connexions et applications → Visual Studio Code** in Morgoth, and approve each later action separately. The installed Windows VS Code profile currently lacks Remote-WSL; installing it, if desired, is a separate operator action.

The WSL Unix socket does not connect to a Windows-local extension host. D15 does not claim access to every VS Code window or any unpaired personal workspace.
