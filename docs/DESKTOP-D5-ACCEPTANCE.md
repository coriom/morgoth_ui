# Desktop D5 — vérification

Source D4 : `4a3474312724f2028d61b88f3d02188dbef66d37`. Design de référence : `cab68c3bf69aca94ea56c4a58c337d7afe94b8c3`. Branche candidate : `feat/morgoth-desktop-d5-production-workspace-v1`. Aucun test n'a chargé ni exécuté de modèle.

| Contrôle | Commande | Résultat |
|---|---|---|
| TypeScript | `cd desktop && npm run typecheck` | PASS |
| Contrat API épinglé | `cd desktop && npm run contract:check` | PASS |
| React/Vitest | `cd desktop && npm test -- --reporter=dot` | 40 PASS, 0 FAIL |
| Vite | `cd desktop && npm run build` | PASS ; avertissements préexistants `use client` de React Query |
| Format Rust | `cd desktop/src-tauri && cargo fmt --check` | PASS |
| Tests Rust natifs | `cd desktop/src-tauri && cargo test --offline --features desktop --lib` | 29 PASS, 0 FAIL |
| Clippy strict | `cd desktop/src-tauri && cargo clippy --offline --all-targets --features desktop -- -D warnings` | PASS |
| Binaires Linux | `cd desktop/src-tauri && cargo build --offline --features desktop --bin morgoth-desktop --bin d2-read-smoke` | PASS |

Les tests React utilisent des transports natifs factices et ne prouvent pas à eux seuls la persistance dans une fenêtre. Les tests Rust exercent le système de fichiers temporaire : refus des symlinks, tailles, permissions, données corrompues, révisions, Projet et écriture atomique. Le contrat TypeScript continue de vérifier l'OpenAPI épinglé.

## Fenêtre native et limites visuelles

À compléter par l'essai WSLg de la branche validée et propre avec la fixture jetable. Les images sous `docs/design/d5/screenshots/` appartiennent au **prototype statique** ; elles ne sont pas des captures du binaire D5.

Le test de saisie AT-SPI/WebKit D4 était limité par l'environnement : la fenêtre native, la navigation et l'isolement des Projects étaient observés, mais l'écriture native d'un brief n'avait pas été vérifiée visuellement. D5 ne doit pas transformer cette lacune en succès implicite. Le script jetable ouvre deux fenêtres avec le même HOME temporaire pour une vérification manuelle du redémarrage ; aucune donnée personnelle n'est utilisée.
