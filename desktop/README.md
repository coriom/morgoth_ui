# Morgoth Projects Desktop V1

This is a separate React/TypeScript/Vite + Tauri 2 application inside the UI repository. It manages **configuration only** through seven fixed native commands. The existing Next.js app remains separate. Research engines, PostgreSQL, Chroma, models and Project profiles are never started or initialized here.

```
React Projects screen → seven Tauri commands → Rust ManagementSupervisor/client
  → Rust-owned Python Management API V1 child → existing ProjectManager
```

The pinned backend is `3b84197ac101c35f29149173eac64cb1465a9101`. The native supervisor refuses another HEAD or a dirty checkout before spawning. `contracts/management_api_v1.openapi.json` has SHA-256 `681e6e6311ded43bdd28e387178641caec45535c201a3dce4ed8ecc765e79b76`. Generate TS types with `npm run types:generate`; verify the checksum and generated types with `npm run contract:check`. Rust DTO field sets, six HTTP operation IDs and token header are checked against this artifact in `cargo test`; the seventh Tauri command reports only supervisor state.

## Versions and tested target

Node 22.22.3, npm 10.9.8, React 18.3.1, Vite 8.3.2, TypeScript 5.9.3, Tauri API/CLI 2.12.1, Rust/Cargo 1.95.0, tauri crate 2.12.1, reqwest 0.12.28. Dependency lockfiles are `package-lock.json` and `src-tauri/Cargo.lock`. Host target: `x86_64-unknown-linux-gnu` on WSL2. This does not imply a Windows executable or macOS support.

