## 2026-10-29 — Desktop D13 Windows test application connector

An isolated Tauri branch adds a Windows companion and a dedicated WinForms test
application, compiled with installed Windows/.NET UI Automation components.
The fixed WSL stdio protocol binds build artifacts, process, window and session
identity, exposes only two known controls, and permits one reversible
`InvokePattern` toggle after separate native approval. Direct Windows-host
qualification observed discovery, UIA inspection and state readback; final
sealed Desktop acceptance is reported separately after build. The D12 MCP
fixture remains available. See `docs/DESKTOP-D13-WINDOWS-COMPANION.md`.
No personal Windows application, browser, backend agent or model is connected.

## 2026-10-26 — Desktop D7 personal Project onboarding

Branch `feat/morgoth-desktop-d7-personal-onboarding-v1` adds one explicit,
authenticated native Project-creation command, installed-Domain selection,
first-run guidance, fixed private Markdown note export, and one-command Linux/WSL launch with explicit persistent
Management home or disposable preview. D4/D5 local stores and D6 vault reads
are unchanged. Native Project creation and reopened local records were tested
against disposable directories; full text entry in WebKitGTK awaits manual
acceptance. No backend change, inference, engine initialization or new
dependency. See `docs/DESKTOP-D7-PERSONAL-WORKSPACE.md`.

## 2026-10-26 — Desktop D6 managed Project knowledge reader

Branch `feat/morgoth-desktop-d6-knowledge-v1` connects the D5.1 Knowledge
workspace to a token-protected, read-only projection of actual Markdown files
from one canonical managed Project vault. Personal notes stay separate and
editable. Fixed native IPC, Project-scoped search, exact detail, explicit
Wikilinks and bounded graph add no inference or backend write authority.
The backend pairing is explicitly pinned to
`3f18a375453af0c8efe2586440b3e8612707c6f2`; historical D2 mission
records remain disposable. See `docs/DESKTOP-D6-KNOWLEDGE.md` for verification
and limits. No dependency was added.

## 2026-10-25 — Desktop D5 functional personal workspace candidate

Branch `feat/morgoth-desktop-d5-production-workspace-v1` derives from exact D4 commit
`4a3474312724f2028d61b88f3d02188dbef66d37`. It implements five primary
areas, a local command palette, Project-scoped human Markdown notes, internal
links/backlinks and a graph generated from stored relationships. Existing D4
mission briefs and D2/D3 read-only observability retain their native contracts;
notes use a separate bounded application-local Rust store and five fixed IPC
commands. No inference, backend mutation, autonomous execution or dependency
was added. See `docs/DESKTOP-D5-WORKSPACE.md` and
`docs/DESKTOP-D5-ACCEPTANCE.md` for exact verification and remaining limits.
The disposable WSLg Tauri fixture opened two windows and verified Project
selection and historical-record isolation after restart. Native text entry
remains unverified through AT-SPI; implemented React screenshots use clearly
synthetic read-only data and are not native-window screenshots.

## 2026-10-25 — Desktop D4 Mission Workspace

Branch `feat/morgoth-desktop-d4-mission-workspace-v1` adds fixed native local-draft
IPC, Project preference, a distinct editable local brief area and historical
checkpoint panel. The original D3 branch is unchanged. Frontend checks and
26 Rust tests passed; the actual WSLg window verified navigation, Project
isolation and preference restoration. AT-SPI text entry did not verify native
draft create/edit; this visual acceptance remains pending. No new backend
endpoint, model inference or workload authority was added. The existing
`uuid` crate is now a direct Rust dependency for draft IDs. See
`docs/DESKTOP-D4-MISSION-WORKSPACE.md` and `docs/DESKTOP-D4-ACCEPTANCE.md`.

## 2026-10-21 — Desktop D3 native acceptance and local model observation candidate

The D2 connected WSLg window was exercised through native AT-SPI controls:
six workspaces rendered, disposable Project A mission/capability records were
visible, and Project B remained empty without inherited detail. D3 adds one
manual, argument-free Tauri read command for fixed loopback Ollama `/api/tags`
and `/api/ps`, plus bounded Linux procfs/cgroup measurements. The Models view
distinguishes installed, resident, configured and unqualified states. There is
no inference, model loading, polling, backend change or new dependency. The
D2 backend SHA, optional `morgoth_test` Project reads and protected Desktop
reference remain unchanged. See `docs/DESKTOP-D3-*.md` for verification and
remaining hardware/OS limits.

## 2026-10-21 — Desktop D2 Project-scoped read candidate

A separate D2 worktree adds authenticated native mission and capability reads
from the opt-in disposable `morgoth_test` backend contract. Project paths and
schema names are removed before WebView IPC. Historical checkpoints, fixture
validation and approval limits are labeled explicitly; no execution command
or dependency is added. The D1 pin and protected Desktop reference remain
unchanged. See `docs/DESKTOP-D2-*.md` for exact evidence and limitations.

# PROGRESS.md — Morgoth UI Development Tracker

## 2026-10-27 — Desktop D9 Structured Memory Explorer candidate

The isolated D9 Desktop branch adds a third, read-only Knowledge source for
recorded Project theses and contradictions. Four fixed native IPC reads use an
authenticated Management contract pinned to a separate D9 backend read branch.
The optional PostgreSQL authority requires an operator-owned private config,
a Project-specific read-only role and an already initialized schema; no source
is inferred from Project creation. Personal notes, vault documents, mission
drafts and the D8 backup format remain separate. See
`docs/DESKTOP-D9-STRUCTURED-MEMORY.md` for provenance and acceptance limits.
No runtime dependency, inference or execution permission was added.

