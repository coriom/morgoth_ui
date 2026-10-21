# Desktop D3 native acceptance

## D2 connected-window baseline, before D3 code changes

The unmodified D2 worktree at `bb6b89282fb228e48865f2078438125ac214746c` ran `desktop/scripts/d2_read_fixture.py --window` under WSLg using the existing owned disposable `morgoth_test` fixture. Its native Rust/SQL proof returned `D2_NATIVE_PROJECT_READ_PASS=true D2_FRESH_PROCESS_READ_PASS=true`, then the actual Tauri window opened. The AT-SPI accessibility tree exposed all six workspace navigation buttons in the native WebView at a measured 1172×869 window size.

Controlled AT-SPI actions visited Overview, Missions, Capabilities, Models, Security and Projects. Project A exposed the synthetic mission and detail. Its capability table cells held `synthetic_read`, `PASSED`, `PENDING_APPROVAL` and `Aucun grant lu`. Switching to Project B showed accessible empty mission and capability states, with Project A's mission absent. The window Close accessibility action returned true and the owned fixture exited 0, cleaning temporary resources. WSLg emitted Mesa/EGL warnings but no GTK startup failure. This verifies connected native navigation and scope behavior, not production records or full keyboard/screen-reader conformance. No screenshot or real-model inference was required.

## D3 checks

Pending final code SHA and D3 native-window run. Record exact tests and any unavailable live Ollama evidence here after verification. A live Ollama model service is not required for the UI to truthfully show unavailable status. The preview command must run from the clean D3 worktree and uses only disposable Project storage; it performs no model generation.
