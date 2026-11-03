# D24 · Qualification du raisonnement multi-outils

D24 conserve le périmètre exécutable du mode dynamique : lectures GET du dépôt GitHub déjà autorisé et lecture unique de la sélection VS Code approuvée. Le modèle local propose ; Rust vérifie le Project, les deux sessions, le document, les numéros d'issues observés, les budgets et les références de preuve. Les écritures locales et le transfert vers VS Code suivent toujours les consentements D17 distincts.

## Correction du blocage D23

Le contrat D23 mélangeait une proposition d'action et un rapport final dans un même objet. Il laissait consommer des tours sur une lecture GitHub redondante avant la lecture éditeur et allouait jusqu'à 500 tokens même pour un choix d'action. Une réponse JSON valide pouvait être rejetée pour incohérence entre `decision`, `operation` et champs du rapport. Le canari D23 avait aussi rencontré une génération de plus de 120 secondes ; son origine exacte (chargement, contention ou génération) n'avait pas été mesurée par étape.

D24 utilise deux objets stricts : `ToolActionProposalV1` pour une lecture et `FinalEvidenceReportV1` pour la conclusion. Les schémas sont construits à partir des opérations réellement admissibles. Le but de preuve choisi dans l'aperçu fixe les actions nécessaires : comparaison GitHub/éditeur, comparaison issue/éditeur, ou exploration. Le tour final est réservé mathématiquement : si les lectures manquantes plus un rapport dépassent les tours restants, la session s'arrête avec `INSUFFICIENT_BUDGET`. Une comparaison d'issue exclut l'aperçu du dépôt qui ne contribue pas à son but. La lecture peut commencer par GitHub ou VS Code ; lorsqu'il ne reste qu'une opération admissible, l'interface indique un choix contraint par la politique. Le modèle peut répondre `STOP` en exploration libre ; dans une comparaison à preuves obligatoires, le schéma ne propose que les lectures nécessaires. Le contrôle Stop de l'utilisateur reste disponible à chaque étape.

Le fournisseur Ollama observé est `0.20.6`, avec le modèle installé `qwen3:4b-instruct`. D24 borne l'action à `num_predict=160`, le rapport à 560, `num_ctx=2048`, `temperature=0`, `think=false`, `keep_alive=2m` et conserve la limite HTTP de 120 secondes. La vue de session ne conserve que les durées et comptes de tokens/octets, sans prompt ni sélection dans les reçus. Le service et le modèle restent facultatifs, sans téléchargement ni démarrage automatique.

## Acceptation réelle isolée

Le VSIX `0.2.1` a été construit à partir de D24 et installé dans un profil jetable du VS Code Linux officiel `1.140.0`. Le document synthétique réel `sample.ts` contient la sélection `D22_EDITOR_CONTEXT`. La sélection a été lue par l'API de l'extension installée, la socket Unix privée et le gateway Rust ; le fichier source est resté inchangé. GitHub a été consulté sur le dépôt public `microsoft/vscode`. Le modèle a émis lui-même les décisions d'opération ; aucun résultat éditeur n'a été préchargé comme observation.

| Canari | Opérations demandées par le modèle | Résultat | Durée du runner |
| --- | --- | --- | --- |
| A, comparaison simple | `VSCODE_READ_APPROVED_SELECTION`, puis `LIST_ISSUES` | Rapport validé citant `editor:1` et `obs:1` ; 3 tours | 24 s sur le code final |
| B, issue précise | `VSCODE_READ_APPROVED_SELECTION`, `LIST_ISSUES`, `READ_ISSUE` pour un numéro observé | Rapport validé citant `editor:1` et l'issue exacte `obs:2` ; 4 tours | 121 s sur le code final, dont 52 s de chargement initial Ollama |

