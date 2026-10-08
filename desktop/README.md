# Morgoth Projects Desktop V1

This is a separate React/TypeScript/Vite + Tauri 2 application inside the UI repository. The existing Next.js app remains separate. The Desktop starts its own Management API and may initialize **one explicitly selected managed Project** research engine; autonomous research starts only after an explicit profile choice and Start action.

```
React Projects screen → thirteen fixed Tauri commands
  → Rust ManagementSupervisor → Rust-owned Management API → ProjectManager
  → Rust ResearchEngineSupervisor → one selected-Project research child
```

Both supervisors pin backend `6a0dc9db67345e9dc2b61e75e62640b54a245b9d` and refuse another HEAD or a dirty checkout. The Management OpenAPI artifact regenerated from that commit is byte-identical to the pinned frontend artifact (SHA-256 `681e6e6311ded43bdd28e387178641caec45535c201a3dce4ed8ecc765e79b76`). `npm run contract:check` validates the generated TypeScript types. The strict Rust runtime/profile DTOs match the backend response models; five authenticated research routes remain fixed in Rust, including cheap `/liveness` for steady-state monitoring.

The former two-second Rust monitor polled `/status`, which recomputes profile readiness through Ollama tags, hardware and Claude version probes. Backend `6a0dc9d` adds token-protected `/liveness` containing only identity and owned-task state; Rust now polls it and retains the last explicit full profile-readiness result for display. A backend task failure maps to a bounded `BACKEND_TASK_*` diagnostic. Full status and profile controls still perform qualified readiness checks. This removes the control-plane liveness hazard; causality of the prior `d5122ba` failure remains unproven.

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
  --backend <absolute-clean-6a0dc9d-worktree> \
  --python <absolute-python-venv-executable> \
  --binary src-tauri/target/debug/real-research-paused-smoke
# Optional WSLg native window, with a local Vite server started and stopped by the harness:
python3 scripts/real_research_paused_smoke.py \
  --backend <absolute-clean-6a0dc9d-worktree> \
  --python <absolute-python-venv-executable> \
  --binary src-tauri/target/debug/real-research-paused-smoke \
  --native-binary src-tauri/target/debug/morgoth-desktop
