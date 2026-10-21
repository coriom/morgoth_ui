# Desktop D1 read-only integration matrix

D1's native WebView calls fixed Tauri commands. The Rust side owns the loopback API token and enforces one local window. No browser `fetch` to Morgoth, external telemetry or arbitrary endpoint construction is introduced. All successful data below is scoped to the active local Desktop process; Project detail is limited to an ID from the authenticated catalog. Queries do not retry or poll automatically. The operator can press **Actualiser** for a single read refresh. A malformed response is treated as unavailable.

| UI field | Source | Evidence class / scope | Refresh | Failure / limit |
|---|---|---|---|---|
| Connection banner, Management card | `management_runtime_status` then `management_status` | Observed local supervisor and Management availability; not agent readiness | Initial + manual | Disconnected / loading; no downstream Project read |
| Configured Project count | `list_projects` | Observed configuration catalog, local Management scope | Initial + manual | Unavailable if rejected; zero only for a valid empty catalog |
| Project list, domain, configuration flag, PostgreSQL schema | `list_projects`, `get_project` | Observed configuration, selected catalog Project only | Initial list; detail on selection; manual list refresh | Missing/invalid/stale Project detail hidden; no storage/runtime inference |
| Research state and engine Project | `research_engine_status` | Observed native supervisor state, one engine | Initial + manual | Unavailable if disconnected/error; another Project is not attributed to selection |
| Configured research profile/readiness | `research_engine_status.runtime`, `research_profiles` | Observed when engine initialized; profile read scoped to engine Project | Models/Security on demand + manual | Unavailable if stopped or invalid; READY is not mission acceptance |
| Codex installed/sandbox/workloads flags | `research_profiles.codex` | Observed backend profile facts, if exposed for initialized engine | Models/Security on demand + manual | Unknown otherwise; no direct Codex call |
| SAFE_FOR_WORKLOADS | No Desktop live read field; reviewed backend `core/llm/codex_cli.py` baseline is `False` | Historical source configuration, **not** live observation | None | UI says not exposed in real time |
| Human Gate 3 / synthetic browser restriction | Reviewed governance and experiment scope | Policy statement, not live approval telemetry | None | No UI grant/execute command |
| Generalist missions, decisions, checkpoints, events | No native read contract | Unavailable; Project-scoped backend records not exposed | None | No fabricated count, history or outcome |
| Capability versions, validation, approval provenance, procedure receipts | No native read contract | Unavailable | None | Validated does not mean approved; no executable action |
| Pending approvals / blocked attempts | No native read contract | Unavailable | None | No false zero or UI-only permission toggle |
| Ollama connectivity, installed/loaded models, CPU/GPU/memory | No native read contract | Unavailable | None | No inference or service probe to fill cards |

The next integration should add one narrowly scoped, authenticated native read DTO for generalist mission summaries and selected-Project details, with pagination, size bounds, explicit event/receipt provenance and authorization-sensitive redaction. A separate reviewed DTO can later expose non-generative local model metadata. Neither is silently approximated by the current Management catalog.