Dans les deux cas, la première décision était libre entre au moins deux familles admissibles. Les choix suivants ont été contraints par les preuves encore requises. Le canari B final a consulté une issue publique `microsoft/vscode` dont le numéro provenait de la liste en direct ; aucun numéro n'est codé dans l'implémentation. Un rapport valide atteste la consultation des données et la citation des références attribuées par Rust ; il ne prouve ni causalité entre le code synthétique et l'issue ni correction du défaut. Après déconnexion, les appels sont refusés. Le canari A final a pris 4, 2 et 15 secondes pour ses inférences. Le B final a pris 70, 6, 4 et 30 secondes : le premier appel incluait 52 secondes de chargement, et le rapport a produit 447 tokens. Ces mesures montrent une forte variabilité sous contention malgré les mêmes limites ; elles ne garantissent pas les durées futures.

Les tests déterministes vérifient séparément les schémas, références inventées, budgets, refus de lecture et Stop. Les tests Stop utilisent des serveurs loopback de fixture, pas GitHub ni VS Code réels.

La suite active finale compte 88 tests Vitest, 105 tests Rust, 22 tests Python Desktop et un test de protocole VS Code réussis ; 13 tests Rust à prérequis externes restent ignorés par défaut. TypeScript, contrat Management, Vite, `cargo fmt` et Clippy strict passent. Les canaris réels A et B sont exécutés explicitement en plus de cette suite hermétique. Aucun test n'a écrit dans un Project personnel ou le profil VS Code habituel.

Pendant la correction, une tentative s'est arrêtée avec `MODEL_UNAVAILABLE` avant toute lecture ; les trois routes de métadonnées locales répondaient ensuite en 200. Une autre a montré qu'offrir `STOP` au premier tour d'une comparaison permettait au modèle de terminer sans preuve. Une troisième a refusé la troisième action avec `ACTION_REFUSED` ; son schéma permettait alors zéro même quand seule la lecture d'une issue observée restait admissible. Une quatrième a réellement lu les trois sources mais n'a pas accepté la réponse finale du fournisseur avec une limite de 420 tokens ; le canari final a produit 447 tokens sous la nouvelle borne de 560. Aucun de ces essais refusés n'est compté comme réussite. Leurs catégories et métriques restent disponibles dans le dossier de test isolé ; la cause exacte du timeout D23 n'est pas démontrée.

## Acceptation opérateur

Le canari réel est un test d'intégration de niveau 2 sous profil VS Code isolé et Project synthétique. Il ne constitue pas une confirmation GTK par l'opérateur dans sa session WSLg. `D24_OPERATOR_ACCEPTANCE=PENDING` jusqu'au parcours volontaire complet.

Parcours bref : démarrer la release avec le Management home existant et `MORGOTH_DESKTOP_PLANNER_ENABLED=1`, autoriser un dépôt public dans Connexions, appairer le VSIX dans l'hôte Linux/Remote-WSL, sélectionner 1 à 1024 octets puis approuver la capture. Dans Missions → Assistant → Recherche multi-outils, choisir les preuves requises, vérifier l'aperçu et approuver la session GTK. Observer les lectures et le rapport ; essayer Stop au besoin. Un brief ou un transfert VS Code exige chacun un consentement natif séparé. Ne pas installer le VSIX dans le profil personnel automatiquement.

```sh
cd /home/corio/Morgoth/dev-desktop-d24-ui/desktop
python3 scripts/build_d11.py
python3 scripts/launch_d11.py --check --home /CHEMIN/PRIVE/management
MORGOTH_DESKTOP_PLANNER_ENABLED=1 python3 scripts/launch_d11.py --home /CHEMIN/PRIVE/management
```

Prévisualisation jetable : `MORGOTH_DESKTOP_PLANNER_ENABLED=1 python3 scripts/launch_d11.py --preview`. Le VSIX facultatif est `connectors/vscode-extension/dist/morgoth-vscode-connector-0.2.1.vsix`. Aucune session ne reprend après redémarrage. `SAFE_FOR_WORKLOADS=False`, Human Gate 3 et le backend D9 restent inchangés.
