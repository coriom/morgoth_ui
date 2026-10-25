# Desktop D5 — vérification

Source D4 : `4a3474312724f2028d61b88f3d02188dbef66d37`. Design de référence : `cab68c3bf69aca94ea56c4a58c337d7afe94b8c3`. Branche candidate : `feat/morgoth-desktop-d5-production-workspace-v1`. Aucun test n'a chargé ni exécuté de modèle.

| Contrôle | Commande | Résultat |
|---|---|---|
| TypeScript | `cd desktop && npm run typecheck` | PASS |
| Contrat API épinglé | `cd desktop && npm run contract:check` | PASS |
| React/Vitest | `cd desktop && npm test -- --reporter=dot` | 42 PASS, 0 FAIL |
| Vite | `cd desktop && npm run build` | PASS ; avertissements préexistants `use client` de React Query |
| Format Rust | `cd desktop/src-tauri && cargo fmt --check` | PASS |
| Tests Rust natifs | `cd desktop/src-tauri && cargo test --offline --features desktop --lib` | 29 PASS, 0 FAIL |
| Clippy strict | `cd desktop/src-tauri && cargo clippy --offline --all-targets --features desktop -- -D warnings` | PASS |
| Binaires Linux | `cd desktop/src-tauri && cargo build --offline --features desktop --bin morgoth-desktop --bin d2-read-smoke` | PASS |

Les tests React utilisent des transports natifs factices et ne prouvent pas à eux seuls la persistance dans une fenêtre. Les tests Rust exercent le système de fichiers temporaire : refus des symlinks et fichiers corrompus, tailles, permissions, révisions, Project et écriture atomique. Le contrat TypeScript continue de vérifier l'OpenAPI épinglé. Les régressions D4 de création, réouverture, édition, duplication et suppression des briefs restent incluses. Le pont IPC D5 n'ajoute que cinq commandes fixes de notes locales ; le test d'autorité refuse les mutations backend et l'inférence.

## Fenêtre native WSLg

La première invocation de `/home/corio/Morgoth/morgoth/.venv/bin/python desktop/scripts/d2_read_fixture.py --window` a échoué avant la fenêtre : le bac à sable des commandes empêchait le socket PostgreSQL jetable. Un second lancement autorisé avec les mêmes ressources jetables est sorti **0**. Le script a annoncé `D2_NATIVE_PROJECT_READ_PASS=true`, `D2_FRESH_PROCESS_READ_PASS=true`, `DISPOSABLE_TEST_ONLY=true`, puis a ouvert deux vraies fenêtres Tauri avec le même HOME/XDG_DATA_HOME temporaire. Les fenêtres ont été fermées par leur action AT-SPI `Close`, et la base privée a été arrêtée par la fixture.

Dans la première fenêtre, AT-SPI a exposé les cinq destinations, le sélecteur du Project et les sous-vues Réglages. `project_a` affichait son checkpoint historique synthétique dans Missions ; `project_b` ne l'affichait pas. Dans Connaissances, le mode Notes présentait son état vide, puis les champs accessibles Titre, Collection, Markdown et Enregistrer après « Nouvelle note ». Après fermeture et relancement natif, la préférence `project_b` était restaurée et le checkpoint A restait absent. Aucun bouton d'exécution ou d'inférence n'a été observé dans ces parcours. WSLg a émis des avertissements Mesa/EGL sans empêcher l'ouverture ni la fermeture.

**Limite d'acceptation native :** le champ Titre n'exposait pas d'interface AT-SPI `EditableText` dans ce WebKit WSLg. La saisie automatisée, l'enregistrement natif d'une note, le graphe peuplé, la conservation du contenu après redémarrage et la mesure visuelle d'une fenêtre Tauri aux deux tailles restent non vérifiés par ce parcours. Les tests Rust du magasin et les tests React du cycle notes/liens/graphe sont des preuves complémentaires, pas un substitut à cette interaction native. Le mode de prévisualisation jetable ouvre deux fenêtres pour permettre à l'opérateur de faire ces gestes manuellement.

## Inspection visuelle du frontend implémenté

`docs/screenshots/d5-app/` contient six captures **du React D5 réel** à 1440×900 et 1100×750 : Accueil, Notes, Graphe et Missions. Elles ont été produites avec Vite, un Chromium local jetable et un pont IPC de **données synthétiques en lecture seule** dans le navigateur. Ces captures ne sont ni des données personnelles ni des captures de la fenêtre Tauri. Les images sous `docs/design/d5/screenshots/` appartiennent quant à elles au prototype statique antérieur. L'inspection a conduit à agrandir les nœuds et libellés du graphe et à réduire les avis techniques dans les espaces de rédaction. À 1100×750, Notes, graphe et navigation restent lisibles ; la liste textuelle offre une alternative au graphe.

Le Chromium de capture a émis un message d'échec d'enregistrement GCM de fond. Aucune navigation applicative hors loopback ni transmission de notes n'a été observée, mais ce lancement n'est pas une preuve de confinement réseau du navigateur de test. Les captures se limitent aux données synthétiques du pont temporaire et ne confèrent aucune autorité à l'application.

## Vérification manuelle restante

Sur la fixture native jetable, sélectionner `project_a`, créer un brief et deux notes, insérer le lien via le sélecteur, ouvrir le graphe, fermer la première fenêtre et retrouver les contenus dans la seconde. Sélectionner ensuite `project_b` et confirmer l'absence des documents A. Cette vérification ne doit pas être présentée comme passée avant son exécution effective.