## 2026-10-26 — Desktop D8 Project workspace portability

Branch `feat/morgoth-desktop-d8-workspace-backup-v1` adds a bounded, versioned
JSON export of human local notes and mission briefs, with SHA-256 integrity,
native GTK file selection and explicit same-Project empty-target restoration.
The original D4/D5 stores and Tauri application identity remain in place.
An interruption journal supports explicit resumption from the identical
validated archive without replacing existing records. Management Project
verification remains mandatory; backend vault knowledge, agent memory and
secrets are excluded. See `docs/DESKTOP-D8-WORKSPACE-PORTABILITY.md` for the
format, recovery behavior, launch commands and acceptance limits. New direct
Rust dependencies: `sha2` and Linux GTK (already present transitively in the
Tauri lockfile). No backend change or inference.

## 2026-10-21 — Desktop D1 command center candidate (feature branch)

The native Tauri/Vite Desktop now has six read-only supervision views: Overview,
Missions, Capabilities, Models, Security and Projects. The fixed native
transport and Tauri main-window capability were narrowed from thirteen to
eight read commands; Project creation and research mutation IPC commands are
no longer registered in the D1 window. Management Project configuration and
one research supervisor/profile are the only live data sources. Generalist
mission records, capability inventory, approval queues, Ollama residency and
resource metrics are explicitly unavailable until authenticated Project-scoped
read contracts exist. No backend, protected governance, production service or
Desktop reference worktree was changed. No dependency was added. Audit, field
matrix and exact acceptance evidence are in `docs/DESKTOP-D1-*.md`.

## 2026-10-09 — Integrated Codex confinement, workload gate still blocked

Desktop pins backend `7bff6c92ffe958cb11411a1f23fa6f917cf0fe32`.
The Management OpenAPI is byte-identical. The strict Rust/TypeScript profile
contract distinguishes installed, authenticated, sandbox available,
sandbox qualified and workloads ready. Integrated Bubblewrap host tests
passed, but the one authorized model-authority canary returned a safe
`cli_diagnostic`. No text probe or Weather run followed. Codex remains
BLOCKED with `SAFE_FOR_WORKLOADS=False`; Management remains independent.
See `desktop/README.md` for the exact proof boundary and security limits.

## 2026-10-09 — Codex-only Desktop provider target

The Desktop pins backend `b51aee7361075e1d206f9615c5b24ec772376a14`.
Management OpenAPI remains byte-identical. Native research startup discovers
Codex/Node only; no Claude executable or readiness probe is required. The
Projects screen displays the backend Codex BLOCKED verdict and permits START
only for a READY selected Codex profile. Backend SAFE_FOR_WORKLOADS remains
False pending integrated whole-process confinement and event/text canaries.
No Codex inference, Weather finalization, production state or provider key
was used in this pivot.

## 2026-10-09 — Claude update command succeeded; active CLI incompatible

The sole authorized `claude update` exited 0, but the active executable's
version, resolved path and SHA-256 remained unchanged at Claude Code 2.1.138.
Authentication stayed `claude.ai`; `--safe-mode` is absent from installed help.
The version/flag gate classified **BLOCKED_CLAUDE_UPDATE_INCOMPATIBLE** before
any model call. No Weather, research START, backend edit, reinstall, login or
WebView change occurred. The UI branch contains only a bounded requalification
harness, no-inference tests and append-only evidence; historical attempts
remain in `desktop/README.md`.

## 2026-10-09 — Claude auth valid; installed safe-mode flag mismatch

One gated diagnostic confirmed Claude Code 2.1.138 is logged in via `claude.ai`.
The bounded read-only doctor check timed out with no private output disclosed.
The sole safe-mode model call exited 1 with fixed class
`CLAUDE_DIAG_ARGUMENT_REJECTED`; non-inference CLI help did not list
`--safe-mode`. **CLAUDE_CUSTOMIZATION_CAUSE_NOT_PROVEN**. No retry, Weather,
research START, backend change, or new WebView authority. The next step is a
separate review of installed CLI support before any provider change. See
`desktop/README.md` for historical attempts and bounded evidence.

## 2026-10-09 — Claude operator-environment differential blocked

The one authorized operator-environment `_claude_cli_call` returned
`CLAUDE_CLI_EXIT_NONZERO`, return code 1, fixed private diagnostic
`CLAUDE_DIAG_UNKNOWN_NONZERO` after 7601 ms. All 13 requested environment
names were absent. **ENV_CLEAR_CAUSE_NOT_PROVEN**; no minimal-env second probe,
Rust pass-through, Weather run or backend change. The new bounded diagnostic
script and no-inference canary tests reveal no provider output. Frontend
contract/15 tests/build, Rust fmt/32 tests/Clippy/native build, Management and
research failure-containment smokes passed. See `desktop/README.md` for the
separate historical attempts and exact gate.

## 2026-10-09 — Safe Claude provider code; isolated gate blocked

Both supervisors pin clean backend `9b982540e4bb53a2b5045d22dc67eee525a557eb`;
Management OpenAPI is unchanged. Bounded finalization evidence now includes
`llm_calls.error_code` and latency, with fixed Rust failure diagnostics and no
WebView authority change. Native CLI version/help checks passed. The **one**
isolated `_claude_cli_call` returned `CLAUDE_CLI_EXIT_NONZERO` after 19,265 ms.
No Weather qualification ran and no retry occurred. Previous generic synthesis
failure remains unclassified. Frontend 15 tests, Rust 19+5+8 tests, strict Clippy,
native build, Management/synthetic research and real PAUSED/NOT_READY passed;
see `desktop/README.md` for separate proof boundaries. No dependency added.

