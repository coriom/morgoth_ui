# Desktop D11 — candidat release local Linux

## Construire une fois

Sur la branche D11 propre, avec `package-lock.json` et `Cargo.lock` épinglés :

```bash
cd /home/corio/Morgoth/dev-desktop-d11-ui
python3 desktop/scripts/build_d11.py
```

Le script appelle le CLI Tauri 2 épinglé avec `build --no-bundle --features desktop,desktop-release --ci`. La fonction `desktop-release` active le protocole natif Tauri ; le mode `desktop` conserve l'URL Vite pour le développement. Sans cette fonction, un binaire Cargo release cherchait encore `127.0.0.1:5173`. En release, l'origine sérialisée du schéma natif vaut `null` ; la navigation vérifie donc strictement son schéma `tauri` et son hôte `localhost`, ou l'origine HTTP native approuvée. Tauri exécute `npm run build`, puis intègre `desktop/dist` au binaire release `desktop/src-tauri/target/release/morgoth-desktop`. Un reçu local ignoré par Git lie le SHA-256 du binaire et de l'index d'assets au commit source. Reconstruire après tout changement de commit ou de binaire. Les dépendances GTK/WebKitGTK, Node et Rust sont nécessaires à la construction ; à l'exécution, le backend Python compatible et son environnement virtuel restent requis. Ce n'est pas un paquet public autonome.

## Lancer au quotidien

```bash
cd /home/corio/Morgoth/dev-desktop-d11-ui
python3 desktop/scripts/launch_d11.py --home /CHEMIN/ABSOLU/VERS/LE/MANAGEMENT_HOME_EXISTANT
```

Le Management home doit déjà exister et être privé. Le lanceur vérifie le reçu release, le commit source, le backend épinglé propre et Python. Il ne change ni HOME, ni XDG, ni l'identifiant Tauri `com.coriom.morgoth.projects`. Options opérateur : `--backend-root`, `--python`, `--memory-read-config /CHEMIN/PRIVE` pour la lecture structurée optionnelle, et `--check` pour un diagnostic sans fenêtre. Les chemins exécutables ne viennent jamais de React.

Prévisualisation jetable, avec données Tauri et Management temporaires :

```bash
python3 desktop/scripts/launch_d11.py --preview
```

Le lanceur exécute uniquement le binaire release. Il ne démarre pas Vite, Node, la recherche autonome ou un modèle. Le superviseur Tauri possède son enfant Management et l'arrête à la fermeture.

## Usage et sauvegarde

Sélectionner un Project vérifié, rédiger des briefs et notes, puis utiliser **Connaissances → Notes personnelles → Importer fichiers… / Importer dossier…**. Examiner les avertissements avant confirmation. Les originaux Markdown ne sont pas modifiés. Le graphe et `Ctrl+K` utilisent les notes persistées. **Réglages → Données et sauvegardes** exporte une archive D8 format 1 non chiffrée, hors données applicatives ; restaurer dans un espace personnel vide ayant le même ID Project vérifié. Les coffres backend et la mémoire PostgreSQL n'entrent pas dans cette sauvegarde.

## Portée de l'acceptation

Les tests de stockage et de transport ne prouvent pas à eux seuls les dialogues GTK. Un contrôle manuel avec données synthétiques reste requis lorsque WSLg/AT-SPI ne peut sélectionner ou confirmer un fichier. Le binaire est un candidat local de productivité, sans qualification d'agent autonome.

## Vérification du candidat (2026-10-28)

- `npm run typecheck`, `npm run contract:check`, `npm test -- --reporter=dot` (63/63) et `npm run build` : réussis.
- `cargo fmt --all --check`, `cargo test --locked --offline --features desktop --quiet` (67/67) et Clippy strict avec `desktop,desktop-release` : réussis.
- `python3 desktop/scripts/build_d11.py` : réussi avec le CLI Tauri et les assets intégrés ; `python3 desktop/scripts/launch_d11.py --preview --check` : réussi. Le binaire ELF release contient les noms des assets JavaScript et des deux polices locales. Le reçu scelle le commit, le binaire et l'index d'assets.
- Une première release a montré une page blanche. Le diagnostic a identifié deux causes réelles : absence de `tauri/custom-protocol`, puis refus de l'origine native dont la sérialisation valait `null`. La fonction `desktop-release` et la vérification exacte schéma/hôte ont corrigé ces deux défauts. La fenêtre finale rend l'application ; [capture release vide](screenshots/d11-release-empty.png).
- WSLg/XWayland : fenêtre Tauri réelle de 1120 × 780 observée, navigation Connaissances et Projects activée via AT-SPI. Un Project synthétique `d11synthetic` a été créé dans un Management home jetable, sélectionné puis retrouvé après fermeture et redémarrage de la release avec le même XDG_DATA_HOME jetable ; [capture après redémarrage](screenshots/d11-release-project-restart.png). Aucun écouteur TCP sur 5173 durant ce lancement. Le lanceur n'a exécuté ni Node ni Vite.
- L'entrée texte AT-SPI de WebKitGTK n'expose pas `EditableText` ici. Les parcours UI de création de brief/note, sélection et confirmation GTK d'import, export/restauration D8, et navigation responsive d'une contradiction D9 **ne sont pas acceptés dans la fenêtre release**. Les suites existantes valident leurs contrats Rust et React, sans remplacer une action native non observée. Aucune source PostgreSQL privée n'a été connectée.

Contrôle manuel restant, sur des données synthétiques : créer un Project, un brief et deux notes ; importer un petit dossier avec un lien `[[Note]]` et un lien ambigu ; vérifier backlink/graphe et recherche `Ctrl+K` ; exporter D8 hors données applicatives ; restaurer dans un espace vide du même Project ; redémarrer et vérifier les documents ; consulter un coffre backend synthétique et une contradiction D9 si une source de test autorisée est disponible. Ne pas utiliser des documents personnels pour qualifier cette procédure.
