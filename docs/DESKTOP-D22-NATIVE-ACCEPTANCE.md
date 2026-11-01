# D22 · Acceptation interapplications

D22 conserve les autorisations D21 et le protocole VS Code 0.2.1. Il ajoute
un test d'intégration exécutable contre un VSIX **installé** dans un véritable
hôte VS Code Linux, un contrôle de réouverture du brief dans un second processus
et un point d'entrée Python qui épingle explicitement le backend D9 pour toute
la suite Desktop. Aucune nouvelle opération n'est donnée au modèle.

## Chemin réel qualifié

L'archive officielle VS Code Linux 1.140.0 déjà vérifiée en D15 a été réutilisée
depuis le cache local, sans téléchargement. Le VSIX D22 a été installé dans un
profil et un espace de travail synthétiques, isolés du profil personnel. La
confiance Workspace Trust a été accordée à ce seul espace de test. L'API VS
Code a ouvert `sample.ts` puis sélectionné réellement `D22_EDITOR_CONTEXT`
(18 octets). L'extension installée l'a transmis au Rust Gateway par socket
Unix privé. La sélection est liée à l'espace, au document, à la version, à la
session et à son SHA-256.

Le même test a autorisé `microsoft/vscode` en lecture publique, lu une page
d'issues réelle, fait choisir une issue observée par `qwen3:4b-instruct` via
Ollama local, lu cette issue exacte et obtenu un rapport citant `obs:2` et
`editor:1`. Le chemin direct Ollama `127.0.0.1:11434` a fonctionné sans relais.
Un brief synthétique a ensuite été écrit via D17 dans un Project de test,
relu avec le même UUID et la révision 1, puis transféré à un nouvel onglet
Markdown **non enregistré** dans le véritable VS Code. La déconnexion a refusé
les appels suivants. Le fichier source de test est resté inchangé.

Ce test d'intégration déclenche son écriture de fixture depuis Rust. Il ne
remplace pas les confirmations GTK du produit. La réouverture dans un autre
processus valide le DraftStore ; elle ne prouve pas à elle seule un redémarrage
et une navigation dans la fenêtre Tauri.

## Niveaux de preuve

| Niveau | Preuve D22 | Limite |
| --- | --- | --- |
| 1 · code et tests | Contrats Rust/React, tests de refus, suite Python Desktop épinglée | Les fixtures ne sont pas des applications réelles |
| 2 · intégration réelle | VSIX installé, API VS Code, sélection réelle, GitHub public, Ollama local, brief relu, onglet non enregistré | Le test pilote les appels Rust directement |
| 3 · Desktop natif | Release Tauri scellée, fenêtre Accueil 1120×780 rendue sous Xvfb avec WebKitGTK en mode logiciel | Aucun consentement GTK complet n'est déduit du niveau 2 |
| 4 · usage opérateur | Parcours dans la session WSLg personnelle | À faire volontairement par l'opérateur |

## Parcours opérateur restant

1. Lancer D22 avec le **Management home existant** et choisir un Project géré.
2. Dans VS Code Linux ou Remote-WSL, ouvrir un espace fiable à racine unique,
   installer volontairement le VSIX, exécuter « Morgoth: Connect Workspace »,
   puis associer le code dans Réglages → Connexions.
3. Sélectionner 1–1024 octets dans un `.ts`, `.js`, `.md` ou `.txt`. Dans Morgoth,
   confirmer la lecture native et vérifier le texte exact affiché.
4. Autoriser publiquement `microsoft/vscode`, sélectionner le modèle local
   déjà installé, puis confirmer l'enquête combinée dans le dialogue natif.
5. Vérifier `obs:1`, `obs:2`, `editor:1` et le rapport. Préparer un brief, relire
   sa sortie, confirmer séparément sa création et noter son UUID.
6. Fermer Morgoth, le relancer avec le même home, rouvrir le même UUID et
   vérifier la révision et le contenu. Facultativement, approuver séparément
   l'onglet VS Code non enregistré, puis déconnecter.

Ne pas utiliser de document personnel comme fixture. Les sauvegardes D8 ne
sont pas chiffrées. Aucun texte sélectionné, jeton ou prompt privé n'est
enregistré par le test D22 dans Git.

## Construire et lancer

Depuis le checkout D22 propre, avec les dépendances verrouillées :

```sh
cd /home/corio/Morgoth/dev-desktop-d22-ui/desktop
npm ci --offline
cd connectors/vscode-extension && npm ci --offline && npm run package:vsix
cd ../..
python3 scripts/build_d11.py
python3 scripts/launch_d11.py --check --home /CHEMIN/PRIVE/management
MORGOTH_DESKTOP_PLANNER_ENABLED=1 python3 scripts/launch_d11.py --home /CHEMIN/PRIVE/management
```

Mode jetable :

```sh
MORGOTH_DESKTOP_PLANNER_ENABLED=1 python3 scripts/launch_d11.py --preview
```

Le VSIX est `desktop/connectors/vscode-extension/dist/morgoth-vscode-connector-0.2.1.vsix`.
Installation volontaire dans l'hôte d'extensions Linux/Remote-WSL : dans VS
Code, « Extensions: Install from VSIX… », sélectionner ce fichier. Une
installation Windows locale seule ne rejoint pas le socket Unix WSL.
Le Desktop démarre sans Vite, Node, VS Code, GitHub ou Ollama ; Python
Management du backend épinglé reste nécessaire. L'inférence est optionnelle
et désactivée sans `MORGOTH_DESKTOP_PLANNER_ENABLED=1`.

Le smoke natif D22 a démarré la release dans un Xvfb jetable avec le
Management home et les données XDG synthétiques. La fenêtre 1120×780 a rendu
l'accueil et le contrôle de taille de texte. Une première capture vide avec
le rendu graphique par défaut a été corrigée dans **l'environnement de test**
avec `LIBGL_ALWAYS_SOFTWARE=1`, `WEBKIT_DISABLE_COMPOSITING_MODE=1` et
`WEBKIT_DISABLE_DMABUF_RENDERER=1`. Cela ne qualifie pas à lui seul les gestes
de consentement GTK ni la session WSLg personnelle.

La suite Python active se lance avec :

```sh
/home/corio/Morgoth/morgoth/.venv/bin/python desktop/scripts/check_active_desktop.py
```

Cette commande vérifie le SHA du backend D9 et découvre tous les
`desktop/scripts/test_*.py`. L'ancienne erreur d'import venait d'un autre
backend trouvé avant le checkout épinglé dans `PYTHONPATH` ; la constante
`CYCLE_FAILURE_STAGES`, importée par `desktop/scripts/finalization_evidence.py`,
existe bien dans `memory/persistent.py` du backend D9. Aucun alias runtime ni
test désactivé n'a été ajouté.