## 2026-10-09 — Durable cycle diagnostics; one synthesis-provider block

Both native supervisors now pin clean backend `3d60e14`; regenerated
Management OpenAPI is byte-identical. The disposable finalization helper
exposes only bounded cycle/stage/exception-class ledger metadata; the Rust
one-shot smoke stops on its first row. No WebView command was added. Frontend,
Rust, native build, Management/synthetic research and real PAUSED readiness
checks passed. In the **one** real Weather attempt, objective
`ddd7f871-cc47-47d4-a8db-65dc79c106b3` committed two payloads with both
MET and NWS successful, then a completed Claude synthesis `llm_calls` row
reported `error:ReflectLLMError` and 0 response bytes. There were no cycle
failure rows, thesis calls, or fallback events. The harness stopped and
cleaned its owned disposable processes/database. Classification:
**BLOCKED_SYNTHESIS_PROVIDER**; provider cause unproven and no retry made.
Previous blocked attempts remain documented in `desktop/README.md`.

## 2026-10-08 — Stage-aligned Claude window; one-shot blocked before sources

Pinned backend `6a0dc9d` was not changed. Its Claude subprocess timeout is
600 seconds per call and `llm_calls` records completion/error only. The Rust
finalization smoke now gives synthesis and thesis separate 630-second windows,
an 1800-second global cap, and a 1950-second Python emergency cap. Pure
no-inference tests cover intermediate `done`, stage reset, timeouts, provider
errors and fallback. Frontend, Rust, Clippy, native build and synthetic
supervisor checks passed; the previously proven basic START was not repeated.
The single new real attempt, objective `24be279e-f046-47fa-9bae-97d5e660ee4c`,
reached forced `done` at cycle 3 with zero durable payloads and zero counted
measurement sources. The harness captured healthy RUNNING liveness, no
completed Claude call, no fallback, and Management READY before stopping its
owned child. No matching child or temporary database remained. Classification:
**BLOCKED_BASE_RUNTIME / missing source evidence**. Claude synthesis, thesis,
abstention and live numeric fidelity remain unqualified; no retry was made.

## 2026-10-08 — Native Claude context; finalization remains unqualified

The disposable PAUSED smoke previously removed the Claude directory from its
native parent PATH, so Rust could not discover Claude in that smoke. The
separate prior basic-START `UNAVAILABLE` verdict used a different native PATH;
its exact cause remains unproven. The installed Claude
is a native executable; its `--version` succeeds under the old sanitized
research-child PATH. Rust now derives a minimal provider runtime from native
executable metadata, probes it without inference, and leaves general engine
startup possible when Claude is absent. Real disposable Crypto PAUSED reported
Claude READY and Codex BLOCKED. One basic Weather START yielded one durable
MET payload and clean stop. The only new Claude-finalization attempt produced
successful MET and NWS payloads, then the harness asserted at the intermediate
forced `done` state before Claude calls were observed. This is **not** evidence
of successful or failed Claude inference; the attempt was not retried. The
harness now waits for a bounded finalization outcome. A separate stale Rust
monitor generation race found by the PAUSED regression was fixed; Crypto,
Weather and NOT_READY then passed. Backend pin and product API unchanged; no
dependency or WebView command added.

## 2026-10-08 — Cheap runtime monitor; live qualification gated

Pinned both Rust supervisors to backend `6a0dc9d` after byte-identical
Management OpenAPI comparison. The Rust monitor uses strict `/liveness`
responses, preserves cached profile readiness, and emits stable task/transport
failure codes. A synthetic slow-status regression passed. Frontend, Rust,
Clippy and native Linux build passed. Disposable Crypto/Weather PAUSED and
NOT_READY passed after the build completed. The single authorized basic START
control stopped before START because the real profile catalog reported
Claude UNAVAILABLE (Codex BLOCKED). No objective was seeded and no new Claude
finalization attempt ran; prior d512 causality remains unproven. No dependency,
WebView command or backend-main change.

## 2026-10-08 — Claude finalization qualification attempted; BLOCKED

Pinned the two Rust supervisors to clean backend `7d811633`; regenerated
Management OpenAPI stayed byte-identical. Added strict native-only objective
cycle/fallback overrides and a bounded read-only evidence helper plus a
single-attempt real Claude finalization smoke. Frontend, Rust tests, Clippy,
native Linux build, Management and Crypto/Weather PAUSED/NOT_READY proofs passed.
The one-shot real Weather run selected a READY Claude profile, started the
autonomous task and persisted one work `cycle_payload` with one counted source.
The research supervisor then entered FAILED before the second payload or any
Claude synthesis/thesis call. The disposable child and `morgoth_test` state
were cleaned; no retry was made. The prior one-cycle START regression also did
not pass on this pin (one pre-START HTTP 409; one five-minute payload timeout).
Finalization and production readiness remain unqualified. The backend, mains,
production checkouts and UI authority boundary were not changed; no dependency
was added. Next: capture the supervisor's bounded diagnostic in a separately
authorized diagnostic run before another real qualification attempt.

## 2026-10-08 — Self-bootstrapping real Desktop START requalification

