# Desktop D10 — Personal Markdown import and unified search

## Scope and authority

D10 imports **only** Markdown files that the user selects in a GTK native file or folder dialog. Import is available for a currently verified managed Project. The existing application identifier, native note directory (`knowledge-v1`), D8 backup format 1, backend pin, Management authentication and optional D9 structured-memory reader are unchanged. No backend vault or PostgreSQL record is written. No model or agent is invoked.

The WebView has two fixed commands: `local_notes_import_preview(project_id, directory)` and `local_notes_import_apply(project_id, token)`. The Rust main-window handler rechecks the managed Project through authenticated Management. Paths remain native; the preview contains only safe relative names, bounded excerpts, outcomes and an opaque token. `apply` accepts no path or Markdown body from React. The dialog can select one or several files, or one folder for bounded recursive traversal. Cancellation changes no notes. The original files are never written or deleted.

The native scanner opens each component with `openat` and `O_NOFOLLOW`, refuses symlinks and nonregular files, hidden entries and unsafe relative names, invalid UTF-8, and unsupported extensions. It examines at most 1,000 entries, traverses at most six directory levels, reads at most 8 MiB and accepts only 32 KiB per note. A ten-second cooperative deadline is checked around traversal and reads; a single blocking filesystem call can exceed it. The 500-note Project capacity remains enforced. Source data is read into the bounded in-memory plan only after explicit selection; no background scan occurs.

## Import mapping and provenance

Each eligible document receives a UUID before publication. `[[Title]]`, `[[Title|Label]]` and `[[folder/Title]]` resolve only to a unique selected document. A same-folder title takes precedence when unique; ambiguous and unresolved links remain visible and are counted. Embedded/attachment syntax is preserved as text. UUID links already present are retained. Resolved links become `[[uuid|label]]`, so the existing notes list, backlinks and Project graph share the same records. Repeating the same relative source with the same content hash is a duplicate. Distinct files with identical content remain distinct, so a link cannot silently attach to the wrong document. Repeating a source name with changed content is refused without overwriting the earlier note. Personal imported notes remain editable.

The note record keeps schema version 1 and adds a bounded `HUMAN_IMPORTED_V1` provenance value: original file SHA-256, import time and a URL-safe Base64 relative display name. It never stores an absolute source path. Existing `HUMAN_LOCAL` notes remain valid. The D8 format-1 serializer and restore code are unchanged; they include the provenance as part of each note record. The archive is unencrypted, as before.

## Publication and recovery

Preview makes no persistent note changes. Confirmation stages a private file, syncs it, atomically links a complete Project journal and syncs its directory before publishing any note. An exclusive Project lock prevents concurrent publication. Each note is published through the existing atomic, UUID-checked store method. If interruption leaves a partial batch, the next explicit preview for that Project presents the validated recovery plan; it does not silently retry. A crash before journal publication cannot publish a note; a later explicit confirmation cleans its private orphan staging file. Conflicting or malformed journal evidence refuses recovery. Completing a batch removes and syncs the journal. Reimporting a completed batch reports duplicates, without silently overwriting edited notes. An empty/invalid selection does not grant storage authority.

## Search

`Ctrl+K` / `Cmd+K` searches local note titles and Markdown bodies, local brief titles/objectives/verification criteria, Project names, and the existing authenticated Project vault and structured-thesis subject filters. Results carry source labels. The palette includes a source selector. Backend search is bounded to 80 characters and debounced by 350 ms; the existing fixed, paged read contracts remain the only remote search route. No entire backend database is downloaded. Results remain Project-scoped; a Project or source change cannot display old backend results as a new search. The text is never an agent command.

## Normal use

```bash
cd /home/corio/Morgoth/dev-desktop-d10-ui
python3 desktop/scripts/launch_d10.py --home /ABSOLUTE/PERSISTENT/MANAGEMENT_HOME
```

For a separate disposable preview:

```bash
cd /home/corio/Morgoth/dev-desktop-d10-ui
python3 desktop/scripts/launch_d10.py --preview
```

Select a verified managed Project, open **Connaissances → Notes personnelles**, choose **Importer fichiers…** or **Importer dossier…**, review counts and link warnings, then confirm. Open Notes or Graphe; use `Ctrl+K` to search across available sources. A D8 backup in **Réglages → Données et sauvegardes** includes the imported personal notes but excludes backend vaults and structured memory. Preserve the external originals until a separate backup has been verified.

## Acceptance boundary

Automated scanner/storage, D8 compatibility and React tests establish the controlled data path. Native GTK file-dialog interaction and WSLg visual observations must be reported separately; a successful compiler or fixture test is not manual dialog acceptance. Linux/WSL is the qualified native target. No automatic synchronization, attachments, PDF/image import, external vault monitoring or agent knowledge ingestion is provided.

## Vérifications D10 (2026-10-28)

- `npm run typecheck` : réussi.
- `npm run contract:check` : checksum OpenAPI épinglé et types générés concordants.
- `npm test -- --reporter=dot` : 63 tests réussis, 10 fichiers (régression après correction d'un texte de lien dans le test).
- `npm run build` : réussi ; les avertissements Vite sur les directives `use client` de React Query existent au bundling, sans échec.
- `cargo fmt --all --check` et `cargo clippy --locked --offline --all-targets --features desktop -- -D warnings` : réussis.
- `cargo test --locked --offline --features desktop` : 46 tests de bibliothèque, 5 tests watchdog, 5 tests Ollama et 11 tests de transport réussis ; aucun échec. Les huit tests ciblés D10 incluent import, doublons par identité, conflit, publication concurrente, reprise, liens et sauvegarde D8.
- `cargo build --locked --offline --features desktop --bin morgoth-desktop` : réussi.
- `python3 desktop/scripts/launch_d10.py --preview --check` : réussi hors compilation. Une première tentative sous compilation et bac à sable ne pouvait pas créer de socket locale ; le lancement réel a été exécuté avec l'accès local WSLg autorisé, sans modifier les limites réseau de l'application.

Une vraie fenêtre Tauri a été ouverte sous WSLg/XWayland à 1120 × 780. Un Project `alpha` synthétique a été créé dans un Management home jetable distinct et les données Tauri ont été redirigées vers un XDG_DATA_HOME jetable. AT-SPI a sélectionné le Project, ouvert Connaissances et constaté les deux boutons d'import. Le dialogue natif « Choisir un dossier Markdown » s'est ouvert puis a été annulé ; aucun fichier `.md` n'a été créé dans le magasin du Project. Après fermeture et redémarrage, la capture ciblée a confirmé que la préférence Project `alpha` était conservée. Les captures de la vraie application sont [l'accueil vide](screenshots/d10-native-empty-preview.png) et [Connaissances avec Project synthétique](screenshots/d10-native-knowledge-import.png).

L'interface WebKitGTK de saisie n'exposait pas `org.a11y.atspi.EditableText` dans ce WSLg. La sélection automatisée d'un dossier, la confirmation native de l'import, l'exploration du graphe après import et les tailles 1440 × 900 / 1100 × 750 restent donc **non observées dans la fenêtre**. Les tests Rust et React valident leurs chemins respectifs, mais ne remplacent pas ce contrôle manuel du dialogue GTK. Procédure courte : lancer D10 avec un Project géré, choisir un dossier Markdown synthétique, vérifier le nombre/les liens avant confirmation, importer, ouvrir une note et son graphe, redémarrer, puis exporter/restaurer une sauvegarde D8 dans un Project jetable correspondant. Ne pas choisir des documents privés pour cette qualification.
