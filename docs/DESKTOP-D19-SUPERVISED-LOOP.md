# D19 — Exécution GitHub supervisée

## Utilisation

1. Choisir un Project géré et vérifié. Dans **Réglages → Connexions et applications → GitHub**, autoriser explicitement un seul dépôt (public sans jeton, privé avec le jeton de session de D16).
2. Lancer Morgoth avec `MORGOTH_DESKTOP_PLANNER_ENABLED=1`, puis ouvrir **Missions → Assistant → Exécution supervisée**. Choisir un modèle Ollama déjà installé, saisir l'objectif et lire le contexte exact du premier tour.
3. **Prévoir la session**, puis confirmer dans le dialogue natif son Project, son dépôt, son modèle, son empreinte de contexte, ses trois lectures et ses trois tours maximum. La durée est de dix minutes. Cette confirmation n'autorise aucune écriture.
4. **Lancer le premier tour**. Le modèle choisit entre un aperçu du dépôt et la liste bornée de ses issues. Rust vérifie la proposition et lit le dépôt par le connecteur GitHub existant. L'observation contient la source, l'heure, une empreinte et une indication de troncature. **Poursuivre un tour** remet la preuve au modèle : après une liste, il peut lire une issue effectivement observée ; après un aperçu seul, il doit conclure. L'utilisateur peut arrêter et révoquer à tout moment.
5. Une conclusion valide cite uniquement les observations natives. **Préparer un brief local** montre un texte modifiable. L'écriture demande un **second accord natif** et passe par le DraftStore. Si une issue précise a été lue, l'Assistant ouvre plutôt l'aperçu D17 : D17 relit l'issue et exige son propre accord avant la création. Un transfert VS Code reste un troisième acte, avec l'accord D17 distinct.

La proposition du modèle, le résultat du connecteur, l'interprétation et le brief approuvé sont visuellement séparés. Aucun agent de recherche n'est démarré. `SAFE_FOR_WORKLOADS=False` et Human Gate 3 ne changent pas.

## Autorité et persistance

Neuf commandes IPC fixes, réservées à la fenêtre principale, portent le nouveau parcours. Le Project doit être présent dans le catalogue Management et correspondre à la préférence courante. Le dépôt doit garder le même nom canonique, identifiant numérique et grant GitHub. Le modèle ne reçoit ni jeton, ni URL API libre, ni objet connecteur. Ses sorties JSON sont fermées puis revalidées en Rust. Seuls `REPOSITORY_OVERVIEW`, `LIST_ISSUES` et `READ_ISSUE` (numéro issu de la liste vérifiée) mènent à des appels GET prédéfinis. Un refus, une expiration, un changement de Project/dépôt, un budget dépassé ou une réponse incompatible arrêtent la session sans repli automatique.

Les preuves portent des références `obs:N` créées côté natif. Les descriptions d'issues sont des données non fiables. Les reçus privés du Project retiennent l'identité de session, les classes d'opérations tentées, les empreintes d'observation, l'état et un éventuel UUID de brief ; ils ne retiennent pas les corps GitHub, les prompts ou les jetons. Une session ne reprend pas après redémarrage : un reçu incomplet apparaît comme interrompu. Le brief créé est un document D4 ordinaire, inclus dans les backups D8 non chiffrés. Un UUID réservé et une lecture avant création rendent une nouvelle tentative d'adoption locale idempotente.

L'annulation abandonne la requête HTTP côté Desktop, mais ne prouve pas que le calcul déjà lancé dans Ollama s'est arrêté immédiatement. Une lecture GitHub déjà engagée peut finir après un clic Arrêter ; son résultat est alors écarté et aucune continuation n'est lancée. Le connecteur GitHub reste indépendant et révocable. Aucun outil Windows, navigateur, MCP ou VS Code n'est confié au modèle.

## Build et lancement

Prérequis : Linux/WSLg avec les dépendances Tauri 2 existantes, Node et Rust **pour construire**, le backend Python épinglé `a91377c9ace8d70bf64aa44b3bd54773af612e3a`, un venv Python compatible et un Management home privé **déjà existant** pour l'usage persistant. Ollama local est facultatif pour ouvrir Morgoth ; un modèle déjà installé est nécessaire seulement pour la session supervisée. Aucun téléchargement automatique.

```sh
cd /home/corio/Morgoth/dev-desktop-d19-ui/desktop
npm ci --offline
cd connectors/vscode-extension && npm ci --offline && cd ../..
cd src-tauri && cargo test --offline --locked --features desktop,desktop-release && cd ..
cd ..
python3 desktop/scripts/build_d11.py
```

```sh
cd /home/corio/Morgoth/dev-desktop-d19-ui
MORGOTH_DESKTOP_PLANNER_ENABLED=1 python3 desktop/scripts/launch_d11.py \
  --home /chemin/absolu/vers/management \
  --backend-root /chemin/absolu/vers/backend-pinne \
  --python /chemin/absolu/vers/venv/bin/python
```

Sans Assistant, retirer `MORGOTH_DESKTOP_PLANNER_ENABLED=1`. Aperçu jetable séparé :

```sh
python3 desktop/scripts/launch_d11.py --preview
```

Le lanceur vérifie branche, source, binaire, frontend, VSIX, backend et répertoires. La release embarque les assets : aucun Vite, Node ni recompilation au démarrage. Le backend Management Python reste requis. Le test de modèle réel est explicitement opt-in et ne crée aucun document :

```sh
cd desktop/src-tauri
D19_ALLOW_LIVE_CANARY=1 MORGOTH_DESKTOP_OLLAMA_PORT=11436 \
  cargo test --offline --locked --lib supervised_loop::tests::real_model_selects_public_github_read -- --ignored --nocapture
```

Il utilise un Ollama déjà démarré sur le port local indiqué et lit uniquement le dépôt public `microsoft/vscode`. Les tests de fixture ne valent ni accès à un Project privé, ni validation d'une approbation GTK réelle. L'adoption native, la réouverture après redémarrage et le transfert VS Code nécessitent une acceptation opérateur si l'automatisation de la fenêtre ne peut pas manipuler les dialogues de façon fiable.