The UI Desktop supervisors now pin clean backend `39632779`. Regenerated
Management OpenAPI is byte-identical to the pinned artifact. The one-objective
helper no longer imports or invokes `scripts.init_db`: the actual research
engine provisions its managed Project schema before PAUSED. A disposable
Weather Rust→Python→PostgreSQL→Ollama→MET run produced one cycle payload for
objective `56774674-d328-434c-b2ad-cc477a1198ca`, then stopped and reaped
the exact child with `cycle_count=1`; no Claude prompt was sent. Crypto/Weather
PAUSED and missing-model NOT_READY, Management/synthetic supervisor, native
WSLg window, frontend, Rust and Linux native build regressions passed. No
backend, production checkout or main-branch change.

## 2026-10-06 — Real supervised Desktop PAUSED integration (feature branch)

Pinned both Rust supervisors to clean backend `1afa971`; the actual Management
OpenAPI regeneration and both committed artifacts have the same SHA-256.
Added a bounded disposable `morgoth_test` + fake-Ollama smoke in which the
actual Rust ResearchEngineSupervisor launches the actual Crypto and Weather
Python research engines sequentially into authenticated PAUSED, without START
or inference. A duplicate actual launcher is rejected by the Project lease;
stop/reap releases it and a later Rust launch reacquires it. Real profile
responses show Codex BLOCKED; a missing local model yields inspectable
NOT_READY while Management remains alive. The synthetic START proof remains
separate. No backend, production Project, service, profile, or database was
changed; no new dependency was added. Autonomous research, provider inference,
packaging and cross-platform qualification remain deferred.
The Linux WSLg native window also opened with a disposable Project created
through the real Management API; its accessibility tree showed Crypto/Weather
Domains and the Project. Selecting that Project exposed the real research
initialization control, without pressing it. Native PAUSED click-through was
not claimed; Rust-owned real-process PAUSED is the authoritative proof.

## 2026-10-05 — One managed-Project research supervisor (feature branch)

Pinned both native supervisors to backend `3da091c`; the Management OpenAPI
artifact is byte-identical to the earlier `3b84197` artifact. Added a
Rust-owned, single-child ResearchEngineSupervisor with exact listener/PID and
Project-token checks, explicit minimal child environment, PAUSED/NOT_READY/
RUNNING status, fixed authenticated runtime calls, and exact-child stop/reap.
React now exposes explicit initialize, qualified-profile select, start and stop
controls while leaving Project selection and Management independent. Codex stays
BLOCKED; no profile or autonomous research starts automatically. Frontend tests,
Rust tests including a synthetic owned-child lifecycle, Clippy, native Linux
build, real disposable Management smoke and research failure-containment smoke
pass. A WSLg window opens; direct native
research button interaction and live Brain startup remain unproven. No backend,
production Project, service or database was changed.

## 2026-10-05 — Native Management API supervision (feature branch)

The Linux desktop now starts one pinned, clean Management API checkout as a
Rust-owned child in an explicitly private disposable application home. Rust
creates and removes its own short-lived token file, validates the owned loopback
listener and API version, exposes only a bounded status to React, and reaps the
exact child on normal exit. A native WSLg window reached connected state without
a manually started API or supplied token; a bad-backend window stayed open and
showed unavailable. The supervisor-owned real-process smoke created and
validated two isolated Projects. A second simultaneous desktop supervisor used
its own child/catalog; a stalled synthetic child timed out and was reaped.
React form entry remains unproven under WSLg input automation. Multiple
instances use separate children and authority;
research-engine supervision, packaging and Windows/macOS remain deferred.

## 2026-10-04 — Native desktop qualification (feature branch)

The missing Tauri context icon is now a PNG converted locally from the tracked
favicon; the unused `Manager` import is removed. Linux x86-64 native build,
frontend contract/tests/assets, Rust tests, formatting and Clippy pass under
WSL2. The WSLg window opened against a disposable API and displayed connected
management, the legacy Project and installed Domain choices. Automated form
entry is still unproven because XWayland synthetic keyboard focus stayed `None`
and WebKit's AT-SPI entries lacked `EditableText`; the separate real Rust client
smoke did create and validate disposable Projects. No dependencies, backend,
production checkout, service or WSL configuration were changed.

## 2026-10-04 — Desktop Project configuration slice (feature branch)

Added an independent Tauri 2 + React/Vite `desktop/` package on `desktop-projects-v1`.
Pinned the backend Management API V1 OpenAPI artifact at `3b84197`, generated
TypeScript types, and checked Rust transport DTOs/operations against it.
Six window-scoped native commands connect to the existing ProjectManager through
authenticated loopback HTTP; React manages list/show/validate/create with
explicit disconnected, conflict, uncertain and durability states. Synthetic
Rust-to-real-API smoke created two same-Domain Projects in a disposable catalog
and the canonical Python loader accepted them. Native compilation was then
blocked by missing GLib/GTK/WebKit development libraries on this WSL host;
the unchanged Next.js app typechecks, while its production build is blocked by
timed-out Google Fonts downloads from its existing `app/layout.tsx`.
No installer, engine supervision or production deployment was attempted.

## 2026-09-30 — Tool rail endpoint DTOs

Mirrored the backend `/api/tools` active-tool and `/api/tools/catalog` installed-tool
response shapes in `types/morgoth.ts`; no UI behavior or API calls changed.


## 2026-09-29 — Project runtime contract mirror

