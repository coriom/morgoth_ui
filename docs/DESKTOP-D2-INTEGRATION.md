# Desktop D2 integration matrix

All D2 reads are manual-refresh or view-on-demand; React Query has no retry or polling. A disconnected, malformed or incompatible source hides old data rather than presenting stale values as live. Selecting another Project resets pagination and detail, changes every read cache key and requires response Project ID equality.

| UI field | Source | Evidence and scope | Refresh / failure |
|---|---|---|---|
| Connection / Management | Native supervisor + Management V1 status | Observed local availability only | Initial/manual; disconnected if either fails |
| Project count, name, domain, configuration | Management V1 catalog, sanitized Rust DTO | Configured Project only | Initial/manual; invalid response unavailable; no internal paths in WebView |
| Mission list, objective, state, timestamp | Optional `/desktop-read/v1` over `morgoth_test` | Historical committed checkpoint for selected Project | On Missions/manual; 10/page; missing read source unavailable, valid empty page says empty |
| Mission detail, stages, gaps, refusal codes, resume flag | Exact Project/mission read | Historical bounded fields; resume flag is stored eligibility, not an action | On selection/manual; deleted/foreign ID unavailable |
| Mission receipt count | Project-filtered local receipt count | Observed committed local rows, not remote exactly-once proof | With mission reads; raw receipt unavailable |
| Capability identity, version, digest, source, validation, state | Optional Project capability projection | Stored proposal/validation in disposable test DB | On Capabilities/Security/manual; absent table unavailable |
| Fixture approval marker | Capability state projection | `TEST_FIXTURE_ONLY` explicitly test authority | With capability page; no production approval inference |
| Pending review count on Security | Number of `PENDING_APPROVAL` records on current page | Historical page-local stored state, **not** a human queue total | On Security/manual; unavailable if read fails |
| Actual grant provenance, expiry, revocation, scopes | No D2 read contract | Unavailable | No grant claim or UI approval action |
| Research engine/profile/Codex readiness | Existing native supervisor | Observed only when engine initialized; independent of selected Project | Initial/Models/Security/manual; unavailable otherwise |
| Ollama residency, inference diagnostics, resource metrics | No D2 read source | Unavailable | No inference triggered |
| SAFE_FOR_WORKLOADS / Human Gate 3 | Reviewed code policy, not a live status endpoint | Historical policy statement | No live readiness inference |
| Real browser procedures or external authority | No D2 execution/read grant | Unsupported | Synthetic records never presented as real-site permission |

The D2 candidate pins backend `5fc01cc6f465ff021cac7735d44245ca6e79e87b`. Management V1's pinned OpenAPI remains byte-identical to D1. The D2 route is deliberately mounted only for an owned disposable `morgoth_test` socket. Without that native-only opt-in, Missions and Capabilities show unavailable rather than example data.