```

`management-supervisor-smoke` creates disposable private homes; **Rust** starts the API, generates authority, checks readiness, creates/validates two same-Domain Projects, proves a second simultaneous instance has its own child and catalog, and stops/reaps both exact children. A synthetic child that never binds also proves the 15-second startup timeout and cleanup. The older `scripts/smoke.py` remains an independent transport regression with an externally launched disposable API. Both are bounded and never use the production catalog or database.

`research-supervisor-smoke` starts its own disposable Management child, creates one disposable Project, then deliberately omits research configuration. Research initialization reports FAILED without spawning a child, the Project Manager remains usable, and the owned Management child is reaped. A separate Rust supervisor test owns a contract-faithful synthetic research child, verifies listener and Project token, exercises PAUSED → explicit Claude profile → RUNNING, then stops and reaps that exact child. Neither test runs Brain or a provider.

`real_research_paused_smoke.py` creates its **own** Unix-socket PostgreSQL cluster and database named `morgoth_test`, plus a loopback fake Ollama that accepts only `GET /api/tags` and returns `test-primary`/`test-agent`. Rust owns the actual Management API and sequentially starts the actual `scripts.research_engine` for disposable Crypto and Weather Projects. It verifies authenticated strict DTOs, PAUSED without an autonomous task, the lease conflict from a second actual launcher, independent second-Project lease, stop/reap, and reinitialization of the released Project. A second invocation with `test-agent` absent proves real NOT_READY while Management remains available. The smoke drops only its generated schemas and stops only its own PostgreSQL/fake-server processes. It never calls `/start`, Claude/Codex, market, weather, or web tools. The observed fake-server traffic was exclusively `/api/tags`; the test does not claim a general-purpose network sandbox.

For the **separately authorized real START qualification only**, build `real-research-start-smoke` and run `scripts/real_research_start_smoke.py --backend <absolute-clean-6a0dc9d-worktree> --python <absolute-python-venv-executable> --binary src-tauri/target/debug/real-research-start-smoke`. It requires an already-running local Ollama with an already-installed tool-capable model (default `llama3.1:8b`); it never pulls a model. The wrapper creates a private Unix-socket PostgreSQL cluster named `morgoth_test`, and Rust starts its own Management and Weather research children. The smoke proves the Project schema is absent after ProjectManager creation, then present with all required objective columns after the real engine reaches PAUSED. Its bounded helper inspects existing storage and creates one human objective through `ObjectivesManager`; it never invokes `scripts.init_db` or creates a table. The test refuses START unless the actual profile catalog reports Claude READY and Codex BLOCKED; Claude is selected explicitly and receives no prompt. A failed legacy-profile START is checked first. Rust starts one work iteration, observes bounded objective/tool metadata, then stops/reaps its exact child after durable cycle evidence. No production state or provider credentials are copied. Do not treat this as a general network sandbox or an unattended recurring test.

Native-only optional overrides map `MORGOTH_DESKTOP_RESEARCH_CONNECTIVITY_CHECK_ENABLED`, `MORGOTH_DESKTOP_RESEARCH_METRIC_RECORDER_ENABLED`, `MORGOTH_DESKTOP_RESEARCH_SOURCE_CACHE_ENABLED`, `MORGOTH_DESKTOP_RESEARCH_PROVIDER_HEARTBEAT_MINUTES`, and `MORGOTH_DESKTOP_RESEARCH_AUTONOMOUS_CYCLE_MINUTES`, plus `MORGOTH_DESKTOP_RESEARCH_MAX_CYCLES_PER_OBJECTIVE` and `MORGOTH_DESKTOP_RESEARCH_LLM_FALLBACK_ENABLED`, to their corresponding backend names. They are absent by default, strictly validated, and never exposed to React. The one-cycle smoke sets `false`, `false`, `false`, `999999`, and `60` respectively. The first provider heartbeat may still run if host monotonic uptime exceeds the configured interval; this setup does not independently prove the absence of every network call. The work-cycle tool loop itself permits up to five rounds and may make more than one tool call; count actual persisted calls, not just objectives.

The separately authorized **one-shot Claude finalization qualification** uses backend `6a0dc9d`, a new private `morgoth_test` Unix-socket cluster, one Weather Project and one human objective. Run it only once per qualification attempt, after building `real-claude-finalization-smoke`:

```sh
python3 scripts/real_claude_finalization_smoke.py \
  --backend <absolute-clean-6a0dc9d-worktree> \
  --python <absolute-python-venv-executable> \
  --binary src-tauri/target/debug/real-claude-finalization-smoke
