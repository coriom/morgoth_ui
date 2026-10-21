# Desktop D3 native acceptance

## D2 connected-window baseline, before D3 code changes

The unmodified D2 worktree at `bb6b89282fb228e48865f2078438125ac214746c` ran `desktop/scripts/d2_read_fixture.py --window` under WSLg using the existing owned disposable `morgoth_test` fixture. Its native Rust/SQL proof returned `D2_NATIVE_PROJECT_READ_PASS=true D2_FRESH_PROCESS_READ_PASS=true`, then the actual Tauri window opened. The AT-SPI accessibility tree exposed all six workspace navigation buttons in the native WebView at a measured 1172×869 window size.

Controlled AT-SPI actions visited Overview, Missions, Capabilities, Models, Security and Projects. Project A exposed the synthetic mission and detail. Its capability table cells held `synthetic_read`, `PASSED`, `PENDING_APPROVAL` and `Aucun grant lu`. Switching to Project B showed accessible empty mission and capability states, with Project A's mission absent. The window Close accessibility action returned true and the owned fixture exited 0, cleaning temporary resources. WSLg emitted Mesa/EGL warnings but no GTK startup failure. This verifies connected native navigation and scope behavior, not production records or full keyboard/screen-reader conformance. No screenshot or real-model inference was required.

## D3 checks

The D3 code candidate `f10aea7d3c8ea0ef41d4c707760b662dfdc3e096` was clean before running the same disposable native fixture from its own worktree:

```sh
/home/corio/Morgoth/morgoth/.venv/bin/python desktop/scripts/d2_read_fixture.py --window
```

The fixture reported `D2_NATIVE_PROJECT_READ_PASS=true`, `D2_FRESH_PROCESS_READ_PASS=true`, `DISPOSABLE_TEST_ONLY=true` and `PRODUCTION_QUALIFIED=false`; the D3 Tauri window opened under WSLg. AT-SPI exposed the six workspaces. Before entering Models, no local-model read was requested. After selecting Models, the page showed `Lecture non demandée` and a manual `Lire l’état local` control. One controlled activation populated the installed and resident sections, a last-read timestamp and a Linux resource panel. The accessibility text included `Accessible` for the local Ollama read; a separate bounded, non-generative GET to the validated loopback `/api/tags` returned HTTP 200 with its body discarded. These observations prove the read-only local status path in this environment, not model inference, qualification or CPU/GPU placement. The D3 preview was interrupted after inspection rather than closed normally; process inspection found no remaining fixture or Desktop process. Its exit code 1 is a cleanup limitation of this run, while the earlier D2 connected fixture closed and exited 0.

Verification at the code candidate: `npm run typecheck`, `npm test -- --run` (28 passed), `npm run contract:check` and `npm run build` passed. Rust `cargo fmt --all -- --check`, `cargo test --locked --offline --lib --test transport --test ollama_read` (22 library, 11 transport, 5 HTTP adapter tests passed), strict `cargo clippy --locked --offline --features desktop --all-targets -- -D warnings`, the Linux Tauri `cargo build --locked --offline --features desktop --bin morgoth-desktop`, and the disposable-read smoke binary build passed. One concurrent frontend run timed out an existing Project-isolation test at Vitest's five-second limit while Rust compilation competed for resources; that test passed alone in 1.66 seconds and the full frontend suite passed sequentially in 3.94 seconds. The original timeout is retained as an environment/resource observation, not hidden as a product PASS.

No PostgreSQL or backend canonical suite was rerun: D3 leaves the Project read implementation, pinned backend SHA and database path unchanged. WSLg Mesa/EGL warnings remain, and this inspection does not establish complete keyboard or screen-reader accessibility. The local model endpoint was read, never used for generation. For a safe native preview, run the command above from a clean D3 worktree; it owns disposable `morgoth_test` resources and does not start research or model inference.
