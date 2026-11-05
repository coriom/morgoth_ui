# D25 · Démarrage natif et candidat d'acceptation

## Constat de départ

Le binaire scellé D24 a été relancé sur un affichage Xvfb privé avec un `HOME`,
un répertoire de données et un cache appartenant au test. Sa fenêtre
persistante est apparue en environ une seconde ; le mode jetable a fait de
même. Le contrôle D24 qui ne voyait aucune fenêtre après 30 secondes n'est
donc pas reproduit. Il employait un environnement et une recherche de titre
différents ; sa cause exacte reste indéterminée. La présence du processus
seul ne constitue pas une preuve de fenêtre utilisable.

Un essai ultérieur pendant une forte contention a produit une capture blanche
malgré `MAIN_WINDOW_CREATED` et `WEBVIEW_DOCUMENT_LOADED`, puis
`MANAGEMENT_FAILED=STARTUP_TIMEOUT`. Il ne prouve pas que ce délai explique
l'absence de fenêtre rapportée en D24. Il montre pourquoi les étapes fenêtre,
document, montage React et API prête doivent être suivies séparément.

## Diagnostics de démarrage

`launch_d11.py` vérifie toujours la source, les empreintes du binaire, des
ressources et du VSIX, le checkout backend D9, Python et le Management home
privé explicitement choisi. Sans `DISPLAY` ni `WAYLAND_DISPLAY`, le lancement
refuse avec `DISPLAY_UNAVAILABLE`. Il n'invente pas de nouveau Management home
en mode persistant. Après vérification, il émet `RELEASE_PREFLIGHT_OK`.

La release émet les phases locales suivantes, sans chemin personnel ni contenu
de WebView : `MANAGEMENT_SUPERVISOR_STARTED` après la création du processus
backend, `TAURI_SETUP_STARTED`, `MAIN_WINDOW_CREATED`,
`WEBVIEW_DOCUMENT_LOADED` après l'événement de fin de chargement du document,
et `MANAGEMENT_READY` après la vérification de l'API du processus possédé.
`FRONTEND_MOUNTED` est émis seulement après le montage de l'application React
dans la fenêtre principale. Un document WebView chargé peut encore afficher
du blanc si le front ne se monte pas ; la sonde requiert donc aussi ce signal.
Une erreur de construction Tauri produit `STARTUP_FAILED=TAURI_RUNTIME` ; une
erreur de fenêtre produit `STARTUP_FAILED=MAIN_WINDOW_CREATE`. Le superviseur
produit `MANAGEMENT_FAILED=<code fixe>`. `WEBVIEW_DOCUMENT_LOADED` atteste le
chargement du document, pas une validation visuelle de tous les contrôles React.
Une panique d'initialisation GTK lors de la construction Tauri est rattrapée,
classée `STARTUP_FAILED=GTK_BACKEND_INIT` et arrête le processus Management
possédé ; les autres paniques de construction sont classées
`STARTUP_FAILED=TAURI_RUNTIME_PANIC`. La limite de disponibilité Management
est de 30 secondes après le lancement de son processus, contre 15 auparavant.

`scripts/native_window_probe.py` lance la release scellée sur un affichage
X11 que le test déclare isolé, cherche sa fenêtre, puis attend le montage
React et la disponibilité de Management, au plus 45 secondes. Il ne rapporte
que les phases, les codes d'échec et la durée. Son répertoire de données est privé et
explicite. L'outil ne confirme aucun dialogue GTK et ne vaut pas acceptation
du profil personnel.

Un essai XTest limité dans cet affichage isolé a ouvert la vue Projets, rempli
des champs synthétiques et affiché le véritable dialogue de confirmation.
Le clic d'approbation a été envoyé, mais aucun Project créé n'a été relu dans
le catalogue : cette écriture est **non vérifiée**. Le bus AT-SPI n'était pas
accessible dans ce Xvfb. Aucun autre dialogue n'a été accepté par le test.

## Qualification de la release D25

La release scellée a passé les contrôles de reçu en modes persistant et jetable.
Dans le même Xvfb privé, le catalogue synthétique persistant a produit une
fenêtre détectée, `FRONTEND_MOUNTED` et `MANAGEMENT_READY` en 10,6 s. Le mode
jetable a produit ces mêmes preuves en 2,5 s. Un relevé X11 ponctuellement
lent est désormais réessayé jusqu'à l'échéance globale du probe. Le lancement
sans serveur d'affichage refuse avec `DISPLAY_UNAVAILABLE`.

