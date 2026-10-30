# D17 — GitHub vers brief local, transfert VS Code distinct

## Utilisation

1. Sélectionner un Project géré et vérifié. Dans **Réglages → Connexions et applications → GitHub**, sélectionner exactement `propriétaire/dépôt` et autoriser la lecture publique ou privée par le dialogue natif D16.
2. Dans **Missions → Depuis GitHub**, choisir **Issue** ou **Pull request**, entrer son numéro exact, puis préparer l'aperçu. L'application relit l'élément via l'API GitHub et affiche la source, sa date, son état, sa visibilité, l'extrait borné et le Project de destination.
3. Relire et, si besoin, éditer le titre, l'objectif et les critères. **Créer ce brief local** ouvre un second dialogue natif. La lecture GitHub ne suffit pas pour autoriser cette écriture locale. Le résultat est un brouillon non soumis, accessible et modifiable dans Missions.
4. Optionnel : associer un espace VS Code Linux/Remote-WSL de confiance avec l'extension D17. Dans le reçu du workflow, prévisualiser le Markdown exact puis approuver séparément son ouverture dans un **nouvel onglet non enregistré**. Aucun fichier du workspace n'est écrit.

La description GitHub est un texte externe non fiable. Elle est copiée comme extrait attribué, jamais interprétée comme un ordre. Les critères sont une liste de revue humaine proposée par Morgoth ; ils ne sont pas attribués à l'auteur de l'issue. Un extrait tronqué est annoncé. Pour une source privée, le dialogue prévient que le contenu copié sera stocké localement et pourra figurer dans une sauvegarde D8 **non chiffrée**. Aucun jeton ne figure dans les brouillons ou reçus.

## Contrat et sécurité

- `GithubGateway::source_item` fait seulement des GET fixes `/repos/{owner}/{repo}`, `/issues/{number}` ou `/pulls/{number}`. Il revérifie l'ID numérique et le nom canonique du dépôt, la visibilité et le grant courant ; il refuse le mauvais type d'élément, les états inconnus, les réponses hors limites et les redirections. Le numéro est positif et borné. Le grant GitHub dure au plus dix minutes et reste indépendant des autres connecteurs.
- Le runner Rust conserve un **unique aperçu natif en mémoire** pendant cinq minutes. Il lie le Project, le grant, l'ID du dépôt, le type/numéro, le contenu et son empreinte. Il relit la source avant toute écriture. Un changement de source, de session ou de Project invalide l'aperçu. React ne fournit que les champs édités du brief ; il ne peut fabriquer une preuve GitHub.
- Après confirmation GTK, le runner réserve un UUID et un reçu privé, puis utilise `DraftStore::create_with_id`. Le format de brouillon D4, les révisions et la sauvegarde D8 format 1 ne changent pas. Le reçu, sans contenu intégral ni secret, est dans le répertoire de données Tauri `workflow-receipts-v1/<project>/<uuid>.json`, permissions Unix 0700/0600, écriture atomique et synchronisation. Les écritures et relectures sont Project-scopées. Une tentative répétée ne produit pas de second brief.
- Une interruption pendant la création conserve un reçu `RUNNING` ; la relecture vérifie si le brouillon réservé existe et correspond à son empreinte, sinon affiche `OUTCOME_UNCERTAIN`. Le transfert VS Code utilise les états `PENDING`, `VERIFIED`, `FAILED` ou `UNCERTAIN`. Un échec VS Code laisse le brouillon intact. Une tentative explicitement renouvelée est possible après une erreur certaine ; un résultat incertain n'est pas rejoué aveuglément.
- `VsCodeGateway::call_brief` vérifie le hash du contenu, l'identité de l'espace associé, la session de dix minutes et la réponse de l'extension. Le protocole 1 ajoute uniquement `brief_scratch` (12 000 octets maximum) ; le VSIX 0.2.0 l'ouvre par `workspace.openTextDocument` / `window.showTextDocument`, vérifie son hash et son état non enregistré. Le couplage Unix privé, l'identité du pair et la validation du paquet restent ceux de D15/D16.
- Sept commandes IPC fixes (`workflow_prepare`, `workflow_confirm`, `workflow_cancel`, `workflow_receipts`, `workflow_status`, `workflow_handoff_preview`, `workflow_handoff`) sont réservées à la fenêtre `main`. Il n'existe ni exécuteur générique ni route vers le planificateur, l'inférence ou les mutations GitHub.

## Construire et lancer

```bash
cd /home/corio/Morgoth/dev-desktop-d17-ui/desktop
npm ci --offline
cd connectors/vscode-extension && npm ci --offline && npm run package:vsix
cd /home/corio/Morgoth/dev-desktop-d17-ui
python3 desktop/scripts/build_d11.py
python3 desktop/scripts/launch_d11.py --home /CHEMIN/ABSOLU/DU/MANAGEMENT_HOME_EXISTANT --check
python3 desktop/scripts/launch_d11.py --home /CHEMIN/ABSOLU/DU/MANAGEMENT_HOME_EXISTANT
```

Prévisualisation jetable : `python3 desktop/scripts/launch_d11.py --preview`. Le lanceur vérifie le commit source, le SHA backend compatible `a91377c9ace8d70bf64aa44b3bd54773af612e3a`, le binaire, les assets et le VSIX. Il n'exige ni Vite ni Node pour ouvrir le Desktop ; Python et le backend Management épinglé restent nécessaires. Le Project normal n'est jamais remplacé par une fixture. Le VSIX D17 est `desktop/connectors/vscode-extension/dist/morgoth-vscode-connector-0.2.0.vsix`. Son installation dans le profil VS Code personnel reste volontaire ; l'extension doit s'exécuter dans un hôte Linux/Remote-WSL, pas dans un hôte Windows local.

## Limites d'acceptation

Les tests hermétiques utilisent des réponses GitHub synthétiques et des répertoires temporaires. La lecture d'un dépôt public réel, le parcours de la fenêtre Tauri et l'éditeur VS Code réel sont des preuves séparées, consignées dans le bilan final D17. Aucun dépôt privé personnel ni espace VS Code personnel n'est touché automatiquement. Le workflow prépare seulement un brief : il ne soumet pas une mission, ne modifie pas GitHub et ne lance pas d'agent. Human Gate 3 et `SAFE_FOR_WORKLOADS=False` restent inchangés.
