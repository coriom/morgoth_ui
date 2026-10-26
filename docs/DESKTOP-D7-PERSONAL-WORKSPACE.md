# D7 — espace personnel persistant

## Ce qui fonctionne

Le Desktop expose une création **explicite** de Project géré. L’interface lit les
Domaines installés via Management, demande l’identifiant et le nom, puis une
confirmation humaine avant un unique `POST /management/v1/projects`. Rust
valide les trois champs, vérifie le Domaine dans le catalogue et n’expose que
le résultat sans chemins ni namespaces internes. Après le reçu durable, le
Desktop relit le catalogue ; l’utilisateur choisit alors le Project créé.
Un résultat de POST incertain bloque tout nouvel envoi depuis le formulaire et
invite à consulter le catalogue. Aucun démarrage de moteur, initialisation du
stockage agent, mission, approbation ou appel modèle n’est associé à ce flux.

Les briefs D4, notes Markdown D5, liens, rétroliens, graphe et préférence de
Project gardent exactement les mêmes stockages locaux et l’identifiant Tauri
`com.coriom.morgoth.projects`. Le lecteur D6 du coffre backend reste authentifié,
borné et en lecture seule. Un coffre géré réellement vide affiche « Coffre
vide » ; le Project historique `default` n’est pas une source D6 admissible.
L’absence d’Ollama n’empêche pas l’espace personnel.

## Lancement normal en un terminal

Préparer une fois les dépendances existantes du Desktop (`npm ci --offline`
dans `desktop/` si `node_modules` manque) et les prérequis Linux Tauri. Le
lanceur vérifie et compile incrémentalement le binaire natif hors ligne.
Depuis la branche D7 :

```bash
cd /home/corio/Morgoth/dev-desktop-d7-ui
/home/corio/Morgoth/morgoth/.venv/bin/python desktop/scripts/launch_d7.py --home /home/corio/Morgoth/personal-management
```

Le chemin Management est **explicite et stable** entre les lancements. Il est
créé en mode privé s’il n’existe pas ; un chemin relatif, symlink, autre
propriétaire ou mode permissif est refusé. Pour réutiliser un catalogue
préexistant, passer son chemin existant et privé. Le lanceur ne choisit pas
silencieusement un autre HOME. Les données Tauri personnelles restent dans
le répertoire d’application défini par l’OS ; `HOME` et `XDG_DATA_HOME` ne sont
pas remplacés en mode normal. Le lanceur possède Vite, lance la vraie fenêtre
Tauri et nettoie ses propres processus à la sortie. Le backend Management est
possédé et arrêté par le superviseur natif. Aucun service global ni autostart
n’est installé.

Prévisualisation séparée, entièrement jetable et initialement vide :

```bash
cd /home/corio/Morgoth/dev-desktop-d7-ui
/home/corio/Morgoth/morgoth/.venv/bin/python desktop/scripts/launch_d7.py --preview
```

Le mode preview utilise aussi un `HOME` et un `XDG_DATA_HOME` temporaires.
Il ne montre pas de données personnelles et disparaît à la fermeture.

## Portabilité des notes

Les notes restent des fichiers Markdown lisibles dans le stockage local D5.
La commande native fixe « Exporter Markdown » copie **une note déjà
enregistrée** vers le dossier privé `note-exports-v1/<project>/` du répertoire
local de l’application, sous le nom `<note-id>-r<révision>.md`. Le Desktop
affiche le chemin précis de la copie. Le fichier contient le Markdown original
sans exécuter son contenu. L’opération refuse un export existant, les symlinks,
les mauvais droits et les lectures hors Project ; elle ne modifie pas la note.
L’emplacement n’est pas choisi librement par la WebView. Un sélecteur natif
d’export et l’import depuis un fichier utilisateur ne sont pas encore
disponibles : ils demandent un contrat de permission supplémentaire revu.

## Vérification et limites

Sur la branche D7, `npm run typecheck`, `npm run contract:check`, `npm test`
(51/51), `npm run build`, `cargo fmt --check`, `cargo test --lib` (32/32),
Clippy strict et les deux binaires natifs passent. Les trois tests du lanceur
passent. Le smoke jetable
`desktop/scripts/d7_personal_smoke.py` exerce le vrai POST authentifié,
la relecture après redémarrage du superviseur, le coffre vide et les stores
de briefs/notes rouverts avec séparation de Projects, plus une copie exportée.
Il ne remplace pas une saisie complète dans la WebView. Les captures sous
`docs/screenshots/d7-native/` montrent la vraie fenêtre Tauri à 1120×780,
ouverte deux fois via le lanceur avec données jetables. L’arbre AT-SPI confirme
la navigation et les deux champs, mais ne fournit pas d’interface EditableText
pour leur saisie ; le flux utilisateur complet demeure à confirmer manuellement.

Contrôle manuel restant : ouvrir D7 normalement, créer un Project, le
sélectionner, enregistrer un brief et deux notes liées, fermer/réouvrir,
vérifier le graphe et les données, puis sélectionner un autre Project.
Aucune étape n’exige Ollama. Ne pas interpréter le lecteur historique
`morgoth_test` comme une mission de production.

Le backend reste épinglé à `3f18a375453af0c8efe2586440b3e8612707c6f2` ;
aucune modification backend n’a été nécessaire. `SAFE_FOR_WORKLOADS=False`
et Human Gate 3 demeurent en vigueur.
