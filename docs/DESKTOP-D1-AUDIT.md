# Desktop D1 audit — 2026-10-21

Baseline: `a7dab1b7730ba94536f6b413661512e533b36866` in a separate feature worktree. Backend development reference: `d9286c465025105a518464a88a3520f080a74e66`; no backend change or activation in D1.

## Actual frontend

The repository has two UIs. The root is an older Next.js 14 web viewer with App Router pages for cockpit, chat, agents, brain, evolution, knowledge, wiki and administration. `lib/api.ts` calls the backend and `lib/ws-client.ts` receives events. Some pages are functional viewers, but the web app also has mutable objectives, agents, permissions, model selection and proposal actions. Its default backend URL and server token path are separate from the native Desktop authority. It is not a safe source for D1 mission or approval claims. This milestone does not launch or replace it.

`desktop/` is the actual native Linux desktop: React 18 + Vite + TypeScript in a Tauri 2 WebView, with a Rust-owned Management supervisor and a separate research supervisor. The Management API is bound to localhost and authenticated by a Rust-owned exclusive token. The WebView gets fixed IPC commands, not a token, shell, filesystem or general HTTP capability. The native window rejects navigation outside its application origin. Its Project catalog, detail and validation are configuration data; they do not assert runtime readiness. The research status/profile commands report one supervised engine when available. The prior screen exposed Project creation and research initialize/profile/start/stop controls, which are unsuitable for the D1 read-only workspace.

The native build is a Linux/WSLg application; it is not a Windows-native package. `desktop/package.json` offers typecheck, Vitest, Vite build, OpenAPI contract check and Tauri CLI; it has no lint script. `desktop/src-tauri/Cargo.toml` defines the native binary and Rust tests. The Next.js design spec describes a dark visual language, but the native app has its own existing CSS rather than Tailwind. D1 keeps the native stack and improves its typography, density and responsive layout without adding dependencies.

## Feature inventory at audit

| Surface | Existing evidence | D1 decision |
|---|---|---|
| Project catalog/detail | Fixed Rust IPC to authenticated Management GET | Reuse; label as configuration only |
| Research engine status/profile | Fixed Rust IPC to one supervised engine | Reuse; show Project identity and blocked/readiness facts separately |
| Project creation/start/stop/profile selection | Native mutation commands and buttons | Remove from D1 WebView command registration and capability; preserve supervisor code for later review |
| Generalist missions/checkpoints | Backend experimental Project store; no native read DTO | Explicit unavailable, no fake zero or demo data |
| Capability inventory/procedures/approvals | Backend experimental records; no native read DTO | Explicit unavailable; no approval UI |
| Ollama installed/loaded/resources | No native read DTO | Explicit unavailable; no inference for dashboard data |
| Recent mission events | No Project-scoped native stream | Explicit unavailable |
| Older Next pages | Existing viewer and mutation pages | Unchanged and not reused for native D1 |

## Implementation plan and decisions

D1 uses one query cache, fixed read-only native transport, bounded runtime DTO validation and manual refresh. It presents Overview, Missions, Capabilities, Models, Security and Projects; screens with no scoped read source state the missing contract. The browser never infers activity from a reachable Management API. Selected Project detail is fetched only for an ID present in the current catalog. Network/model probes, automatic retries and background polling are absent.

The WebView capability and invoke handler are narrowed to eight read commands. The Management and research supervisors retain their internal implementation but are not reachable as mutations from the D1 window. No new backend route is justified for this milestone: a future read model must be Project-scoped, authenticated by native Rust and explicitly bounded. That contract must separate mission checkpoints, capability validation, approval provenance and execution receipts before displaying them as live facts.

Residual limits: Rust still owns backend management credentials and can see full Project records; ProjectView contains paths even though D1 does not render them. Research profile reads may perform non-generative readiness checks when an engine is initialized and Models/Security is opened. The native app has not been qualified as a production generalist agent. The historical Next web app remains outside D1's read-only guarantee.
