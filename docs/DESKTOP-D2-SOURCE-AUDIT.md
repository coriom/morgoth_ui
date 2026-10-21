# Desktop D2 source audit

## Version boundary

D1 is the clean UI candidate `606a7cf6082414fde6aab50a4daa9f64569b899e` and its native supervisor pins backend `7bff6c92ffe958cb11411a1f23fa6f917cf0fe32`. The D2 UI is a separate worktree/branch and pins backend candidate `5fc01cc6f465ff021cac7735d44245ca6e79e87b`. The original protected Desktop worktree at `a7dab1b7730ba94536f6b413661512e533b36866` and D1 branch are unchanged. Backend `scripts/research_engine.py`, `api/management_app.py` and `docs/management_api_v1.openapi.json` have no diff between D1's backend pin and D2's pin; the Management V1 OpenAPI checksum is still `681e6e6311ded43bdd28e387178641caec45535c201a3dce4ed8ecc765e79b76`. D2 adds opt-in read routes outside Management V1. This pairing is a development candidate, not a deployment or replacement of D1.

## Authoritative sources

| Candidate field | Actual source | Scope / semantics | Sensitivity and availability |
|---|---|---|---|
| Mission ID, objective, state, revision, stage history, gaps, failure codes, resume flag | `generalist_missions` Project schema, `MissionRecord` JSONB and row timestamps | One managed Project; latest **committed historical checkpoint**, not proof of a currently running worker | Objective is Project data. Store is optional and locked to `morgoth_test`; absent table is unavailable. Raw checkpoint JSON is withheld. |
| Receipt count | `generalist_execution_receipts`, filtered by Project and mission | Count of committed local receipts only | Raw result, idempotency key and external response are withheld; local receipt does not prove remote exactly-once execution. |
| Capability ID/version/document digest, validation and state | `generalist_capabilities` and `CapabilityRecord` | Versioned, Project-bound proposal; `PASSED` validation does not grant execution | Invocation contract and scopes are withheld; non-simple documentation identities are redacted. Optional test DB only. |
| Fixture approval indicator | `CapabilityRecord.state=TEST_ONLY_APPROVED` | Synthetic test fixture only | Explicitly labeled; cannot become production approval. |
| Actual approval grant, provenance, expiry, revocation, consumed budget | `generalist_approval_grants` in disposable experiments | A separate broker table, not equivalent to capability state | **Not exposed in D2.** A production authenticated grant/read contract is absent. |
| Browser procedure | Experimental browser capability records in the same optional store | Synthetic UI validation, Project-bound | May appear as a capability record; D2 never calls it executable on real sites. Full procedure steps are withheld. |
| Project configuration | Existing Management V1 catalog | Observed configuration, not storage readiness | Backend includes filesystem paths and schema names; D2 Rust maps to a path-free native DTO before IPC. |
| Research runtime and profiles | Existing native research supervisor | Observed if initialized; independent of selected Project | No D2 execution command is exposed. |
| Ollama loaded/installed, CPU/GPU, production SAFE_FOR_WORKLOADS | No D2 authenticated live read source | Unavailable, not zero or ready | Only historical code policy is described; no inference or model probe. |

The Project manager reads validated manifests from an explicit Desktop home. Generalist persistence is opt-in and its existing `ProjectMissionStore.initialize_optional()` creates tables only after verifying `current_database() = morgoth_test`; it cannot be used as a read-only production connector. D2 therefore uses a separate read-only SQL projection against an owner-private Unix-socket test cluster. It never initializes or migrates a database. Research Brain, scheduler, Ollama routing and Human Gate 3 remain outside this integration.