The operator supplied the [Tauri Linux prerequisites](https://v2.tauri.app/start/prerequisites/): GLib 2.80.0, GTK3 3.24.41, WebKit2GTK 4.1 2.52.6 and libsoup 3.0 3.4.4. The Tauri 2.12.1 native build succeeds on `x86_64-unknown-linux-gnu`; the current debug binary is `src-tauri/target/debug/morgoth-desktop` (ELF x86-64, 27,854,832 bytes). This is a Linux executable under WSL2/WSLg, **not** a Windows-native executable.

Tauri's Unix context generator uses `src-tauri/icons/icon.png` by default when no bundle icon is configured. This 256×256 RGBA PNG is converted locally from the tracked `../app/favicon.ico` 256×256 frame with `ffmpeg -i ../app/favicon.ico -map 0:v:3 -frames:v 1 src-tauri/icons/icon.png`; it is not a renamed ICO. No icon family or network asset is needed for the tested target.

The actual WSLg window opened with no externally started API or supplied token. Its Rust supervisor spawned the pinned backend child, reached READY, removed the bootstrap token file, and showed connected management and the legacy Project. A separate invalid-backend window opened with “Gestion locale indisponible” and no API child. Closing the connected window normally reaped only its API child. Automated native form entry was **not** completed: XWayland gave synthetic X11 keyboard events no input focus and WebKit's AT-SPI entries lacked `EditableText`. The React→Tauri create click remains unproven; Rust supervisor→HTTP→ProjectManager creation of two disposable Projects passed.

## Reproducible checks and disposable demo

From `desktop/`:

```sh
npm ci
npm run contract:check
npm test
npm run build
cd src-tauri
CARGO_BUILD_JOBS=2 cargo fmt --check
CARGO_BUILD_JOBS=2 cargo test --locked
CARGO_BUILD_JOBS=2 cargo clippy --locked --all-targets -- -D warnings
CARGO_BUILD_JOBS=2 cargo build --locked --features desktop --bin morgoth-desktop
MORGOTH_DESKTOP_BACKEND_ROOT=<absolute-pinned-backend-worktree> \
MORGOTH_DESKTOP_PYTHON=<absolute-python-venv-executable> \
  CARGO_BUILD_JOBS=2 cargo run --locked --bin management-supervisor-smoke
cd ..
python3 scripts/smoke.py --backend /home/corio/Morgoth/dev-management-api-v1 --python /home/corio/Morgoth/morgoth/.venv/bin/python
```

`management-supervisor-smoke` creates disposable private homes; **Rust** starts the API, generates authority, checks readiness, creates/validates two same-Domain Projects, proves a second simultaneous instance has its own child and catalog, and stops/reaps both exact children. A synthetic child that never binds also proves the 15-second startup timeout and cleanup. The older `scripts/smoke.py` remains an independent transport regression with an externally launched disposable API. Both are bounded and never use the production catalog or database.

For an interactive development window, create a private disposable home with `demo_home=$(mktemp -d); chmod 700 "$demo_home"`, then set native startup settings `MORGOTH_DESKTOP_BACKEND_ROOT` to the absolute pinned backend worktree, `MORGOTH_DESKTOP_PYTHON` to its absolute virtual-environment Python executable, and `MORGOTH_DESKTOP_HOME="$demo_home"` before `npm run tauri -- dev`. The desktop starts the API itself; it ignores the old `MORGOTH_DESKTOP_MANAGEMENT_PORT` and `MORGOTH_DESKTOP_MANAGEMENT_TOKEN_FILE` settings. Do not point this development flow at the historical production home. The Python checkout locator is a development-only input, to be replaced by a packaged sidecar later.

## Authority and UI behavior

The Rust client accepts no URL from React. It builds only `http://127.0.0.1:<validated-port>/management/v1` and fixed route paths; Project IDs are conservatively validated before interpolation. Redirects and proxies are disabled, request/connect timeouts and response size are bounded, and POST is never retried. A lost create response is **uncertain**: refresh the catalog before another attempt. Native errors contain stable codes/status only, never raw bodies or token material. Rust creates a fresh URL-safe 384-bit token in an exclusive 0700 directory under the explicitly selected 0700 home and an exclusive 0600 file; it passes only that file's path to Python, then unlinks the file after authenticated readiness. The process and token stay Rust-only. Multiple desktop instances own independent children, ports and tokens; ProjectManager's existing lock serializes same-home creation.

The launcher accepts a port rather than an inherited bound socket. Rust checks initial availability, then verifies the TCP listener socket belongs to its child PID before sending the token and checks child liveness around authenticated readiness. There remains a narrow bind/child-exit race; loopback alone is not a cryptographic server identity. Linux `PR_SET_PDEATHSIG` asks the kernel to terminate the child if the long-lived supervisor thread dies, but crash-perfect cleanup is not claimed. A crash during the short pre-READY interval can leave a private, stale token file; the next instance never reuses it or deletes an unproven directory. On normal exit, only the owned child is terminated/reaped and only the owned authority directory is removed. The home must be cleaned by its owner when a disposable demo ends.

Tauri builds a single `main` window from local app content. The capability lists only seven fixed command permissions for that window; navigation to remote content and new windows are denied. No shell, filesystem or HTTP plugin is exposed to the WebView. A restrictive production CSP and separately scoped Vite development CSP are configured. The backend additionally enforces Host/Origin/token policy; the desktop does not weaken it. See the [Tauri capability model](https://v2.tauri.app/security/capabilities/) and [CSP guidance](https://v2.tauri.app/security/csp/).

The French screen loads Domains/Projects from the API, marks invalid Domain packs unavailable, and separates configuration validity from **research runtime not checked**. It accepts only name, ID and installed Domain for creation. It does not write `project.yaml`, allocate namespaces, keep a global active Project pointer, change profiles or fabricate engine readiness. `durability_confirmed=false` is displayed as created with a warning, and HTTP 409 never overwrites a Project.

The unchanged Next.js checkout passes `tsc --noEmit --incremental false` with `desktop/` excluded from its broad TypeScript glob. Its `next build` could not complete on this host because the pre-existing `app/layout.tsx` uses `next/font/google` for Inter and JetBrains Mono and both font downloads timed out, including outside the network sandbox. No web page or font configuration was changed.

Research-engine supervision, other Next.js pages, installers, updates, Windows/macOS security qualification and production packaging are deferred. The existing Next.js app excludes `desktop/` from its TypeScript glob; its pages and server token proxy are unchanged.