```

The native-only child overrides are connectivity/metric/source-cache disabled, heartbeat `999999` minutes, cycle cadence `1` minute, objective cap `3`, and `LLM_FALLBACK_ENABLED=false`. The wrapper checks an installed local Ollama model and an existing Claude executable; the real backend profile gate must independently report Claude READY before the Rust supervisor selects it. The parent supplies a synthetic API-key canary solely to prove the child does not inherit it. The smoke performs no `scripts.init_db` call. `finalization_evidence.py` reads a single read-only Project snapshot and prints only bounded IDs, counts, tool outcomes, Claude call metadata, synthesis length/hash, gate actions and abstention count. Any unsuccessful/missing provider call, missing measurement source, extra objective, fallback event, or cycle overrun fails the attempt; it does not retry to obtain a favorable thesis.

| Proof | Synthetic | Real backend |
|---|---|---|
| Management lifecycle | yes | yes |
| Research process spawn | yes | yes |
| Project configuration creation | yes | yes |
| Runtime objective DB provisioning | fixture | yes, on engine initialization |
| Manual `init_db` prerequisite | no | no |
| Project lease | fixture | yes, duplicate actual launcher denied |
| Crypto PAUSED | yes | yes |
| Weather PAUSED | n/a | yes |
| Codex BLOCKED | yes | yes |
| Claude selection | yes | yes, non-inference readiness gate |
| Autonomous RUNNING | yes | yes, one disposable objective cycle |
| Local Ollama inference | no | yes, one persisted autonomous result |
| Weather tool execution | no | yes, `get_weather_forecast_met` |
| Persisted cycle evidence | no | yes, one `cycle_payload` |
| Second autonomous cycle | no | no, stopped with `cycle_count=1` |
| Claude synthesis/thesis inference | no | no |

**A real Morgoth research engine was supervised through one autonomous Weather work cycle.** This evaluates the local Ollama work path and one Weather tool call, not Claude synthesis, thesis extraction, three-source completion, sustained autonomy, research quality, or production readiness. The acquired provider result is not a controlled scientific accuracy result.

On 2026-10-06 the disposable real START produced objective `8cd20fc5-f7b7-48c8-9600-badaf701e0de`: `cycle_count=1`, one `cycle_payload`, one autonomous Ollama result log, and `get_weather_forecast_met:success`. The backend reported `claude=READY`, `codex=BLOCKED`; the initially blocked legacy START was refused. Rust stopped its owned child immediately after durable evidence, Management remained READY, and a bounded post-stop read still showed `cycle_count=1`. The backend and UI production checkouts were not used for data.

The earlier 2026-10-06 run did not repeat a live objective merely to check later harness assertions. The 2026-10-08 requalification below independently executed the updated harness. The smoke checks owned child PID, lease conflict/release, and that a synthetic parent API key is absent from the child's explicit environment. It records persisted tool results; it does not claim to instrument every system-level network call.

On 2026-10-08 the actual backend `39632779` self-provisioned a fresh disposable Weather Project schema and all required objective columns before PAUSED. The helper contained no `scripts.init_db` import or call. The real START produced objective `56774674-d328-434c-b2ad-cc477a1198ca`: one objective, `cycle_count=1`, one `cycle_payload`, one autonomous Ollama result log, and `get_weather_forecast_met:success`. The backend reported `claude=READY`, `codex=BLOCKED`; blocked legacy START was refused before explicit Claude selection. Rust stopped and reaped its exact child after the first durable payload, released the Project lease, kept Management READY, and confirmed `cycle_count=1` after a bounded delay. The disposable `morgoth_test` cluster was stopped and removed.

### 2026-10-08: Claude finalization qualification attempt on backend `7d811633`

The Management OpenAPI remained byte-identical (SHA-256 `681e6e6311ded43bdd28e387178641caec45535c201a3dce4ed8ecc765e79b76`); strict Rust runtime/profile DTOs compiled and passed their tests. The real one-shot run used one disposable Weather Project, one human objective, `morgoth_test`, local Ollama, native `MAX_CYCLES_PER_OBJECTIVE=3`, and `LLM_FALLBACK_ENABLED=false`. The research child did not inherit the parent API-key canary. The real profile catalog reported `claude=READY` and `codex=BLOCKED`; Claude was selected explicitly. The objective reached `cycle_count=1`, one durable `cycle_payload`, and one counted data source. The Rust supervisor then reported `FAILED` before a second payload. The objective UUID, first source's identity/success and the supervisor's specific failure diagnostic were not captured by this run's bounded output; the harness now emits the bounded UUID and diagnostic for future separately authorized runs. No synthesis/thesis `llm_calls`, numeric-fidelity result, or finalization result was proven. The harness stopped its owned child and disposed of the private test database. **Qualification is BLOCKED; do not infer Claude inference or complete multi-source research.** The subsequent harness records the safe supervisor diagnostic on a future, separately authorized run; this attempt is not retried for a favorable thesis.

| Capability | Real evidence at `7d811633` |
|---|---|
| Management child, research child, self-bootstrap DB, PAUSED | YES |
| Codex blocked; Claude selected; fallback disabled in child | YES |
| Autonomous START, one persisted Ollama work-cycle payload | YES |
| MET and NWS both successful | NOT PROVEN |
| Objective completion | NO |
| Claude synthesis and thesis inference | NO |
| Thesis persisted or explicit abstention | NO |
| Numeric-fidelity live candidate | NOT EXERCISED |
| Rust stop/cleanup after failure | YES; no matching disposable child remained |
| Sustained autonomy or production readiness | NO |

The separate real PAUSED/NOT_READY smoke passed with only fake `/api/tags` requests. The prior one-cycle START regression was attempted twice on this pin: the first request returned backend HTTP 409 before START; the second confirmed profile READY and accepted START but timed out waiting five minutes for a durable payload. Both used disposable state and stopped; neither result is a green regression. The failure cause remains undiagnosed, and the backend repository was not changed.

### 2026-10-08: liveness hardening and gated diagnostic requalification

Backend `6a0dc9db67345e9dc2b61e75e62640b54a245b9d` separates cheap authenticated `/liveness` from full profile readiness, overlaps synchronous local probes, and reuses one fresh readiness snapshot for START. The Desktop monitor now polls only `/liveness`; a synthetic child keeps `/status` slower than the old eight-second request timeout while three liveness intervals remain RUNNING. Three subsequent genuine liveness failures yield `LIVENESS_UNAVAILABLE`. Rust failure diagnostics are bounded (`CHILD_EXITED`, `PORT_NOT_OWNED`, `RUNTIME_IDENTITY_MISMATCH`, `LIVENESS_UNAVAILABLE`, `BACKEND_TASK_*`, `RUNTIME_MONITOR_UNAVAILABLE`), with no raw child output. The Management OpenAPI remained byte-identical. This removes the control-plane hazard; **causality of the prior `d5122ba` failure is unproven**.

The first disposable Crypto/Weather PAUSED regression failed during Management Project lookup while the fresh native GTK/WebKit build was consuming resources; its transport error does not prove a research-runtime failure. After the build completed, the same disposable PAUSED/NOT_READY regression passed: both Domains PAUSED, NOT_READY inspectable, only 11 fake `GET /api/tags` requests, exact-child stop/lease release, and cleanup of generated `morgoth_test` schemas.

The **one authorized basic START control** on this new pin stopped at the real profile gate: `claude=UNAVAILABLE`, `codex=BLOCKED`; no successful START, objective seed, work cycle, or Claude prompt occurred. The standalone non-inference `claude --version` check passed, but that does not override the backend's profile verdict. Per the qualification gate, the new real Claude-finalization attempt was **not run**. No retry of the basic control was made. Classification: `BLOCKED_CLAUDE_READINESS`; the later work-cycle gate remains untested, and Claude synthesis/thesis remain unqualified.

### 2026-10-08: native Claude context and one gated finalization attempt

The installed `claude` resolves from `/home/corio/.npm-global/bin` to a native ELF executable. Native operator `claude --version` and the exact old sanitized research-child environment (`HOME` plus `PATH=<claude_dir>:/usr/bin:/bin`, `LANG=C.UTF-8`) both exited 0; Node was already discoverable from `/usr/bin` and its NVM directory was **not** needed. The prior disposable PAUSED harness instead launched Rust with `PATH=/usr/bin:/bin` and a temporary HOME. Rust therefore discovered no Claude directory, explaining **that harness's** `UNAVAILABLE` verdict. The separate prior basic-START gate used a native parent PATH containing Claude, so the precise cause of **that** `UNAVAILABLE` verdict is still unproven; neither verdict establishes an authentication or quota failure. Native startup now derives a validated, deduplicated provider PATH from the trusted parent executable chain, adding a separately discovered Node directory only for an `env node` wrapper. Rust runs a bounded, non-inference `claude --version` with that exact child PATH/HOME/LANG before exposing Claude to its research child. Probe failure leaves Ollama-only engine startup available. No parent PATH, API key, SSH agent setting or WebView-supplied path is inherited wholesale.

For a bounded real readiness check, `real_research_paused_smoke.py --claude-ready` supplies only the operator Claude executable directory and HOME to its **native** Rust parent. A disposable actual Crypto engine reached PAUSED; authenticated `/profiles` reported `claude=READY`, `codex=BLOCKED`, with fake Ollama traffic limited to `/api/tags`. This readiness checks executable/version and local model presence, **not** Claude authentication, quota or inference. The existing Crypto/Weather PAUSED and NOT_READY regression initially exposed a separate Rust race: a sleeping monitor from a stopped run could mark a new generation FAILED. A per-run generation guard now prevents that stale monitor from mutating its successor; the unchanged Crypto/Weather/NOT_READY assertions passed afterward.

The **one** subsequent basic START control passed with objective `049ed1e7-8a3c-40b8-b5de-f7a34f971632`: one durable payload, one successful MET result, one Ollama work iteration and exact-child stop. The **one** new finalization attempt used objective `e11e8e7e-fa8e-4103-84cb-d90b6b064c29`, real Ollama, `fallback=false`, MAX_CYCLES=3, and a disposable `morgoth_test` Project. Cycle 1 persisted successful MET; cycle 2 persisted successful NWS observation. At cycle 3 the objective became `done` with two counted sources, while the first bounded snapshot still showed zero Claude `llm_calls`. The harness then panicked on its premature `done && cycle_count >= 3 && no llm_calls` assertion. Backend forced finalization writes `done` **before** awaiting synthesis, so that snapshot is an intermediate state and does not prove a Claude failure. The harness now waits for the bounded finalization outcome, but this attempt was **not retried**. No successful Claude synthesis/thesis, thesis persistence, numeric candidate gate, or explicit abstention was observed. Rust's outer cleanup stopped owned children, the private database was removed, and no matching child remained. Qualification remains **BLOCKED: finalization evidence window**; the cause of the earlier `d5122ba` failure remains unproven.

| Capability on this branch | Evidence |
|---|---|
| Management child and Crypto/Weather PAUSED | Real disposable PASS |
| Native Claude version context; backend Claude READY | Real disposable PASS |
| Codex BLOCKED | Real profile catalog PASS |
| Basic autonomous START, Ollama, MET, durable payload | One real bounded PASS |
| MET + NWS successful payloads | One real finalization attempt PASS |
| Claude synthesis/thesis inference or valid abstention | **NOT PROVEN**; harness stopped early |
| Numeric fidelity live candidate, sustained autonomy, production readiness | **NOT PROVEN** |

| Capability on `6a0dc9d` | Evidence |
|---|---|
| Management, Crypto/Weather PAUSED, NOT_READY, leases | Real disposable PASS |
| Cheap liveness independent of slow status | Synthetic Rust PASS |
| Codex BLOCKED | Real profile catalog PASS |
| Claude READY | NO: real catalog UNAVAILABLE |
| Autonomous START, Ollama work payload, MET/NWS | Not attempted on this pin |
| Claude synthesis/thesis, fidelity, abstention | Not attempted |
| Production readiness | NO |

### 2026-10-08: finalization watchdog aligned; one new attempt blocked before source evidence

At pinned backend `6a0dc9d`, `ClaudeCliProvider.complete` calls `_claude_cli_call`, whose subprocess timeout is `CLAUDE_CLI_TIMEOUT_SECS = REFLECT_LLM_TIMEOUT_SECONDS` (default 600 seconds). `log_call` awaits the provider before inserting an `llm_calls` success or error row. Thus `status=done`, zero synthesis evidence, zero `llm_calls`, a live autonomous task and RUNNING liveness may legitimately coexist during a Claude call. An empty row set means **no completed provider call yet**, not proof that no call is running.

The smoke now uses a version-pinned 600+30-second budget for SYNTHESIS_WAIT and a fresh 600+30 seconds for THESIS_WAIT after a successful completed synthesis row **and** stored synthesis evidence. A provider error or fallback fails immediately. The overall Rust cap is 1800 seconds; the Python wrapper has a 1950-second emergency cap. Pure tests advance synthetic `Instant`s without sleeping or prompting Claude, including acceptance at 50/629 seconds, expiry after 630 seconds, independent thesis time, late completion, provider error and fallback. The earlier basic START control was not repeated.

The **one** newly authorized finalization attempt used objective `24be279e-f046-47fa-9bae-97d5e660ee4c` in a disposable Weather Project and `morgoth_test`. Claude was READY and explicitly selected; Codex was BLOCKED; fallback was disabled. The engine was RUNNING with healthy liveness, but cycle 1 and cycle 2 produced no durable `cycle_payload` or counted source. Cycle 3 forced `done` with **zero** payloads and **zero** MET/NWS measurement sources. The harness failed immediately on its required source-evidence gate before any completed Claude `llm_calls` row appeared. Before stopping, it captured diagnostic=None, child alive, RUNNING liveness, Management READY, lease held, fallback=0 and the zero-source snapshot. Its outer cleanup stopped owned children; no matching child or temporary database remained. This is **BLOCKED_BASE_RUNTIME / missing source evidence**, not a Claude timeout or qualification. No retry was made. After the attempt, only the pure watchdog's late-completion boundary was tightened and retested without inference; the live result did not exercise that boundary. Claude synthesis/thesis, thesis-or-abstention, and live numeric fidelity remain **NOT PROVEN**. Earlier `d512`, `6a0`, `393c` and `e11e` blocked evidence above remains unchanged.

| Capability in the new one-shot | Result |
|---|---|
| Management, PAUSED, Claude READY, Codex BLOCKED, explicit START | Real PASS |
| Autonomous work payload; MET/NWS successful sources | **0 payloads; 0 sources** |
| Claude synthesis/thesis completed rows | **0 observed**; no inference claim |
| Thesis/abstention; numeric candidate gate | **NOT EXERCISED** |
| Fallback | 0 |
| Exact owned-process cleanup; disposable state | PASS |
| Overall qualification | **BLOCKED_BASE_RUNTIME**; no retry |

The WSLg Linux window was launched again on 2026-10-08 with a disposable Weather Project and fake `/api/tags` Ollama, with no research START. AT-SPI showed `Desktop probe desktop_probe · weather`; selecting that ordinary Project button revealed `Moteur de recherche` and `Initialiser le moteur`. The loaded Project catalog and Rust-owned Management child establish management connectivity. No native initialize/START click was made. The bounded harness reaped its window and child.

On 2026-10-06, the contract check, 15 frontend tests, TypeScript/Vite build, 16 Rust unit tests, 8 Rust transport tests, strict Clippy, and native Linux build passed. The existing Management smoke and missing-research-config smoke passed separately. The real-backend smoke passed for Crypto PAUSED, Weather PAUSED, lease conflict/reacquisition, and missing-model NOT_READY; it recorded 11 `GET /api/tags` requests and no other fake-Ollama path. In this disposable environment, the backend reported `legacy=BLOCKED`, `claude=UNAVAILABLE`, and `codex=BLOCKED`. The native WSLg window and normal Project selection were observed through AT-SPI; no native initialize/START click was performed.

For an interactive development window, create a private disposable home with `demo_home=$(mktemp -d); chmod 700 "$demo_home"`, then set native startup settings `MORGOTH_DESKTOP_BACKEND_ROOT` to the absolute pinned backend worktree, `MORGOTH_DESKTOP_PYTHON` to its absolute virtual-environment Python executable, and `MORGOTH_DESKTOP_HOME="$demo_home"` before `npm run tauri -- dev`. The desktop starts the API itself; it ignores the old `MORGOTH_DESKTOP_MANAGEMENT_PORT` and `MORGOTH_DESKTOP_MANAGEMENT_TOKEN_FILE` settings. Do not point this development flow at the historical production home. The Python checkout locator is a development-only input, to be replaced by a packaged sidecar later.

## Authority and UI behavior

The Rust client accepts no URL from React. It builds only `http://127.0.0.1:<validated-port>/management/v1` and fixed route paths; Project IDs are conservatively validated before interpolation. Redirects and proxies are disabled, request/connect timeouts and response size are bounded, and POST is never retried. A lost create response is **uncertain**: refresh the catalog before another attempt. Native errors contain stable codes/status only, never raw bodies or token material. Rust creates a fresh URL-safe 384-bit token in an exclusive 0700 directory under the explicitly selected 0700 home and an exclusive 0600 file; it passes only that file's path to Python, then unlinks the file after authenticated readiness. The process and token stay Rust-only. Multiple desktop instances own independent children, ports and tokens; ProjectManager's existing lock serializes same-home creation.

