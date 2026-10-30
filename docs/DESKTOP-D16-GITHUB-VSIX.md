# D16 — dépôt GitHub choisi et VSIX VS Code

## Portée

Le connecteur GitHub lit **un dépôt explicitement choisi** par son nom `propriétaire/dépôt`. Il passe par six commandes Tauri fixes, le client Rust natif et `https://api.github.com`. Il n'utilise ni le navigateur, ni `gh auth`, ni les clés SSH, ni les identifiants de ChatGPT. Il n'est relié à aucun planificateur ni modèle. Les autres connecteurs conservent leurs sessions et autorisations distinctes.

1. Dans **Réglages → Connexions et applications → GitHub**, saisir `propriétaire/dépôt` puis **Sélectionner**. La sélection seule n'autorise pas la lecture.
2. **Vérifier le dépôt public** obtient son identité sans session. Pour un dépôt privé, cette prévisualisation publique peut renvoyer « introuvable ou privé ».
3. Choisir **Autoriser la lecture publique** ou **Jeton privé dans un dialogue natif**. Une confirmation GTK porte sur le dépôt exact. Le jeton privé est saisi dans un champ GTK masqué, transmis uniquement au client Rust, gardé en mémoire pendant au plus dix minutes et effacé lors de la déconnexion ou de l'expiration. Il n'entre ni dans React, ni dans la ligne de commande, ni dans une sauvegarde D8.
4. Consulter les vues bornées, puis **Déconnecter**. Changer de dépôt révoque la session courante et exige une nouvelle autorisation.

Pour un jeton GitHub à granularité fine, restreindre **Repository access** au seul dépôt choisi et accorder seulement Metadata (lecture), Contents (lecture pour branches/commits), Issues (lecture) et Pull requests (lecture). Les réponses de l'API établissent l'accès effectif à une opération ; Morgoth ne prétend pas vérifier cryptographiquement les permissions côté GitHub. Le jeton doit être fourni de nouveau après redémarrage. Aucun dépôt privé personnel n'a été lu pendant D16.

## Contrat et limites

Les lectures sont des GET fixes : identité et HEAD du dépôt, dix branches, dix commits récents, dix issues (les PR éventuellement présentes dans l'endpoint issues sont exclues), dix PR et dix fichiers d'une PR choisie. La description, les titres, les extraits et les métadonnées sont limités en taille. Le client refuse les redirections, une identité `full_name` ou un identifiant numérique changés, un autre dépôt, une réponse supérieure à 512 Kio, une session expirée ou révoquée. Il impose TLS, l'hôte API fixe, un délai de connexion de cinq secondes, un délai global de douze secondes, et ne retourne que des codes d'erreur bornés. Le `User-Agent`, la version REST et les racines TLS natives sont fixés dans le client. Les URL affichables sont construites à partir de l'identité vérifiée ; les textes distants restent du texte non fiable, sans HTML exécutable.

Le connecteur ne crée aucun commit, issue, commentaire ou PR. Il ne pousse, ne fusionne et ne déclenche aucun workflow. Il n'énumère jamais les dépôts du compte. Il n'y a ni synchronisation ni interrogation périodique. Le dépôt choisi n'est pas persistant entre redémarrages.

Le test vivant du 30 octobre 2026 a lu, sans jeton, `microsoft/vscode` : ID 41881900, branche `main`, HEAD `a9a70f19cf9c0c807d503cf9e997ecbf9ad92f38`, dix branches, dix commits, quatre issues et dix PR dans les pages bornées. Ces valeurs sont des observations ponctuelles, susceptibles de changer. Les tests privés sont des fixtures locales ; une lecture d'un vrai dépôt privé exige une action distincte de l'opérateur.

## VSIX installable

L'extension D15 conserve l'identité `coriom.morgoth-vscode-connector` et `extensionKind: ["workspace"]`. Son code JavaScript et son protocole restent inchangés. La construction utilise `@vscode/vsce` 4.1.0, verrouillé dans `package-lock.json`. Le paquet n'inclut que le manifeste, le README, les deux fichiers JavaScript compilés et les métadonnées VSIX. Un script local vérifie ces entrées et normalise les horodatages du ZIP pour une empreinte reproductible. La construction est vérifiée deux fois à empreinte égale ; SHA-256 observé : `2f4620560bfaa08bd34f9ecf237041aec44721417f7e8ae50fcdc5f785154948`.

Dans un profil VS Code Linux 1.140.0 isolé, le VSIX généré a été installé avec `code --install-extension`. Un hôte de test distinct a ensuite chargé le module JavaScript de l’extension installée, obtenu le couplage, lu les métadonnées et une sélection synthétique, ouvert un brouillon non enregistré dans le véritable éditeur VS Code, vérifié son contenu et déconnecté : `D15_REAL_VSCODE_API_PASS`. Ce test ne touche pas le profil Windows personnel et ne qualifie pas Remote-WSL sur cette machine.

```bash
cd /home/corio/Morgoth/dev-desktop-d16-ui/desktop/connectors/vscode-extension
npm ci
npm run package:vsix
sha256sum dist/morgoth-vscode-connector-0.1.0.vsix
```

Dans une fenêtre VS Code **Remote-WSL**, utiliser **Extensions → Install from VSIX…** et sélectionner ce fichier, ou, dans le même hôte WSL, utiliser `code --install-extension /home/corio/Morgoth/dev-desktop-d16-ui/desktop/connectors/vscode-extension/dist/morgoth-vscode-connector-0.1.0.vsix`. L'installation dans un hôte Windows local ne donne pas accès au socket Unix WSL. Ne pas installer automatiquement dans le profil personnel. L'extension reste inactive jusqu'à **Morgoth: Connect Workspace**. Elle conserve le couplage, les confirmations et la déconnexion D15.

## Construire et lancer

Le binaire Linux contient les ressources frontend. La construction exige un checkout D16 validé et propre, le backend Python compatible au SHA `a91377c9ace8d70bf64aa44b3bd54773af612e3a` et les dépendances locales de Tauri. Le reçu privé scelle la source, le binaire, l'index intégré, les deux JavaScript de l'extension et le VSIX. Il est régénéré après le commit final.

```bash
cd /home/corio/Morgoth/dev-desktop-d16-ui
python3 desktop/scripts/build_d11.py
python3 desktop/scripts/launch_d11.py --home /CHEMIN/ABSOLU/DU/MANAGEMENT_HOME_EXISTANT --check
python3 desktop/scripts/launch_d11.py --home /CHEMIN/ABSOLU/DU/MANAGEMENT_HOME_EXISTANT
```

Prévisualisation jetable : `python3 desktop/scripts/launch_d11.py --preview`. Le démarrage normal ne lance ni Vite, ni Node, ni VS Code, ni navigateur. Le backend Management compatible reste requis pour l'espace de travail habituel. Le jeton GitHub n'est pas conservé. Human Gate 3 et `SAFE_FOR_WORKLOADS=False` restent inchangés.

Références : [REST GitHub](https://docs.github.com/en/rest), [permissions des jetons fins](https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens), [API des issues](https://docs.github.com/en/rest/issues/issues), [API des PR](https://docs.github.com/en/rest/pulls/pulls), [publication et packaging VS Code](https://code.visualstudio.com/api/working-with-extensions/publishing-extension).
