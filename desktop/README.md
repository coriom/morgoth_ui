# Morgoth Projects Desktop V1

This is a separate React/TypeScript/Vite + Tauri 2 application inside the UI repository. The existing Next.js app remains separate. The Desktop starts its own Management API and may initialize **one explicitly selected managed Project** research engine; autonomous research starts only after an explicit profile choice and Start action.

```
React Projects screen → thirteen fixed Tauri commands
  → Rust ManagementSupervisor → Rust-owned Management API → ProjectManager
  → Rust ResearchEngineSupervisor → one selected-Project research child
```

Both supervisors pin backend `1afa971ea55fe58623e47d4493e6f09dba63ee5e` and refuse another HEAD or a dirty checkout. The Management OpenAPI artifact is **byte-identical** at `3da091c` and `1afa971` and to the pinned frontend artifact (SHA-256 `681e6e6311ded43bdd28e387178641caec45535c201a3dce4ed8ecc765e79b76`); regeneration from the actual `1afa971` app yields the same bytes. `npm run contract:check` validates the generated TypeScript types. The strict Rust runtime/profile DTOs match the unchanged backend response models; four authenticated research routes remain fixed in Rust.

## Versions and tested target

Node 22.22.3, npm 10.9.8, React 18.3.1, Vite 8.3.2, TypeScript 5.9.3, Tauri API/CLI 2.12.1, Rust/Cargo 1.95.0, tauri crate 2.12.1, reqwest 0.12.28. Dependency lockfiles are `package-lock.json` and `src-tauri/Cargo.lock`. Host target: `x86_64-unknown-linux-gnu` on WSL2. This does not imply a Windows executable or macOS support.

