# Desktop D4 acceptance record

This report concerns the isolated D4 worktree derived from D3
`19f79cf4148e3ff5cc6316846ab7d9681de617bf`. The exact final commit is
recorded by the final Git handoff, after documentation is committed.

## Implemented checks

| Check | Command | Result |
|---|---|---|
| TypeScript | `cd desktop && npm run typecheck` | PASS |
| React and IPC contract tests | `cd desktop && npm test -- --reporter=dot` | 34 PASS, 0 FAIL |
| Pinned API contract | `cd desktop && npm run contract:check` | PASS, pinned checksum and types match |
| Vite assets | `cd desktop && npm run build` | PASS, 67 modules; React Query dependency emits existing `use client` bundler warnings |
| Rust format | `cd desktop/src-tauri && cargo fmt --check` | PASS |
| Rust tests | `cd desktop/src-tauri && cargo test --offline --features desktop --lib` | 26 PASS, 0 FAIL |
| Strict Clippy | `cd desktop/src-tauri && cargo clippy --offline --all-targets --features desktop -- -D warnings` | PASS |
| Native Linux binaries | `cd desktop/src-tauri && cargo build --offline --features desktop --bin morgoth-desktop --bin d2-read-smoke` | PASS |

Frontend tests use in-memory native transport fakes. They establish the UI
workflow, validation and scoping; they do not by themselves prove native file
persistence or native visual behavior. Rust tests use isolated temporary
directories and exercise actual JSON files, permissions, symlink refusal,
corruption refusal, revision conflicts and Project isolation.

The D2 historical backend pin and data contract are unchanged; D4 does not
modify PostgreSQL or the backend repository. Native smoke uses the existing
owned disposable `morgoth_test` fixture rather than production storage.

## Native acceptance

The native fixture first failed to start its disposable PostgreSQL socket in
the filesystem sandbox. Its authorized rerun passed the native and fresh
process SQL proofs but could not start Vite because the new worktree lacked
`node_modules`. A local copy of the existing D3 dependencies (ignored by Git)
resolved this prerequisite without downloading packages. The next run exited
0 after two real Tauri windows under WSLg. AT-SPI confirmed all six view
buttons could be activated, `project_a` exposed the synthetic historical
checkpoint, `project_b` did not inherit A's mission or detail, and the
preferred `project_b` was restored in the second window. Both windows closed
normally. WSLg emitted Mesa/EGL warnings but did not block the window.

The Wayland window exposed the draft editor and its labels, but AT-SPI's
editable-text interface was absent and synthesized keyboard events did not
write into WebKit fields. The attempted save left the browser's required-field
validation visible. **Native draft create/edit/reopen is therefore not yet
visually accepted**; Rust file round trips and React interactions are separate
passing evidence. An optional D4-only `--x11` preview allows a controlled
XWayland keyboard test if WSLg supports it.

The preview command below checks a
clean D4 branch, pins the disposable D2 backend, creates its own temporary
Project and PostgreSQL resources, and uses a temporary HOME for local drafts:

```bash
cd /home/corio/Morgoth/dev-desktop-d4-mission-workspace-v1
/home/corio/Morgoth/morgoth/.venv/bin/python desktop/scripts/d2_read_fixture.py --window --x11
```

In the first window select `project_a`, create and save a draft, inspect the
synthetic historical checkpoint, switch to `project_b` and verify isolation.
Close the window; the fixture opens a second window with the same disposable
HOME to verify the draft persists after a native restart. Close the second
window to clean up owned fixture resources. The fixture never starts research
or model inference. Do not describe a visual check as passed unless the
actual window was observed.
