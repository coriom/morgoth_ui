# D5 — vérification du design prototype

## Source et portée

Base exacte : Desktop D4 `4a3474312724f2028d61b88f3d02188dbef66d37`. Branche de design `design/morgoth-desktop-d5-minimal-workspace-v1`. Tous les changements de cette phase sont des documents et un prototype statique ; les répertoires de production `desktop/src` et `desktop/src-tauri` n'ont pas été modifiés. Le prototype ne permet ni l'accès à l'application Tauri, ni une écriture de brouillon D4, ni une requête Ollama ou backend.

## Contrôles exécutés

| Contrôle | Commande | Résultat |
| --- | --- | --- |
| Syntaxe JS | `node --check docs/design/d5/prototype/app.js` | PASS, sortie 0 |
| Navigation interactive en Chromium installé | `D5_CHROMIUM=/home/corio/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell node docs/design/d5/prototype/verify.mjs` | PASS : Accueil, Missions, garde des modifications, Notes, identité notes/graphe, graphe local, nouvelle note en mémoire, palette, marqueur de données fictives |
| Rendu local | Chromium headless avec `--window-size=1440,900` et `1100,750`, huit captures `file://` | PASS : quatre écrans inspectés aux deux tailles ; correction du titre de brief tronqué à 1100 px puis captures régénérées |
| Contraste indicatif | calcul WCAG sur couleurs opaques de base | texte principal/fond : 15,15:1 ; secondaire/fond : 7,03:1 ; métadonnée/barre latérale : 5,19:1 après correction |

Le premier lancement headless dans le sandbox d'outils a échoué avec `Operation not permitted` au niveau du sandbox Chromium. Le même rendu local, sans requête externe, a réussi dans le contexte autorisé. Le test utilise `--no-sandbox` **uniquement pour la maquette statique headless** ; il ne modifie pas Tauri ou le navigateur de Morgoth. Aucune fenêtre Tauri native D5 n'a été lancée. Les captures ne prouvent donc ni intégration native ni accessibilité lecteur d'écran.

Les captures PNG sont des artefacts de design inspectables, pas des données produit. Les vues Projets et Réglages sont navigables dans le prototype mais de fidélité moindre ; elles ne sont pas des écrans de production. Les interactions de création et sauvegarde sont des simulations en mémoire. Les commandes complètes de captures et la procédure de lecture figurent dans `prototype/README.md` et les fichiers `screenshots/`.

## Vérifications à faire lors de l'implémentation D5

Tests React/Rust/contrats, build Tauri, migration sans perte des drafts, stockage de notes, isolation Project, clavier et lecteur d'écran natifs, qualité du graphe sur un ensemble réel borné et contrastes en états survol/désactivé. Aucun de ces contrôles de production ne doit être déduit de la présente maquette.