The operator supplied the [Tauri Linux prerequisites](https://v2.tauri.app/start/prerequisites/): GLib 2.80.0, GTK3 3.24.41, WebKit2GTK 4.1 2.52.6 and libsoup 3.0 3.4.4. The Tauri 2.12.1 native build succeeds on `x86_64-unknown-linux-gnu`; the current debug binary is `src-tauri/target/debug/morgoth-desktop` (ELF x86-64, 27,854,832 bytes). This is a Linux executable under WSL2/WSLg, **not** a Windows-native executable.

Tauri's Unix context generator uses `src-tauri/icons/icon.png` by default when no bundle icon is configured. This 256×256 RGBA PNG is converted locally from the tracked `../app/favicon.ico` 256×256 frame with `ffmpeg -i ../app/favicon.ico -map 0:v:3 -frames:v 1 src-tauri/icons/icon.png`; it is not a renamed ICO. No icon family or network asset is needed for the tested target.

The WSLg debug window opened with a local Vite server, a disposable home, and its Rust-owned Management child. A temporary bootstrap Management API created `desktop_probe` in that home before the desktop launched. The native accessibility tree showed the managed Project and installed Crypto/Weather Domains; selecting the Project through its normal accessibility button exposed “Moteur de recherche” and “Initialiser le moteur”. The initialize button was **not** pressed in the native window; the real PAUSED proof comes from the Rust-owned process smoke. X11 root capture was black under WSLg, so no screenshot or native click-through to PAUSED is claimed.

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
CARGO_BUILD_JOBS=2 cargo build --locked --bin real-research-paused-smoke
cd ..
python3 scripts/smoke.py --backend <absolute-pinned-backend-worktree> --python <absolute-python-venv-executable>
python3 scripts/real_research_paused_smoke.py \
  --backend <absolute-clean-1afa971-worktree> \
  --python <absolute-python-venv-executable> \
  --binary src-tauri/target/debug/real-research-paused-smoke
# Optional WSLg native window, with a local Vite server started and stopped by the harness:
python3 scripts/real_research_paused_smoke.py \
  --backend <absolute-clean-1afa971-worktree> \
  --python <absolute-python-venv-executable> \
  --binary src-tauri/target/debug/real-research-paused-smoke \
  --native-binary src-tauri/target/debug/morgoth-desktop
```

`management-supervisor-smoke` creates disposable private homes; **Rust** starts the API, generates authority, checks readiness, creates/validates two same-Domain Projects, proves a second simultaneous instance has its own child and catalog, and stops/reaps both exact children. A synthetic child that never binds also proves the 15-second startup timeout and cleanup. The older `scripts/smoke.py` remains an independent transport regression with an externally launched disposable API. Both are bounded and never use the production catalog or database.

`research-supervisor-smoke` starts its own disposable Management child, creates one disposable Project, then deliberately omits research configuration. Research initialization reports FAILED without spawning a child, the Project Manager remains usable, and the owned Management child is reaped. A separate Rust supervisor test owns a contract-faithful synthetic research child, verifies listener and Project token, exercises PAUSED → explicit Claude profile → RUNNING, then stops and reaps that exact child. Neither test runs Brain or a provider.

`real_research_paused_smoke.py` creates its **own** Unix-socket PostgreSQL cluster and database named `morgoth_test`, plus a loopback fake Ollama that accepts only `GET /api/tags` and returns `test-primary`/`test-agent`. Rust owns the actual Management API and sequentially starts the actual `scripts.research_engine` for disposable Crypto and Weather Projects. It verifies authenticated strict DTOs, PAUSED without an autonomous task, the lease conflict from a second actual launcher, independent second-Project lease, stop/reap, and reinitialization of the released Project. A second invocation with `test-agent` absent proves real NOT_READY while Management remains available. The smoke drops only its generated schemas and stops only its own PostgreSQL/fake-server processes. It never calls `/start`, Claude/Codex, market, weather, or web tools. The observed fake-server traffic was exclusively `/api/tags`; the test does not claim a general-purpose network sandbox.

| Proof | Synthetic | Real backend |
|---|---|---|
| Management lifecycle | yes | yes |
| Research process spawn | yes | yes |
| Project lease | fixture | yes, duplicate actual launcher denied |
| Crypto PAUSED | yes | yes |
| Weather PAUSED | n/a | yes |
| Codex BLOCKED | yes | yes |
| Claude selection | yes | optional; not exercised here |
| Autonomous RUNNING | yes | **no** |
| Real provider inference | no | **no** |

**A real Morgoth research engine is now supervised end-to-end through PAUSED. Autonomous START remains unqualified against real providers.**

On 2026-10-06, the contract check, 15 frontend tests, TypeScript/Vite build, 16 Rust unit tests, 8 Rust transport tests, strict Clippy, and native Linux build passed. The existing Management smoke and missing-research-config smoke passed separately. The real-backend smoke passed for Crypto PAUSED, Weather PAUSED, lease conflict/reacquisition, and missing-model NOT_READY; it recorded 11 `GET /api/tags` requests and no other fake-Ollama path. In this disposable environment, the backend reported `legacy=BLOCKED`, `claude=UNAVAILABLE`, and `codex=BLOCKED`. The native WSLg window and normal Project selection were observed through AT-SPI; no native initialize/START click was performed.

For an interactive development window, create a private disposable home with `demo_home=$(mktemp -d); chmod 700 "$demo_home"`, then set native startup settings `MORGOTH_DESKTOP_BACKEND_ROOT` to the absolute pinned backend worktree, `MORGOTH_DESKTOP_PYTHON` to its absolute virtual-environment Python executable, and `MORGOTH_DESKTOP_HOME="$demo_home"` before `npm run tauri -- dev`. The desktop starts the API itself; it ignores the old `MORGOTH_DESKTOP_MANAGEMENT_PORT` and `MORGOTH_DESKTOP_MANAGEMENT_TOKEN_FILE` settings. Do not point this development flow at the historical production home. The Python checkout locator is a development-only input, to be replaced by a packaged sidecar later.

## Authority and UI behavior

The Rust client accepts no URL from React. It builds only `http://127.0.0.1:<validated-port>/management/v1` and fixed route paths; Project IDs are conservatively validated before interpolation. Redirects and proxies are disabled, request/connect timeouts and response size are bounded, and POST is never retried. A lost create response is **uncertain**: refresh the catalog before another attempt. Native errors contain stable codes/status only, never raw bodies or token material. Rust creates a fresh URL-safe 384-bit token in an exclusive 0700 directory under the explicitly selected 0700 home and an exclusive 0600 file; it passes only that file's path to Python, then unlinks the file after authenticated readiness. The process and token stay Rust-only. Multiple desktop instances own independent children, ports and tokens; ProjectManager's existing lock serializes same-home creation.

Each launcher accepts a port rather than an inherited bound socket. Rust checks initial availability, verifies the listener belongs to the exact child PID before sending authority, and checks liveness around authenticated readiness. A narrow bind/child-exit race remains; loopback alone is not cryptographic server identity. Linux `PR_SET_PDEATHSIG` requests child termination on parent death, without a crash-perfect claim. Normal exit reaps only owned children. Management's ephemeral token is removed after readiness; the research Project token is backend-owned and persists across restarts.

Tauri builds a single `main` window from local content. The capability lists only thirteen fixed command permissions; remote navigation and new windows are denied. No shell, filesystem or HTTP plugin is exposed to the WebView. The backend enforces Host/Origin/Project-token policy; the desktop does not weaken it. See the [Tauri capability model](https://v2.tauri.app/security/capabilities/) and [CSP guidance](https://v2.tauri.app/security/csp/).

The French screen loads Domains/Projects from the API and separates configuration validity from research readiness. The selected managed Project can initialize its engine, inspect profile readiness, explicitly select a READY profile, then explicitly start research. Codex remains BLOCKED. Selecting another Project does not rebind or stop the current engine. The historical default Project cannot be supervised. Stopping terminates the exact research child; there is no pause-after-start operation. A research failure leaves Management available.

## Native research development configuration and limits

The Rust process accepts `MORGOTH_DESKTOP_BACKEND_ROOT`, `MORGOTH_DESKTOP_PYTHON`, and `MORGOTH_DESKTOP_HOME` at startup. Research initialization additionally requires native-only `MORGOTH_DESKTOP_RESEARCH_POSTGRES_URL`, `MORGOTH_DESKTOP_RESEARCH_OLLAMA_BASE_URL`, `MORGOTH_DESKTOP_RESEARCH_OLLAMA_PRIMARY_MODEL`, `MORGOTH_DESKTOP_RESEARCH_OLLAMA_AGENT_MODEL`, `MORGOTH_DESKTOP_RESEARCH_MAX_CONCURRENT_AGENTS`, `MORGOTH_DESKTOP_RESEARCH_LOG_RETENTION_DAYS`, and `MORGOTH_DESKTOP_RESEARCH_LOG_LEVEL_THOUGHT`. No value is accepted from React. Rust generates a fresh process-local `SECRET_KEY`; the child receives an explicit environment, not inherited production `.env`, task overrides or unrelated API keys. Rust locates the existing Claude executable and supplies the native user-home context without reading or copying its credentials. Claude READY is a non-inference precondition check, not proof of login/quota. Codex cannot run while the backend qualification lock is set.

The research child starts PAUSED or NOT_READY. Backend `1afa971` uses structural rail checks and a bounded local Ollama `/api/tags` preflight for Desktop PAUSED; it does not run research tools, warmup chat or recurring research merely on initialization. The Rust client reads `<Project.runtime_dir>/auth/ui_token` only after confirming listener ownership, and never returns the token/path to JS. The future Desktop installer must replace the Python-checkout locator. Management auto-start remains independent. Chat/events, multiple simultaneous engines, installers and Windows/macOS qualification are deferred.

The unchanged Next.js checkout passes `tsc --noEmit --incremental false` with `desktop/` excluded from its broad TypeScript glob. Its `next build` could not complete on this host because the pre-existing `app/layout.tsx` uses `next/font/google` for Inter and JetBrains Mono and both font downloads timed out, including outside the network sandbox. No web page or font configuration was changed.

Chat/events, other Next.js pages, installers, updates, Windows/macOS security qualification and production packaging are deferred. The existing Next.js app excludes `desktop/` from its TypeScript glob; its pages and server token proxy are unchanged.