Added immutable ProjectConfig and Project types in types/morgoth.ts to mirror the
backend model: identity, Domain reference, paths/namespaces, optional LLM routes and
metadata. No new endpoint or UI flow. TypeScript check (`tsc --noEmit --incremental
false`) passed. No new dependencies. Future desktop is a client/process supervisor;
Python remains the engine and desktop does not require a Next.js server.


## Current Status
**Phase**: 3 — Intelligence Expansion UI  
**Overall**: Phase 2b refactor complete; Phase 3 War Room integration complete for Steps 7-8  
**Last updated**: 2026-04-25 by Codex — TypeScript check passed after Phase 3 War Room updates  
**Next action**: Human review Phase 3 War Room integration

## Phase 2b — UI Refactor (Consciousness Viewer)

### Step Status
| Step | Status | Notes |
|---|---|---|
| 1. Backend new endpoints | ✅ Done | Backend support added in `morgoth/` and tracked in the root/backend progress files |
| 2. New types | ✅ Done | Added consciousness, mind, and evolution contracts to `types/morgoth.ts` |
| 3. New stores | ✅ Done | Added `consciousness.store.ts` and `mind.store.ts` |
| 4. New hooks | ✅ Done | Added objectives and self-modification hooks and routed live thought events into the consciousness store |
| 5. New components | ✅ Done | Added the full consciousness, mind, evolution, and war room component sets |
| 6. New pages | ✅ Done | Replaced `/` and added `/mind`, `/evolution`, `/warroom` |
| 7. Cleanup | ✅ Done | Removed market UI files, updated sidebar labels/routes, and switched provider bootstrap hooks |
| 8. Verify | ✅ Done | `node_modules/.bin/tsc --noEmit` passed; `/`, `/mind`, `/evolution`, `/warroom`, `/chat`, and `/admin` all returned `200` from `next dev` |

## Phase 3 — Frontend (morgoth_ui/)

### Foundation
| File | Status | Notes |
|---|---|---|
| `tailwind.config.ts` | ✅ Done | Added dark-only design tokens, fonts, glow, and layout primitives from spec section 3 |
| `types/morgoth.ts` | ✅ Done | Extended with Phase 2b contracts and Phase 3 agent/tool DTOs |
| `lib/ws-client.ts` | ✅ Done | Built singleton WS client with reconnect backoff and status listeners |
| `lib/api.ts` | ✅ Done | Added typed REST wrapper with shared request/error handling |
| `lib/store/brain.store.ts` | ✅ Done | Added Zustand brain state for status, logs, tasks, mods, and connection |
| `lib/store/market.store.ts` | ✅ Done | Added market price, history, stats, and watchlist Zustand state |
| `lib/store/consciousness.store.ts` | ✅ Done | Added thought clusters, concept graph, live thoughts, and selected topic state |
| `lib/store/mind.store.ts` | ✅ Done | Added objectives and knowledge domain state for the Mind page |
| `lib/store/agents.store.ts` | ✅ Done | Added agents registry state with update and selection helpers |
| `lib/store/chat.store.ts` | ✅ Done | Added chat history and thinking state store |
| `lib/utils/format.ts` | ✅ Done | Added shared number, change, uptime, and timestamp formatters |
| `lib/utils/colors.ts` | ✅ Done | Added log-level and market-change Tailwind color mappings |

### Hooks
| File | Status | Notes |
|---|---|---|
| `hooks/useWebSocket.ts` | ✅ Done | Routes live thoughts and Phase 3 `agent_update` events into shared stores for realtime War Room logs |
| `hooks/useMarketData.ts` | ✅ Done | Added market price, stats, and history queries synced into Zustand |
| `hooks/useBrainStatus.ts` | ✅ Done | Added status, tasks, and self-modification queries with refresh cadence |
| `hooks/useAgents.ts` | ✅ Done | Added agents CRUD query layer and store synchronization |
| `hooks/useObjectives.ts` | ✅ Done | Added objectives query and create/update mutations synced into the mind store |
| `hooks/useSelfModifications.ts` | ✅ Done | Added evolution metrics/timeline and self-modification history queries |

### Phase 3 War Room
| File | Status | Notes |
|---|---|---|
| `types/morgoth.ts` | ✅ Done | Mirrors Phase 3 agent metadata plus FRED, Reddit, and technical-analysis DTOs |
| `hooks/useWebSocket.ts` | ✅ Done | Streams `agent_update` events into logs and agent task state in real time |

### Verification
| Check | Status | Notes |
|---|---|---|
| `node_modules/.bin/tsc --noEmit` | ✅ | Passed |

### Layout
| File | Status | Notes |
|---|---|---|
| `app/layout.tsx` | ✅ Done | Replaced starter layout with dark-only app shell, fonts, and providers |
| `components/layout/TopBar.tsx` | ✅ Done | Added live status bar for model, tasks, agents, WS state, and uptime |
| `components/layout/Sidebar.tsx` | ✅ Done | Added collapsible sidebar with spec navigation and active glow state |
| `components/layout/PageWrapper.tsx` | ✅ Done | Added shared page container for dense, consistent content spacing |

