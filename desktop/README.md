# Morgoth Projects Desktop V1

This is a separate React/TypeScript/Vite + Tauri 2 application inside the UI repository. The existing Next.js app remains separate. The Desktop starts its own Management API and may initialize **one explicitly selected managed Project** research engine; autonomous research starts only after an explicit profile choice and Start action.

```
React Projects screen → thirteen fixed Tauri commands
  → Rust ManagementSupervisor → Rust-owned Management API → ProjectManager
  → Rust ResearchEngineSupervisor → one selected-Project research child
```

Both supervisors pin backend `3da091c8d8a2b9d5407a6eaf07cd615b0be01d3b` and refuse another HEAD or a dirty checkout. The Management OpenAPI artifact is **identical** to the former `3b84197` contract (SHA-256 `681e6e6311ded43bdd28e387178641caec45535c201a3dce4ed8ecc765e79b76`); `npm run contract:check` validates the pinned artifact and generated TypeScript types. Four authenticated research routes are fixed in the Rust client and are never exposed as arbitrary WebView HTTP.

## Versions and tested target

Node 22.22.3, npm 10.9.8, React 18.3.1, Vite 8.3.2, TypeScript 5.9.3, Tauri API/CLI 2.12.1, Rust/Cargo 1.95.0, tauri crate 2.12.1, reqwest 0.12.28. Dependency lockfiles are `package-lock.json` and `src-tauri/Cargo.lock`. Host target: `x86_64-unknown-linux-gnu` on WSL2. This does not imply a Windows executable or macOS support.

