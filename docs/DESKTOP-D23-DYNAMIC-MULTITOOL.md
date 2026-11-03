# D23 · Recherche multi-outils bornée

Le mode « Recherche multi-outils · choix du modèle » est accessible dans Missions → Assistant lorsque le lanceur active explicitement le planificateur local. Il conserve les recettes guidées D20 et D21. Le modèle local propose une opération JSON ; Rust vérifie la proposition, le Project, le dépôt, les autorisations, les numéros d'issue observés et les budgets avant tout appel.

Opérations autorisées : `REPOSITORY_OVERVIEW`, `LIST_ISSUES`, `READ_ISSUE` pour un numéro déjà observé, une seule `VSCODE_READ_APPROVED_SELECTION`, `FINAL` et `STOP`. L'éditeur n'est disponible que si l'utilisateur a d'abord sélectionné et autorisé un passage dans un VS Code appairé. L'aperçu initial ne transmet que son identité relative, sa version et son empreinte ; le texte n'arrive au modèle que si celui-ci demande cette lecture et que Rust revalide la même session, le même document, la même version et les mêmes octets auprès de l'extension réelle.

La confirmation GTK couvre un seul Project, un seul dépôt GitHub déjà autorisé, le modèle choisi, au plus trois lectures GitHub, une lecture VS Code, quatre tours d'inférence et dix minutes. Aucune écriture n'est incluse. L'IPC natif sépare la création rapide de la session de son exécution : l'interface reçoit l'UUID et peut envoyer Stop pendant le premier appel Ollama ou GitHub. La réponse en vol peut finir, mais Rust refuse alors toute lecture suivante. Aucune session ne reprend après redémarrage.

Les références `obs:N` et `editor:1` sont attribuées par Rust. Le rapport final doit citer une référence existante. Une issue GitHub reste une déclaration externe et un passage sélectionné ne démontre pas une causalité. Le brief local reste une écriture distincte : lorsqu'une issue exacte a été lue, sa création passe par la revalidation D17 et une autre confirmation native. Le transfert vers un onglet VS Code non enregistré conserve son consentement séparé.

## Qualification au 3 novembre 2026

- Contrats et annulations : 88 tests Vitest, 104 tests Rust actifs, 22 tests Python Desktop et un test d'extension passent. Treize tests Rust à prérequis externes restent ignorés par la suite ordinaire. Typage, contrat Management, Vite, formatage et Clippy strict passent. La suite Rust doit disposer des sockets loopback locaux ; dans le bac à sable réseau restreint, un test du superviseur échoue et un test GitHub local attend indéfiniment.
- Hôte réel : le VSIX 0.2.1 a été installé dans un profil VS Code Linux 1.140.0 isolé ; Workspace Trust et la sélection synthétique `D22_EDITOR_CONTEXT` ont été vérifiés. Les canaris ont établi une connexion réelle à cet hôte et au dépôt public `microsoft/vscode`.
- Modèle réel : plusieurs générations de `qwen3:4b-instruct` ont demandé de vraies lectures GitHub, notamment `LIST_ISSUES` et `READ_ISSUE` sur des numéros observés. Les réponses incohérentes ont été refusées par Rust ; la dernière génération a dépassé 120 secondes. Aucun canari n'a terminé avec une demande du modèle pour **les deux familles** et un rapport final validé. Cette acceptation reste **NON QUALIFIÉE**. Les essais ont motivé un schéma d'action plus court et l'interdiction de répéter une lecture déjà observée, mais ces corrections finales ne doivent pas être présentées comme un canari positif.
- Fenêtre native : le contrôle Stop précoce est couvert par le test Rust et le test React, pas par un consentement GTK de l'opérateur. L'acceptation dans sa session WSLg personnelle demeure `OPERATOR_ACCEPTANCE_PENDING`.

## Parcours opérateur restant

1. Lancer la release D23 avec le Management home existant et `MORGOTH_DESKTOP_PLANNER_ENABLED=1` ; sélectionner un Project géré.
2. Autoriser un dépôt public dans Réglages → Connexions → GitHub. Facultativement, appairer le VSIX dans un hôte Linux/Remote-WSL fiable, sélectionner 1–1024 octets, puis approuver la capture native.
3. Dans Missions → Assistant, choisir le modèle local installé, « Recherche multi-outils », saisir l'objectif, vérifier l'aperçu et autoriser la session dans le dialogue GTK.
4. Vérifier les opérations réellement choisies, les observations et le rapport. Tester Stop pendant une première inférence sur un Project de test.
5. Préparer puis approuver séparément le brief, noter son UUID, fermer et relancer Morgoth avec le même home, puis rouvrir l'UUID. Transférer vers VS Code seulement après un troisième consentement distinct.

Ce parcours dans la session WSLg personnelle demeure `OPERATOR_ACCEPTANCE_PENDING` tant qu'il n'est pas effectué volontairement. Les tests Rust et l'hôte VS Code isolé ne valent pas confirmation GTK de l'utilisateur.

## Construire et lancer

```sh
cd /home/corio/Morgoth/dev-desktop-d23-ui/desktop
python3 scripts/build_d11.py
python3 scripts/launch_d11.py --check --home /CHEMIN/PRIVE/management
MORGOTH_DESKTOP_PLANNER_ENABLED=1 python3 scripts/launch_d11.py --home /CHEMIN/PRIVE/management
```

Mode de prévisualisation jetable : `MORGOTH_DESKTOP_PLANNER_ENABLED=1 python3 scripts/launch_d11.py --preview`. Le VSIX est `connectors/vscode-extension/dist/morgoth-vscode-connector-0.2.1.vsix`. Il doit être installé volontairement dans l'hôte d'extensions Linux ou Remote-WSL, jamais dans le profil personnel par le build. Le lancement normal ne démarre ni Node, ni VS Code, ni Ollama. Ollama et les connecteurs restent optionnels. `SAFE_FOR_WORKLOADS=False` et Human Gate 3 ne changent pas.