### Pages & Components
| File | Status | Notes |
|---|---|---|
| `components/dashboard/*` | 🔄 Legacy | Dashboard components remain only until Step 7 cleanup finishes removing the old market/dashboard surface |
| `app/page.tsx` | 🔄 Refactor | Replaced the dashboard with the Consciousness page layout |
| `components/chat/*` | ✅ Done | Built message rendering, history window, send input, and live thought stream panel |
| `app/chat/page.tsx` | ✅ Done | Added full chat layout with history query hydration and realtime thoughts panel |
| `components/agents/*` | ✅ Done | Built agent cards, grid, create modal, and filtered log drawer |
| `app/agents/page.tsx` | ✅ Done | Added agent operations page with create, stop, log drawer, and collapsed completed list |
| `components/market/*` | ✅ Done | Built market stats bar, sortable price table, dual-axis chart, and watchlist symbol search |
| `app/market/page.tsx` | ✅ Done | Added full market view with shared range and selected-symbol state |
| `components/brain/*` | ✅ Done | Built log feed, filters, queue lanes, task cards, and self-modification history table |
| `app/brain/page.tsx` | ✅ Done | Added tabbed brain view for logs, task queue, and self-modification history |
| `components/admin/*` | ✅ Done | Built grouped permissions editor with sensitive warnings and model configuration controls |
| `app/admin/page.tsx` | ✅ Done | Added admin page composing permissions and model management sections |
| `components/consciousness/*` | ✅ Done | Added Thought Nebula, concept graph, and live thought feed components |
| `components/mind/*` | ✅ Done | Added knowledge map, objectives list/cards, and learning feed |
| `components/evolution/*` | ✅ Done | Added growth metrics, timeline, self-modification log, and capability list |
| `components/warroom/*` | ✅ Done | Added agent grid/cards, mission feed, create modal, and log drawer |
| `app/mind/page.tsx` | ✅ Done | Added the Mind page layout |
| `app/evolution/page.tsx` | ✅ Done | Added the Evolution page layout |
| `app/warroom/page.tsx` | ✅ Done | Added the War Room page layout |
| `app/market/page.tsx` | ✅ Deleted | Removed in Step 7 per the v2.0 migration guide |
| `components/market/*` | ✅ Deleted | Removed in Step 7 per the v2.0 migration guide |
| `hooks/useMarketData.ts` | ✅ Deleted | Removed with the market page |
| `lib/store/market.store.ts` | ✅ Deleted | Removed with the market page |

## Decisions Made
| Date | Decision | Reason |
|---|---|---|
| 2026-04-25 | Kept War Room agent display data-driven | New backend agents surface through `/api/agents` and WebSocket state rather than hardcoded UI lists |

## Issues & Blockers
| Issue | Status | Notes |
|---|---|---|
| Market prices endpoint returned `{"items": ToolExecutionResult[]}` while UI expected `PriceData[]` | Resolved | `lib/api.ts` now unwraps the outer `items` envelope and each nested tool result before stores/components receive normalized `PriceData[]` |
| Other REST list endpoints returned `{"items": ...}` while UI typed plain arrays | Resolved | Normalized `chat.history`, `agents.list`, `brain.logs`, `brain.tasks`, and `market.history` in `lib/api.ts` to unwrap backend envelopes before they reach hooks |
| Agent creation payload used frontend-only fields (`model`, `task_description`) | Resolved | `CreateAgentPayload` and `CreateAgentModal` now send the backend contract (`name`, `task`, `agent_type`, `tools`, optional `user_id`) |
| Chat POST response returned `BrainResponse`, not `ChatMessage`, and REST chat did not rely on WS echo | Resolved | `api.chat.send` now maps the backend response into a UI `ChatMessage`, and `ChatInput` appends that reply on mutation success |
| Brain status fields in UI did not match `/api/brain/status` | Resolved | `types/morgoth.ts`, `BrainStatusCard`, `TopBar`, and admin model display now follow the backend shape (`ready`, `primary_model`, `agent_model`, `max_concurrent_agents`) |
| UI called backend endpoints that do not exist (`/api/market/stats`, `/api/brain/self-modifications`, `/api/admin/models`) | Resolved | Market stats are now derived locally from backend price payloads, self-modifications resolve to an empty dataset until the backend implements them, and model info is derived from `/api/brain/status` |
| Admin permissions UI expected `{ permissions, metadata }`, but backend returns the full `MORGOTH_PERMS.json` document | Resolved | Permissions reads now map the backend document into UI state, and saves send the full backend patch payload `{ payload: MorgothPermissions }` |
| WebSocket client expected `market_update`, but current backend emits only `thought`, `action`, `result`, `error`, `agent_update`, and `system` | Resolved | Removed the unused `market_update` contract from the WS type union and client handler so the frontend matches the current backend event set |
| Market data hook triggered a maximum update depth loop via repeated store sync | Resolved | `hooks/useMarketData.ts` now syncs Zustand only from `pricesQuery.data` / `historyQuery.data` effects, and the derived `statsData` object is memoized so `setPrices` and `setStats` are not retriggered every render |
| Other query-to-store sync points risked unstable setter/effect dependencies | Resolved | Normalized `useAgents.ts`, `useBrainStatus.ts`, and `app/chat/page.tsx` so store writes run from data-only effects instead of depending on setter references or render-created values |
| `next build` exits with opaque webpack errors | Open | `node_modules/.bin/tsc --noEmit` passes after the integration fixes, but `npm run build` still stops at `Build failed because of webpack errors` without a surfaced module trace on this machine |
| Chat sender did not include `user_id`, causing POST contract failures when the websocket path was unavailable | Resolved | `lib/api.ts` now sends `{ content, user_id }`, and `components/chat/ChatInput.tsx` uses the websocket when connected with REST fallback only when needed |
| Agent creation did not surface the created agent reliably in the UI | Resolved | `CreateAgentModal` now supports an optional model override, `CreateAgentPayload` mirrors the backend, and `useAgents` inserts the returned agent into Zustand immediately before refetch |

