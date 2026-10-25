# Desktop D4 — Mission Workspace

## Scope and provenance

D4 extends the D3 Tauri application at `19f79cf4148e3ff5cc6316846ab7d9681de617bf`.
The six workspaces remain. `App.tsx` owns global navigation, source reads and
the selected Project; `MissionWorkspace.tsx` owns local brief editing and the
existing D2 historical mission reads. React Query keys include Project IDs.
Management remains pinned to backend `5fc01cc6f465ff021cac7735d44245ca6e79e87b`.
The historical mission and capability register remains optional, disposable
`morgoth_test` evidence. A checkpoint is neither a current run nor a grant.

The Project selector reads the authenticated Management catalog. Its preferred
identifier is stored locally. On launch and after a Management read, the UI
distinguishes a catalog-verified identity from one merely remembered on disk.
It never silently substitutes another Project. If Management is unavailable,
the remembered Project may still open its own local briefs, marked unverified;
historical backend records are hidden. An explicit empty selection is valid.

## Native local storage

The seven new fixed IPC commands are `preferred_project_read`,
`preferred_project_set`, `local_drafts_list`, `local_draft_get`,
`local_draft_create`, `local_draft_update`, and `local_draft_delete`.
They operate only on a Tauri app-local data subdirectory named
`mission-workspace-v1`. They do not call backend mutation or Ollama APIs.
The Tauri application identifier remains `com.coriom.morgoth.projects`, so
the established application-data identity is preserved despite the visible
product name change.

Each draft is a version-1 JSON record with UUID `draft_id`, validated
`project_id`, title, objective, verification criteria, revision and creation/
update timestamps. Drafts are unsent. The store allows at most 200 records per
Project and 16 KiB per file. Titles have at most 120 Unicode scalar values;
objective and criteria have at most 4,000 each. IDs never become path
components without native validation. Unix directories are mode 0700, files
0600; symlinks, unexpected file types, wrong ownership and hard links are
refused. Writes use a new temporary file, file sync, atomic rename and
directory sync. A stale temporary file is ignored only after validation;
malformed records are not overwritten. Project-local file locking and
revision checks reject conflicting edits. Delete also requires the expected
revision. Errors returned to the WebView contain fixed non-sensitive codes.

The records are **not application-encrypted**. Filesystem permissions protect
them against other ordinary OS users where supported; the OS account owner
and its backups can read them. This implementation targets the current Linux
Tauri/WSL environment and uses Unix filesystem APIs. Porting the store to
Windows or macOS requires a separately tested permissions implementation.
There is no cloud sync, backend mission submission, agent execution or
approval command.

## Interaction and freshness

Missions separates editable local briefs from read-only historical checkpoints.
Create, edit, reopen, duplicate and confirmed delete are available. An
unsaved-change guard covers in-app navigation, Project switching and window
unload. Native revision conflicts leave the user's editor text intact.
Search filters only the locally loaded page and draft list. Historical pages
retain their bounded backend pagination and display their last successful
read time. Management and Ollama reads remain distinct. Refresh is manual;
Ollama GET status is never read to trigger inference or model loading.

Project and historical data are shown as current only while the corresponding
read is successful. A failed refresh removes the previous read from the
current view. Local drafts remain separately available offline and are never
presented as submitted missions.

## Future boundary

Future mission submission needs a separately reviewed backend contract,
authorization path and evidence model. A saved brief is input material only;
it must never acquire execution authority from its presence on disk.
