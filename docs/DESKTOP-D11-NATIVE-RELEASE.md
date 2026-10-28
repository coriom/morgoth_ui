# Desktop D11 — candidat release local Linux

## Construire une fois

Sur la branche D11 propre, avec `package-lock.json` et `Cargo.lock` épinglés :

```bash
cd /home/corio/Morgoth/dev-desktop-d11-ui
python3 desktop/scripts/build_d11.py
```

Le script appelle le CLI Tauri 2 épinglé avec `build --no-bundle --features desktop,desktop-release --ci`. La fonction `desktop-release` active le protocole natif Tauri ; le mode `desktop` conserve l'URL Vite pour le développement. Sans cette fonction, un binaire Cargo release cherchait encore `127.0.0.1:5173` et montrait une fenêtre blanche. Tauri exécute `npm run build`, puis intègre `desktop/dist` au binaire release `desktop/src-tauri/target/release/morgoth-desktop`. Un reçu local ignoré par Git lie le SHA-256 du binaire et de l'index d'assets au commit source. Reconstruire après tout changement de commit ou de binaire. Les dépendances GTK/WebKitGTK, Node et Rust sont nécessaires à la construction ; à l'exécution, le backend Python compatible et son environnement virtuel restent requis. Ce n'est pas un paquet public autonome.

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