## Session Log
| 2026-10-06 | Codex | Desktop one-objective qualification in isolated branch: five optional native-only runtime overrides, disposable morgoth_test Weather objective harness, actual Rust START through backend 1afa971, local Ollama cycle and successful MET tool call, durable cycle_payload, exact-child stop and cycle_count=1. Claude readiness was checked without a prompt; Codex remained blocked. Backend/UI production checkouts unchanged. `objectives` required explicit existing init_db provisioning in the disposable schema; automated Desktop research storage provisioning remains unresolved. |
| Date | Who | What was done |
|---|---|---|
| Project init | Human | Next.js initialized, SPEC_UI.md added |
| 2026-04-13 | Codex | Foundation bloc complete: design tokens, typed contracts, WS/API layer, Zustand stores, and formatting helpers built; checked against spec section 3 before moving on |
| 2026-04-13 | Codex | Hooks bloc complete: TanStack Query orchestration and WS routing built; self-checked loading/error patterns and dark-only styling assumptions before layout work |
| 2026-04-13 | Codex | Layout bloc complete: root shell, providers, sidebar, top bar, and UI primitives added; verified palette, typography roles, and dark-only navigation treatment against spec section 3 |
| 2026-04-13 | Codex | Dashboard bloc complete: overview cards and dashboard composition added; checked card chrome, mono usage for logs/prices, and alert emphasis against spec section 3 |
| 2026-04-13 | Codex | Chat bloc complete: markdown messages, code blocks, hover timestamps, ambient thought stream, and disabled send states added; corrected initial inline-style drift before moving on |
| 2026-04-13 | Codex | Agents bloc complete: creation flow, stop action, filtered log drawer, and collapsed completed list added; checked status badge mappings and card density against spec section 3 |
| 2026-04-13 | Codex | Market bloc complete: sortable table, dual-axis chart, stats bar, and symbol search added; corrected tooltip styling to stay Tailwind-only before advancing |
| 2026-04-13 | Codex | Brain bloc complete: filtered logs, exports, queue lanes, and self-modification history added; tightened auto-scroll behavior before moving into admin controls |
| 2026-04-13 | Codex | Admin bloc complete: permissions editor, sensitive-toggle confirmation, model controls, and latency test added; corrected overall tracker count to include the previously untracked `components/ui/*` deliverable from spec step 19 |
| 2026-04-13 | Codex | Verification summary: created `tailwind.config.ts`, `types/morgoth.ts`, `lib/ws-client.ts`, `lib/api.ts`, `lib/store/brain.store.ts`, `lib/store/market.store.ts`, `lib/store/agents.store.ts`, `lib/store/chat.store.ts`, `lib/utils/format.ts`, `lib/utils/colors.ts`, `lib/utils/cn.ts`, `hooks/useWebSocket.ts`, `hooks/useMarketData.ts`, `hooks/useBrainStatus.ts`, `hooks/useAgents.ts`, `components/providers.tsx`, `components/ui/button.tsx`, `components/ui/card.tsx`, `components/ui/badge.tsx`, `components/ui/input.tsx`, `components/ui/select.tsx`, `components/ui/switch.tsx`, `components/ui/dialog.tsx`, `components/ui/drawer.tsx`, `components/ui/table.tsx`, `components/ui/tabs.tsx`, `components/ui/tooltip.tsx`, `components/layout/PageWrapper.tsx`, `components/layout/TopBar.tsx`, `components/layout/Sidebar.tsx`, `components/dashboard/BrainStatusCard.tsx`, `components/dashboard/MarketOverviewCard.tsx`, `components/dashboard/ActiveAgentsCard.tsx`, `components/dashboard/RecentLogsCard.tsx`, `components/dashboard/AlertsFeed.tsx`, `components/chat/MessageBubble.tsx`, `components/chat/ChatWindow.tsx`, `components/chat/ChatInput.tsx`, `components/chat/ThoughtStream.tsx`, `components/agents/AgentCard.tsx`, `components/agents/AgentList.tsx`, `components/agents/CreateAgentModal.tsx`, `components/agents/AgentLogDrawer.tsx`, `components/market/MarketStats.tsx`, `components/market/PriceTable.tsx`, `components/market/PriceChart.tsx`, `components/market/SymbolSearch.tsx`, `components/brain/LogEntry.tsx`, `components/brain/LogFilters.tsx`, `components/brain/LogFeed.tsx`, `components/brain/TaskCard.tsx`, `components/brain/TaskQueue.tsx`, `components/brain/SelfModifyHistory.tsx`, `components/admin/PermissionsEditor.tsx`, `components/admin/ModelSelector.tsx`, `app/layout.tsx`, `app/page.tsx`, `app/chat/page.tsx`, `app/agents/page.tsx`, `app/market/page.tsx`, `app/brain/page.tsx`, `app/admin/page.tsx`, and replaced `app/globals.css`; `tsc --noEmit` passed, but `npm run build` remains blocked by the native SWC crash |
| 2026-04-14 | Codex | Cross-checked `morgoth/api/routes/*` and `api/ws/handler.py` against `morgoth_ui/types/morgoth.ts`, `lib/api.ts`, hooks, and stores; fixed the REST envelope/tool wrapper mismatches, aligned agent/chat/admin payloads, removed frontend assumptions about unimplemented backend endpoints, and updated the WS event union to the current emitted set; `node_modules/.bin/tsc --noEmit` passes, while `npm run build` now still fails with a generic webpack error on this machine |
| 2026-04-14 | Codex | Fixed the infinite store sync loop by reducing query-to-Zustand effects to data-only dependencies in `hooks/useMarketData.ts`, `hooks/useAgents.ts`, `hooks/useBrainStatus.ts`, and `app/chat/page.tsx`; memoized derived market stats to avoid recreating effect dependencies each render; `node_modules/.bin/tsc --noEmit` passes after the fix |
| 2026-04-15 | Codex | Switched chat send flow to prefer the websocket and send `user_id` consistently, added optional agent model passthrough to the creation modal/types, and upserted the created agent into the UI store immediately; `node_modules/.bin/tsc --noEmit` passes |
| 2026-04-16 | Codex | Phase 2b Step 2 complete: extended shared UI contracts for thought clusters, concept graphs, objectives, knowledge domains, and evolution metrics/timeline data |
| 2026-04-16 | Codex | Phase 2b Step 3 complete: added dedicated Zustand stores for consciousness and mind state ahead of the new hooks and pages |
| 2026-04-16 | Codex | Phase 2b Step 4 complete: added `useObjectives`, `useSelfModifications`, and live thought WS routing into the new consciousness store |
| 2026-04-16 | Codex | Phase 2b Step 5 complete: built the new consciousness, mind, evolution, and war room component sets |
| 2026-04-16 | Codex | Phase 2b Step 6 complete: replaced the dashboard with Consciousness and added the Mind, Evolution, and War Room pages |
| 2026-04-16 | Codex | Phase 2b Step 7 complete: removed the market UI and updated the sidebar, metadata, and provider bootstrap to the new consciousness viewer flow |
| 2026-04-16 | Codex | Phase 2b Step 8 complete: fixed the stale deleted-route `.next` type artifact, passed `tsc --noEmit`, and verified the six target pages return `200` under `next dev` |
| 2026-04-25 | Codex | Phase 3 War Room integration complete: mirrored new backend DTOs in TypeScript and routed `agent_update` WebSocket events into realtime agent logs and task state |
# Desktop D5.1 — finition visuelle (branche Tauri dédiée)

