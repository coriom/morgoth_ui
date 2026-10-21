# Desktop D2 acceptance evidence

## Provenance and scope

Backend code commit `5fc01cc6f465ff021cac7735d44245ca6e79e87b` and Desktop code commit `dae2365577d2272469c6e2f78b56472597b86fb2` passed the frontend, Rust and first native read checks in isolated feature worktrees. A subsequent Desktop fixture-runner commit adds explicit fresh-process read verification; its SHA and result are recorded below. The D2 supervisor pins the exact backend SHA. The D1 worktree and protected Desktop reference remain separate. This is a disposable development/test integration, not production qualification.

## Executed checks

| Check | Command / evidence | Result |
|---|---|---|
| Backend focused auth and SQL | `pytest -q tests/test_management_api.py tests/test_desktop_read_models.py` against an owned Unix-socket `morgoth_test` cluster | 14 passed. D2's actual SQL tests, including Project isolation, passed; a final D2-only run passed 2 tests after the authenticated SQL-backed route assertion was added. |
| Backend canonical | Provenance-aware `python -m self_modify.canonical_runner` on clean backend code SHA above | 2,651 passed, 33 skipped, 0 failures/errors, exit 0. Requested/tested SHA identical; copied-tree manifest `a3160c30d5aee946e2c1f926dd8163f6ced5614ab3497b7e58915c06344d9e97`. Peak cgroup memory 781,754,368 bytes; peak pids 87; no OOM or pids-limit event. |
| Frontend and contract | From `desktop/`: `npm run typecheck`; `npm test -- --run`; `npm run contract:check`; `npm run build` | Typecheck and pinned Management V1 contract passed; 22 component/transport tests passed; Vite asset build passed. Vite emitted only the existing TanStack Query `use client` directive warnings. |
| Rust | From `desktop/src-tauri/`: `cargo fmt --all -- --check`; `cargo test --locked --offline --lib --test transport`; `cargo clippy --locked --offline --features desktop --all-targets -- -D warnings`; `cargo check --locked --offline --features desktop`; `cargo build --locked --offline --features desktop --bin morgoth-desktop`; `cargo build --locked --offline --bin d2-read-smoke` | Format, 20 library tests, 11 transport tests, strict Clippy, check and both builds passed. |
| Existing native Management lifecycle | `management-supervisor-smoke` against clean D2 backend pin | Passed owned startup/readiness, Project creation and validation, isolation, concurrent instances, stop/reap and timeout checks. No research START. |
| Native-to-real-SQL proof | `/home/corio/Morgoth/morgoth/.venv/bin/python desktop/scripts/d2_read_fixture.py` from a clean Desktop code commit | One synthetic Project A mission and capability, Project B empty, foreign detail 404; owned temporary resources removed. The first clean code commit passed the native proof. A follow-up fixture-runner commit verifies the same persisted record in a second native process and Management child; see recorded SHA/result below. Initial sandbox run could not start PostgreSQL; the reviewed command passed with local Unix-socket permissions outside that sandbox. |
| Native window | Candidate Tauri Linux binary launched under WSLg with a private temporary home and remained alive for a bounded 12-second smoke | Startup observed. Visual verification of six views and connected Project switching **NOT VERIFIED**. A sandboxed launch failed GTK initialization; the WSLg launch emitted a Mesa/EGL warning. |

All actual PostgreSQL reads above used `morgoth_test` with disposable managed Project schemas. The D2 fixture script creates its own cluster and home; it has no database URL or production address input. Mocked frontend tests alone are not claimed as SQL or connected-window proof. No inference, browser automation, production mutation or workload activation ran.

## Preview and remaining gate

After building the two native binaries from the exact clean D2 branch, run the one-shot preview from the Desktop repository root:

```bash
/home/corio/Morgoth/morgoth/.venv/bin/python desktop/scripts/d2_read_fixture.py --window
```

The script verifies the D2 branch and clean worktrees, creates and removes an owned local test cluster, proves Project-scoped native reads, then opens the local candidate window. Select `project_a` to inspect the clearly synthetic historical record and `project_b` to verify an empty Project. Close the window for cleanup. This is a manual visual acceptance step, not a production service. The optional read contract remains unavailable when the native test socket is absent. Actual production approval provenance and a production database read authority require a separate design and review.
