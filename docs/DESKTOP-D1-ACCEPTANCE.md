# Desktop D1 acceptance record

Candidate branch: `feat/morgoth-desktop-command-center-v1`, based on pinned Desktop `a7dab1b7730ba94536f6b413661512e533b36866`. Code was validated in this isolated worktree; the exact committed code SHA is recorded in the final documentation-only follow-up commit. The pinned reference worktree and backend development branch are not modified.

## Gates

| Check | Command / method | Outcome |
|---|---|---|
| TypeScript | `cd desktop && npm run typecheck` | PASS |
| Frontend tests | `cd desktop && npm test -- --reporter=dot` | PASS: 18 tests, 4 files |
| Generated Management contract | `cd desktop && npm run contract:check` | PASS: pinned checksum and generated types match |
| Frontend asset build | `cd desktop && npm run build` | PASS: Vite emitted production assets; dependency `use client` directive warnings are nonfatal |
| Rust formatting and unit tests | `cd desktop/src-tauri && cargo fmt --all -- --check && cargo test --locked --offline --lib` | PASS: format + 20 library tests |
| Native feature check/build | `cd desktop/src-tauri && cargo check --locked --offline --features desktop && cargo build --locked --offline --features desktop --bin morgoth-desktop` | PASS: Linux x86-64 ELF built; no distributable bundle configured |
| Rust strict lint | `cd desktop/src-tauri && cargo clippy --locked --offline --features desktop --all-targets -- -D warnings` | PASS |
| Diff/security review | `git diff --check`, Tauri capability/handler/transport comparison, secret/artifact scan | PASS before commit; repeat at publication |
| Lint | No `desktop` lint script exists | Not run; TypeScript/Rust checks substitute for this change |
| Actual window / accessibility automation | No installed headless browser or desktop E2E harness in this isolated worktree | NOT VERIFIED; semantic DOM/focus styling reviewed |
| Backend or real mission integration | No new read DTO; no backend or production service touched | Not run / unavailable by design |

The copied `node_modules` is untracked and ignored. It came from the pinned Desktop worktree with an identical package-lock SHA-256 because offline `npm ci` lacked one tarball. This does not claim a fresh dependency install. No dependencies were added.

## Acceptance limits

Read-model and UI tests use mocked native calls. They prove rendering, malformed/disconnected handling and the absence of D1 mutation controls, not a live backend session or production approval. Native Rust tests/build establish command compilation and the narrowed capability. D1 must not be interpreted as proof that Morgoth can launch or supervise generalist workloads.

## Safe local preview

From the clean feature worktree, with no production workload started, run `cd desktop && npm run tauri dev`. The native Management supervisor will perform its existing local startup checks. It requires an explicitly configured, clean backend checkout at its pinned SHA and private native locators; if absent, the view should show a disconnected state. Inspect the six workspace tabs; unavailable sources remain explicitly unavailable. Do not use the older Next admin pages for D1 acceptance. Close the window to stop the owned local supervisor. This preview does not initiate research or model inference.

The first added static authority test used a Vite-transformed `.rs` URL and failed in Vitest; its path resolution was corrected, then all 18 tests passed. No failed product check was hidden by rerunning an unchanged suite.