La branche `feat/morgoth-desktop-d5-visual-polish-v1` issue de `caef12c1c7a9a2a38c8c28709c626b6ae822ba40` affine la typographie Source Sans 3 embarquée, les barres de défilement et les sélecteurs natifs. Les contrats backend, la persistance locale et l'autorité Tauri restent inchangés. Voir `docs/DESKTOP-D51-VISUAL-POLISH.md` pour les vérifications et les limites ; cette section concerne le Desktop Tauri et non l'ancien Next.js de `main`.

# Desktop D10 — import Markdown personnel et recherche intersources

Branche Tauri `feat/morgoth-desktop-d10-knowledge-import-v1` issue de `314d984449a89d129e285d57edd65fb24e8b5438`. Sélection native explicite de fichiers ou dossier Markdown, prévisualisation, résolution prudente des wikiliens, stockage local Project-scopé avec provenance, reprise après interruption et compatibilité D8 format 1. Recherche bornée par source dans la palette. Tests et limites d'acceptation native : `docs/DESKTOP-D10-KNOWLEDGE-IMPORT.md`. Aucun changement du backend, de l'autorité agent ou de l'identifiant Tauri.

# Desktop D11 — candidat release natif local

Branche Tauri `feat/morgoth-desktop-d11-native-release-v1` issue de D10 `c85f0c94adf6cf0ba6647b7580e2b80c7a273ee5`. Construction Tauri release avec assets intégrés, reçu local liant binaire et assets au commit, lanceur quotidien sans Vite ni compilation. Contrats de données et autorité inchangés. Voir `docs/DESKTOP-D11-NATIVE-RELEASE.md` pour les prérequis et limites. Aucune dépendance ajoutée.

Le candidat release réel s'est affiché sous WSLg/XWayland. Le Project synthétique sélectionné est revenu après redémarrage du binaire ; le port Vite 5173 est resté fermé. La saisie WebKitGTK par AT-SPI restant indisponible, les dialogues d'import/restauration et le parcours documentaire complet demeurent en acceptation manuelle, sans déclaration de réussite native.

# Desktop D11.1 — retours d'acceptation utilisateur

Branche Tauri isolée `fix/morgoth-desktop-d11-user-acceptance-v1`, issue de D11 `4381ce328767ce7e9936bb96735a337c6703fd1a`. Le formulaire de brief valide explicitement les champs et garde ses actions accessibles ; la taille du texte est réglable et persistante ; l'état Management détaillé est dans Diagnostics ; les états de coffre et de graphe sont clarifiés. Voir `docs/DESKTOP-D111-USER-ACCEPTANCE.md` pour la portée et les limites d'acceptation native. Aucune dépendance ajoutée, aucun changement backend ni élargissement d'autorité.
# Desktop D12 — fondation de connecteurs locaux

La branche isolée `feat/morgoth-desktop-d12-app-connectors-v1` ajoute un hub dans Réglages et une fixture MCP privée réellement interrogée par stdio. Autorisation GTK native, session de dix minutes, refus sans grant et révocation sont limités à un outil synthétique de lecture. Le lanceur release distingue désormais les absences de home et d'artefacts des erreurs génériques. Aucun accès Windows, navigateur ou compte personnel n'est revendiqué. Voir `docs/DESKTOP-D12-CONNECTOR-FOUNDATION.md`.