Each launcher accepts a port rather than an inherited bound socket. Rust checks initial availability, verifies the listener belongs to the exact child PID before sending authority, and checks liveness around authenticated readiness. A narrow bind/child-exit race remains; loopback alone is not cryptographic server identity. Linux `PR_SET_PDEATHSIG` requests child termination on parent death, without a crash-perfect claim. Normal exit reaps only owned children. Management's ephemeral token is removed after readiness; the research Project token is backend-owned and persists across restarts.

Tauri builds a single `main` window from local content. The capability lists only thirteen fixed command permissions; remote navigation and new windows are denied. No shell, filesystem or HTTP plugin is exposed to the WebView. The backend enforces Host/Origin/Project-token policy; the desktop does not weaken it. See the [Tauri capability model](https://v2.tauri.app/security/capabilities/) and [CSP guidance](https://v2.tauri.app/security/csp/).

The French screen loads Domains/Projects from the API and separates configuration validity from research readiness. The selected managed Project can initialize its engine, inspect profile readiness, explicitly select a READY profile, then explicitly start research. Codex remains BLOCKED. Selecting another Project does not rebind or stop the current engine. The historical default Project cannot be supervised. Stopping terminates the exact research child; there is no pause-after-start operation. A research failure leaves Management available.

## Native research development configuration and limits

The Rust process accepts `MORGOTH_DESKTOP_BACKEND_ROOT`, `MORGOTH_DESKTOP_PYTHON`, and `MORGOTH_DESKTOP_HOME` at startup. Research initialization additionally requires native-only `MORGOTH_DESKTOP_RESEARCH_POSTGRES_URL`, `MORGOTH_DESKTOP_RESEARCH_OLLAMA_BASE_URL`, `MORGOTH_DESKTOP_RESEARCH_OLLAMA_PRIMARY_MODEL`, `MORGOTH_DESKTOP_RESEARCH_OLLAMA_AGENT_MODEL`, `MORGOTH_DESKTOP_RESEARCH_MAX_CONCURRENT_AGENTS`, `MORGOTH_DESKTOP_RESEARCH_LOG_RETENTION_DAYS`, and `MORGOTH_DESKTOP_RESEARCH_LOG_LEVEL_THOUGHT`. No value is accepted from React. Rust generates a fresh process-local `SECRET_KEY`; the child receives an explicit environment, not inherited production `.env`, task overrides or unrelated API keys. Rust locates the existing Claude executable and supplies the native user-home context without reading or copying its credentials. Claude READY is a non-inference precondition check, not proof of login/quota. Codex cannot run while the backend qualification lock is set.

The research child starts PAUSED or NOT_READY. Backend `6a0dc9d` uses structural rail checks and a bounded local Ollama `/api/tags` preflight for Desktop PAUSED, and initializes its own objective storage; it does not run research tools, warmup chat or recurring research merely on initialization. The Rust client reads `<Project.runtime_dir>/auth/ui_token` only after confirming listener ownership, and never returns the token/path to JS. The future Desktop installer must replace the Python-checkout locator. Management auto-start remains independent. Chat/events, multiple simultaneous engines, installers and Windows/macOS qualification are deferred.

The unchanged Next.js checkout passes `tsc --noEmit --incremental false` with `desktop/` excluded from its broad TypeScript glob. Its `next build` could not complete on this host because the pre-existing `app/layout.tsx` uses `next/font/google` for Inter and JetBrains Mono and both font downloads timed out, including outside the network sandbox. No web page or font configuration was changed.

Chat/events, other Next.js pages, installers, updates, Windows/macOS security qualification and production packaging are deferred. The existing Next.js app excludes `desktop/` from its TypeScript glob; its pages and server token proxy are unchanged.