The operator supplied the [Tauri Linux prerequisites](https://v2.tauri.app/start/prerequisites/): GLib 2.80.0, GTK3 3.24.41, WebKit2GTK 4.1 2.52.6 and libsoup 3.0 3.4.4. The Tauri 2.12.1 native build succeeds on `x86_64-unknown-linux-gnu`; the current debug binary is `src-tauri/target/debug/morgoth-desktop` (ELF x86-64, 27,854,832 bytes). This is a Linux executable under WSL2/WSLg, **not** a Windows-native executable.

Tauri's Unix context generator uses `src-tauri/icons/icon.png` by default when no bundle icon is configured. This 256×256 RGBA PNG is converted locally from the tracked `../app/favicon.ico` 256×256 frame with `ffmpeg -i ../app/favicon.ico -map 0:v:3 -frames:v 1 src-tauri/icons/icon.png`; it is not a renamed ICO. No icon family or network asset is needed for the tested target.

The previous Management-only WSLg window opened, connected to its Rust-owned API, and reaped that child on close. The new binary also opened a titled WSLg window in a disposable home and stayed alive for a bounded 20-second smoke; no native research button interaction was proven. The earlier XWayland/AT-SPI input limitation means automated text entry is not evidence of a real UI mutation.

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
MORGOTH_DESKTOP_BACKEND_ROOT=<absolute-pinned-backend-worktree> \
MORGOTH_DESKTOP_PYTHON=<absolute-python-venv-executable> \
  CARGO_BUILD_JOBS=2 cargo run --locked --bin research-supervisor-smoke
cd ..
python3 scripts/smoke.py --backend <absolute-pinned-backend-worktree> --python <absolute-python-venv-executable>
```

`management-supervisor-smoke` creates disposable private homes; **Rust** starts the API, generates authority, checks readiness, creates/validates two same-Domain Projects, proves a second simultaneous instance has its own child and catalog, and stops/reaps both exact children. A synthetic child that never binds also proves the 15-second startup timeout and cleanup. The older `scripts/smoke.py` remains an independent transport regression with an externally launched disposable API. Both are bounded and never use the production catalog or database.

`research-supervisor-smoke` starts its own disposable Management child, creates one disposable Project, then deliberately omits research configuration. Research initialization reports FAILED without spawning a child, the Project Manager remains usable, and the owned Management child is reaped. A separate Rust supervisor test owns a contract-faithful synthetic research child, verifies listener and Project token, exercises PAUSED → explicit Claude profile → RUNNING, then stops and reaps that exact child. Neither test runs Brain or a provider.

For an interactive development window, create a private disposable home with `demo_home=$(mktemp -d); chmod 700 "$demo_home"`, then set native startup settings `MORGOTH_DESKTOP_BACKEND_ROOT` to the absolute pinned backend worktree, `MORGOTH_DESKTOP_PYTHON` to its absolute virtual-environment Python executable, and `MORGOTH_DESKTOP_HOME="$demo_home"` before `npm run tauri -- dev`. The desktop starts the API itself; it ignores the old `MORGOTH_DESKTOP_MANAGEMENT_PORT` and `MORGOTH_DESKTOP_MANAGEMENT_TOKEN_FILE` settings. Do not point this development flow at the historical production home. The Python checkout locator is a development-only input, to be replaced by a packaged sidecar later.

## Authority and UI behavior

The Rust client accepts no URL from React. It builds only `http://127.0.0.1:<validated-port>/management/v1` and fixed route paths; Project IDs are conservatively validated before interpolation. Redirects and proxies are disabled, request/connect timeouts and response size are bounded, and POST is never retried. A lost create response is **uncertain**: refresh the catalog before another attempt. Native errors contain stable codes/status only, never raw bodies or token material. Rust creates a fresh URL-safe 384-bit token in an exclusive 0700 directory under the explicitly selected 0700 home and an exclusive 0600 file; it passes only that file's path to Python, then unlinks the file after authenticated readiness. The process and token stay Rust-only. Multiple desktop instances own independent children, ports and tokens; ProjectManager's existing lock serializes same-home creation.

Each launcher accepts a port rather than an inherited bound socket. Rust checks initial availability, verifies the listener belongs to the exact child PID before sending authority, and checks liveness around authenticated readiness. A narrow bind/child-exit race remains; loopback alone is not cryptographic server identity. Linux `PR_SET_PDEATHSIG` requests child termination on parent death, without a crash-perfect claim. Normal exit reaps only owned children. Management's ephemeral token is removed after readiness; the research Project token is backend-owned and persists across restarts.

Tauri builds a single `main` window from local content. The capability lists only thirteen fixed command permissions; remote navigation and new windows are denied. No shell, filesystem or HTTP plugin is exposed to the WebView. The backend enforces Host/Origin/Project-token policy; the desktop does not weaken it. See the [Tauri capability model](https://v2.tauri.app/security/capabilities/) and [CSP guidance](https://v2.tauri.app/security/csp/).

The French screen loads Domains/Projects from the API and separates configuration validity from research readiness. The selected managed Project can initialize its engine, inspect profile readiness, explicitly select a READY profile, then explicitly start research. Codex remains BLOCKED. Selecting another Project does not rebind or stop the current engine. The historical default Project cannot be supervised. Stopping terminates the exact research child; there is no pause-after-start operation. A research failure leaves Management available.

## Native research development configuration and limits

The Rust process accepts `MORGOTH_DESKTOP_BACKEND_ROOT`, `MORGOTH_DESKTOP_PYTHON`, and `MORGOTH_DESKTOP_HOME` at startup. Research initialization additionally requires native-only `MORGOTH_DESKTOP_RESEARCH_POSTGRES_URL`, `MORGOTH_DESKTOP_RESEARCH_OLLAMA_BASE_URL`, `MORGOTH_DESKTOP_RESEARCH_OLLAMA_PRIMARY_MODEL`, `MORGOTH_DESKTOP_RESEARCH_OLLAMA_AGENT_MODEL`, `MORGOTH_DESKTOP_RESEARCH_MAX_CONCURRENT_AGENTS`, `MORGOTH_DESKTOP_RESEARCH_LOG_RETENTION_DAYS`, and `MORGOTH_DESKTOP_RESEARCH_LOG_LEVEL_THOUGHT`. No value is accepted from React. Rust generates a fresh process-local `SECRET_KEY`; the child receives an explicit environment, not inherited production `.env`, task overrides or unrelated API keys. Rust locates the existing Claude executable and supplies the native user-home context without reading or copying its credentials. Claude READY is a non-inference precondition check, not proof of login/quota. Codex cannot run while the backend qualification lock is set.

The research child starts PAUSED or NOT_READY; initialization can still perform existing dependency/tool probes and is not promised to be network-silent. The Rust client reads `<Project.runtime_dir>/auth/ui_token` only after confirming listener ownership, and never returns the token/path to JS. The future Desktop installer must replace the Python-checkout locator. Real-backend research startup was not used as a test merely to claim readiness; its live probes could touch external services. The synthetic supervisor and transport tests prove the native process/HTTP lifecycle, while the backend's own focused tests cover Brain state transitions. Management auto-start remains independent. Chat/events, multiple simultaneous engines, installers and Windows/macOS qualification are deferred.

The unchanged Next.js checkout passes `tsc --noEmit --incremental false` with `desktop/` excluded from its broad TypeScript glob. Its `next build` could not complete on this host because the pre-existing `app/layout.tsx` uses `next/font/google` for Inter and JetBrains Mono and both font downloads timed out, including outside the network sandbox. No web page or font configuration was changed.

Chat/events, other Next.js pages, installers, updates, Windows/macOS security qualification and production packaging are deferred. The existing Next.js app excludes `desktop/` from its TypeScript glob; its pages and server token proxy are unchanged.