Les tests automatiques actifs ont passé : 88 Vitest, 105 Rust (13 tests
externes ignorés), 24 Python Desktop et le test du protocole VS Code. TypeScript,
contrat Management, Vite, formatage Rust, Clippy strict, compilation VSIX et
vérification du reçu ont passé. Les vrais canaris GitHub/VS Code/Ollama de D24
restent la qualification de la boucle multi-outils ; D25 ne les a pas relancés.

| Niveau | Résultat D25 |
| --- | --- |
| 1 — tests déterministes | Réussis pour les contrôles actifs ci-dessus. |
| 2 — services et applications réels | Qualification D24 préservée ; aucun nouveau canari D25. |
| 3 — application native isolée | Fenêtre et interface montées dans les deux modes ; vue Projets et dialogue natif observés. Création du Project et brief non vérifiés. |
| 4 — session personnelle de l'opérateur | En attente. |

L'absence de fenêtre du contrôle D24 n'a pas été reproduite ; sa cause exacte
reste inconnue. Aucune création de brief approuvée depuis Tauri ni réouverture
du même UUID après redémarrage n'a été démontrée en D25. Ces gestes restent
des conditions d'acceptation, et non des résultats inférés des tests de stockage.

Un essai supplémentaire sur le WSLg courant avec données synthétiques a
atteint la création de la fenêtre. En X11, React s'est monté, mais Management
a atteint son ancienne limite de 15 secondes sous une charge système élevée ;
ce résultat a motivé la limite bornée de 30 secondes. En Wayland explicite,
GTK a refusé de s'initialiser. Ces essais ne qualifient pas à eux seuls la
session WSLg personnelle ; la cause de l'absence de fenêtre D24 reste ouverte.

## Lancement normal

Depuis `desktop/`, avec le Management home **existant** de l'opérateur :

```bash
python3 scripts/launch_d11.py --check --home /CHEMIN/EXISTANT/management
MORGOTH_DESKTOP_PLANNER_ENABLED=1 python3 scripts/launch_d11.py --home /CHEMIN/EXISTANT/management
```

L'activation du planificateur reste volontaire. Un usage sans IA peut omettre
la variable. La release ne requiert ni Vite ni Node pour s'ouvrir. Ollama, le
VSIX et GitHub sont facultatifs jusqu'à l'activation de leurs fonctions.

Exemple de vérification graphique isolée, avec un catalogue de test déjà
présent et un répertoire de données de test privé :

```bash
MORGOTH_D25_ISOLATED_DISPLAY=1 xvfb-run -a -s '-screen 0 1280x800x24' \
  python3 scripts/native_window_probe.py \
  --home /CHEMIN/TEST/management --test-root /CHEMIN/TEST/app-data
```

Remplacer `--home ...` par `--preview` pour la vérification jetable. Le mode
jetable détruit ses données à l'arrêt ; il ne valide pas une réouverture.

## Acceptation opérateur encore requise

1. Démarrer normalement avec le Management home personnel existant et
   vérifier la fenêtre, le Project et `MANAGEMENT_READY`.
2. Autoriser `microsoft/vscode` en lecture ; installer volontairement le VSIX
   `connectors/vscode-extension/dist/morgoth-vscode-connector-0.2.1.vsix`
   dans l'hôte Linux ou Remote-WSL, puis utiliser **Morgoth: Connect Workspace**.
3. Sélectionner 1 à 1024 octets dans un document de test, approuver la lecture
   native et vérifier le passage affiché.
4. Choisir le modèle local installé, comparer GitHub et la sélection, revoir
   le périmètre et approuver la session native. Vérifier les références
   `obs:N` et `editor:1` du rapport ; essayer Stop pendant une opération.
5. Préparer le brief, approuver séparément l'écriture native, relever son UUID
   et sa révision, fermer Morgoth, relancer avec le même home et rouvrir cet
   UUID. Le transfert facultatif vers un onglet VS Code non enregistré exige
   encore une approbation distincte.

La qualification D24 des lectures réelles GitHub, VS Code et Ollama reste
distincte de ces gestes natifs. Une acceptation personnelle exige que
l'opérateur les exécute effectivement. `SAFE_FOR_WORKLOADS=False` et Human
Gate 3 restent inchangés.
