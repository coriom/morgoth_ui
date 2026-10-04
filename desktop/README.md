# Morgoth Projects Desktop V1

This is a separate React/TypeScript/Vite + Tauri 2 application inside the UI repository. It manages **configuration only** through six native commands. The existing Next.js app remains separate. Research engines, PostgreSQL, Chroma, models and Project profiles are never started or initialized here.

```
React Projects screen → six Tauri commands → Rust reqwest client
  → authenticated loopback Management API V1 → existing ProjectManager
```

The pinned backend is `3b84197ac101c35f29149173eac64cb1465a9101`. `contracts/management_api_v1.openapi.json` has SHA-256 `681e6e6311ded43bdd28e387178641caec45535c201a3dce4ed8ecc765e79b76`. Generate TS types with `npm run types:generate`; verify the checksum and generated types with `npm run contract:check`. Rust DTO field sets, six operation IDs and token header are checked against this same artifact in `cargo test`.

## Versions and tested target

Node 22.22.3, npm 10.9.8, React 18.3.1, Vite 8.3.2, TypeScript 5.9.3, Tauri API/CLI 2.12.1, Rust/Cargo 1.95.0, tauri crate 2.12.1, reqwest 0.12.28. Dependency lockfiles are `package-lock.json` and `src-tauri/Cargo.lock`. Host target: `x86_64-unknown-linux-gnu` on WSL2. This does not imply a Windows executable or macOS support.

Native compilation is currently **blocked** on this host: `pkg-config` cannot find `glib-2.0.pc` (and the GTK3/WebKit2GTK 4.1 development packages are absent). No system packages or WSL settings were changed. After an operator supplies the official [Tauri Linux prerequisites](https://v2.tauri.app/start/prerequisites/), verify with `pkg-config --modversion glib-2.0 gtk+-3.0 webkit2gtk-4.1 libsoup-3.0`, then run `CARGO_BUILD_JOBS=2 cargo build --locked --features desktop --bin morgoth-desktop` in `src-tauri`. A native window and React→Tauri create click remain unverified until that build succeeds. WSLg would still be a Linux build.

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
cd ..
python3 scripts/smoke.py --backend /home/corio/Morgoth/dev-management-api-v1 --python /home/corio/Morgoth/morgoth/.venv/bin/python
```

The last command starts the **actual pinned development** Management API in a temporary home with two generated private synthetic token files and a dedicated random loopback port. The Rust client checks status, rejected wrong-token access, installed Domains, two same-Domain Project creations, list/get/validate, duplicate conflict and disjoint namespaces. The existing Python loader checks the generated manifests. The script bounds startup and subprocess lifetime, terminates only its own server and deletes only its temporary home. It has no production catalog or database access. If the previous AnyIO host-threadpool stall recurs, the client times out and the test reports a failure rather than treating partial results as success.

For an interactive native session **after** native prerequisites are installed, start a separate development Management API using its documented launcher and a private synthetic token file. Then set only the **native process** settings `MORGOTH_DESKTOP_MANAGEMENT_PORT=<loopback-port>` and `MORGOTH_DESKTOP_MANAGEMENT_TOKEN_FILE=<absolute-private-file>` and run `npm run tauri -- dev`. The app never starts the API itself. The token value is never passed as an argument or exposed to JS, URLs, logs, bundles or WebView state.

## Authority and UI behavior

The Rust client accepts no URL from React. It builds only `http://127.0.0.1:<validated-port>/management/v1` and fixed route paths; Project IDs are conservatively validated before interpolation. Redirects and proxies are disabled, request/connect timeouts and response size are bounded, and POST is never retried. A lost create response is **uncertain**: refresh the catalog before another attempt. Native errors contain stable codes/status only, never raw bodies or token material. The explicit token file must be a regular Linux file, owned by the user, mode 0600 or stricter, non-symlinked, with a URL-safe ≥256-bit token. Other platforms fail closed pending equivalent checks.

Tauri builds a single `main` window from local app content. The capability lists only six generated command permissions for that window; navigation to remote content and new windows are denied. No shell, filesystem or HTTP plugin is exposed to the WebView. A restrictive production CSP and separately scoped Vite development CSP are configured. The backend additionally enforces Host/Origin/token policy; the desktop does not weaken it. See the [Tauri capability model](https://v2.tauri.app/security/capabilities/) and [CSP guidance](https://v2.tauri.app/security/csp/).

The French screen loads Domains/Projects from the API, marks invalid Domain packs unavailable, and separates configuration validity from **research runtime not checked**. It accepts only name, ID and installed Domain for creation. It does not write `project.yaml`, allocate namespaces, keep a global active Project pointer, change profiles or fabricate engine readiness. `durability_confirmed=false` is displayed as created with a warning, and HTTP 409 never overwrites a Project.

The unchanged Next.js checkout passes `tsc --noEmit --incremental false` with `desktop/` excluded from its broad TypeScript glob. Its `next build` could not complete on this host because the pre-existing `app/layout.tsx` uses `next/font/google` for Inter and JetBrains Mono and both font downloads timed out, including outside the network sandbox. No web page or font configuration was changed.

Management auto-start, research-engine supervision, other Next.js pages, installers, updates, Windows/macOS security qualification and production packaging are deferred. The existing Next.js app excludes `desktop/` from its TypeScript glob; its pages and server token proxy are unchanged.
