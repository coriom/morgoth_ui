# D18 — Assistant de planification locale

## Usage et portée

Dans **Missions → Assistant**, choisir un Project géré et vérifié, saisir un
objectif et, facultativement, sélectionner **un** brief du même Project ou le
numéro exact d'une issue/PR du dépôt GitHub déjà autorisé. L'Assistant montre
le texte exact transmis à Ollama, le modèle, la provenance et le caractère
privé de la source. Une confirmation native distincte autorise une seule
inférence. Le plan affiché est une **proposition**, jamais un travail accompli.
Le modèle est choisi explicitement dans la liste observée ; aucun modèle n'est
présélectionné. L'état `STARTING` du Management est relu automatiquement au
démarrage jusqu'à disponibilité ou échec, sans lancer de recherche.

L'opérateur active ce chemin séparé uniquement pour la session de lancement :

```sh
MORGOTH_DESKTOP_PLANNER_ENABLED=1 \
  python3 desktop/scripts/launch_d11.py --home /chemin/absolu/vers/management \
  --backend-root /chemin/absolu/vers/backend-pinne \
  --python /chemin/absolu/vers/venv/bin/python
```

Ollama doit déjà écouter sur `127.0.0.1:11434` avec un modèle déjà installé.
Un port local différent peut être fourni par l'opérateur avec
`MORGOTH_DESKTOP_OLLAMA_PORT`; l'hôte reste fixé à `127.0.0.1`. Aucune commande
de téléchargement ou de démarrage d'Ollama n'est lancée par Morgoth. Sans
`MORGOTH_DESKTOP_PLANNER_ENABLED=1`, l'Assistant reste inactif et les workflows
D17 restent disponibles. Le lancement de Morgoth ne requiert ni Ollama, ni
Vite, ni Node. Le modèle et le contenu de chaque requête restent locaux dans
ce chemin qualifié ; ne pas sélectionner de source privée sans avoir lu
l'aperçu. Le modèle Ollama lui-même est un processus local indépendant, dont
les protections système doivent être administrées par l'opérateur.

## Contrat natif

`mission_planner.rs` n'expose que sept commandes IPC fixes, limitées à la
fenêtre principale : état, préparation, génération, annulation, rejet,
adoption locale et transfert vers un aperçu D17. Le Project est revérifié
contre le catalogue Management et la préférence avant l'inférence et toute
écriture. Le choix du modèle est limité à la liste Ollama observée. Une marge
mémoire de 1 GiB en plus de la taille installée est exigée. La requête est
envoyée par HTTP local sans proxy ni redirection, avec délai de connexion de
2 s, délai total de 120 s, contexte et sortie bornés. Une seule génération
est active. L'annulation invalide l'état et abandonne la requête HTTP ; elle
ne prouve pas l'arrêt immédiat d'un calcul déjà engagé dans Ollama.

Le format Ollama utilise un schéma JSON fermé. Le parseur Rust le valide à
nouveau : version 1, catégories sémantiques autorisées, 1–8 étapes, tailles
bornées, références uniquement aux sources natives sélectionnées. Une réponse
incorrecte est rejetée sans écriture ni exécution. Les descriptions de
GitHub, les briefs locaux et le texte du modèle sont des données non fiables.
Le modèle ne détient aucun objet connecteur, jeton GitHub, commande système,
accès fichier, ou autorité de recherche autonome.

Les propositions et leur contexte sont **éphémères** et perdus au redémarrage.
Le brief adopté utilise le DraftStore D4 et est sauvegardé par D8 ; l'archive
D8 reste non chiffrée. Une adoption générique exige une nouvelle confirmation
native. Une proposition basée sur GitHub ouvre l'aperçu du workflow D17 :
celui-ci relit la source, vérifie le dépôt, la fraîcheur et le Project, puis
demande sa propre confirmation native avant de créer le brief. Un éventuel
transfert vers VS Code continue d'exiger l'association et l'accord distincts
de D17 ; aucun fichier source n'est édité automatiquement.

## Reproduction et qualification

Depuis `desktop/` :

```sh
npm ci --offline
npm run typecheck
npm run contract:check
npm test
npm run build
cd src-tauri
cargo fmt --all -- --check
cargo test --offline --locked
cargo clippy --offline --locked --all-targets --features desktop,desktop-release -- -D warnings
cd ..
python3 scripts/build_d11.py
python3 scripts/launch_d11.py --preview --check
```

Pour le canari de modèle réel, démarrer séparément Ollama sur le port de test
`11436` avec le modèle **déjà présent** `qwen3:4b-instruct`, puis exécuter
`D18_ALLOW_LIVE_CANARY=1 cargo test --offline --lib
mission_planner::tests::real_installed_model_proposes_without_side_effects
-- --ignored --nocapture` depuis `desktop/src-tauri`. Le test emploie un
objectif synthétique, exige une sortie native validée et vérifie qu'aucun
brief n'a été créé. Il ne qualifie ni les autres modèles, ni une approbation
GTK dans la fenêtre Tauri. La qualité d'un plan reste à évaluer par l'humain.

## Limites

- La génération peut être indisponible si Ollama, le modèle ou la mémoire
  manquent. Morgoth n'effectue aucun repli sur un fournisseur distant.
- Les propositions ne sont pas une preuve de vérification ni une instruction
  exécutable. Les catégories de pas n'appellent aucun outil.
- Une source GitHub doit rester autorisée et inchangée pour l'adoption D17.
- `SAFE_FOR_WORKLOADS=False`, Human Gate 3 et le backend autonome restent
  inchangés. Aucun modèle ne peut autoriser ses propres actions.
