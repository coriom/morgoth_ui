# Desktop D12 — fondation de connexion locale

## Portée livrée

Cette branche part de D11.1 `11e45dc59a8338c44bab0d32fb665b2424c08b85` et garde le backend épinglé à `a91377c9ace8d70bf64aa44b3bd54773af612e3a`. **Réglages → Connexions et applications** expose un seul connecteur réellement implémenté : `local-mcp-fixture`. Il exécute un pair MCP synthétique dans un processus enfant du même binaire Tauri, via stdin/stdout privés. Il ne lit aucun document, compte ou processus externe et ne modifie rien. Il n'écoute sur aucun port.

Le client fixe le protocole MCP de compatibilité `2025-11-25` : `initialize`, `notifications/initialized`, `tools/list`, puis, uniquement après autorisation, `tools/call` pour `read_snapshot` avec arguments vides. Le résultat structuré attendu est exactement `{status: "ready", items: 2}`. L'identité du pair, le nom de l'outil et son schéma d'entrée sont vérifiés ; sa description ne crée aucune permission. Les messages et sorties sont limités à 8 KiB, les processus à trois secondes par échange, et aucun environnement ambiant n'est transmis au pair. Une réponse inattendue est refusée. Le pair est arrêté après chaque échange. [La spécification MCP historique](https://modelcontextprotocol.io/specification/2025-11-25) et [la documentation du SDK officiel sur les deux familles de protocole](https://ts.sdk.modelcontextprotocol.io/v2/protocol-versions) expliquent ce choix de compatibilité ; D12 ne prétend pas accepter tous les serveurs MCP actuels.

La découverte n'autorise aucun outil. Une connexion exige un clic et une confirmation **GTK native** ; la chaîne fixe `CONNECT LOCAL FIXTURE` est validée au niveau Rust. L'autorisation n'existe qu'en mémoire du processus et expire après dix minutes. Tester invoque uniquement la lecture fixe. Déconnecter révoque immédiatement les appels suivants. Les quatre commandes Tauri sont fixées à la fenêtre `main`. Aucun prompt, note, page web ou résultat MCP ne peut sélectionner un exécutable, des arguments, un outil ou une destination réseau. Aucun connecteur n'est lié au planificateur autonome.

Le registre contient la fixture utilisable et deux entrées explicitement indisponibles, `windows-uia` et `browser-test`. Chaque entrée possède une identité fixe, une famille, une cible, une opération, une portée, un niveau de risque, une permission et une dernière vérification éventuelle. La révocation de la fixture est visible et contrôlée à chaque appel. Le registre n'offre ni import arbitraire de serveurs MCP, ni compte API, ni navigateur, ni contrôle d'application Windows. Les prochaines entrées devront posséder une identité installée et approuvée, une autorisation par opération et par cible, des reçus durables minimaux et une révocation vérifiée à chaque exécution. Les opérations de modification, communication externe et suppression sont refusées par absence de commande. Aucun audit de données personnelles n'est produit par la fixture.

## Frontière Windows / WSL

WSLg expose une fenêtre Linux ; il ne donne pas à AT-SPI l'autorité sur les fenêtres Windows. La frontière prévue est un compagnon Windows lancé explicitement, sous le même utilisateur, utilisant Microsoft UI Automation pour une fenêtre test choisie. Son transport futur devra être un canal local authentifié avec ACL Windows, sans écoute LAN, avec identité de processus et fenêtre revalidée avant chaque lecture. La découverte devra exclure les fenêtres élevées, UAC, gestionnaires d'identifiants et champs sensibles. Aucune API générique PowerShell/CMD, capture d'écran ou injection de touches ne sera exposée. [Microsoft décrit les éléments et patterns UI Automation](https://learn.microsoft.com/en-us/windows/win32/winauto/uiauto-uiautomationoverview) ; [UIPI limite les interactions entre niveaux d'intégrité](https://learn.microsoft.com/en-us/troubleshoot/power-platform/power-automate/desktop-flows/ui-automation/uipi-issues). `powershell.exe` est visible dans WSL, mais aucun SDK de construction .NET n'a été trouvé. **Aucun compagnon Windows n'est construit ou lancé ici ; aucune application Windows n'est connectée.** Cette frontière exige un développement et une qualification hôte distincts avant une opération réelle.

Le navigateur est également indisponible dans D12. Une future adaptation devra utiliser un profil jetable et un site local de test, sans profil Brave, cookies, CDP public ou compte réel. L'état de ces familles reste « indisponible », sans simulation d'accès.

## Lancement et refus précis

La construction release est épinglée à la branche D12 et écrit `morgoth-d12-release.json` à côté du binaire. Le lanceur vérifie le commit source propre, le hash du binaire, l'index des assets, le backend et son checkout, Python, et le Management home privé. Un chemin de home inexistant donne `MANAGEMENT_HOME_MISSING` au lieu de `LOCAL_PREFLIGHT_FAILURE`. Un binaire ou reçu absent, une identité erronée, un checkout backend différent et un délai Git ont chacun une classe fixe. La vérification D11.1 du home existant `/home/corio/Morgoth/personal-management` a réussi en lecture seule le 29 octobre ; la cause de l'ancien échec opérateur reste inconnue.

Après construction sur le commit final propre :

```bash
cd /home/corio/Morgoth/dev-desktop-d12-ui
python3 desktop/scripts/build_d11.py
python3 desktop/scripts/launch_d11.py --home /home/corio/Morgoth/personal-management --check
python3 desktop/scripts/launch_d11.py --home /home/corio/Morgoth/personal-management
```

Prévisualisation jetable : `python3 desktop/scripts/launch_d11.py --preview`. La release charge ses assets locaux ; Node et Vite ne sont pas démarrés. Le Management home personnel n'est ni créé ni remplacé automatiquement.

## Vérification et limites

La fixture MCP a répondu sur le vrai canal stdio avec trois réponses pour la séquence d'initialisation, découverte et lecture. Les tests Rust couvrent le refus sans consentement, l'expiration et la révocation ; les tests React couvrent la séparation découverte/autorisation/test et les erreurs sans fuite. Les tests du lanceur couvrent les absences et chemins non fiables. Les suites existantes D4–D11.1 restent les frontières de non-régression.

Sur une fenêtre Tauri **release** et un home jetable, la navigation Réglages → Connexions a montré le registre. Un refus dans la boîte GTK a laissé la fixture déconnectée. Une approbation GTK a établi la session ; le bouton de test a reçu et affiché les deux éléments synthétiques via le vrai client MCP Rust et le processus enfant. La session a ensuite été déconnectée. [Capture du résultat natif](screenshots/d12-mcp-synthetic-native.png). Cette preuve porte uniquement sur la fixture intégrée ; elle n'autorise ni connexion tierce ni contrôle Windows.

Vérifications effectuées : contrat OpenAPI épinglé, TypeScript, 69 tests Vitest, build Vite, trois tests du lanceur, 72 tests Rust, `cargo fmt --check`, Clippy strict et build Tauri release. Le contrôle normal D11.1 `--home /home/corio/Morgoth/personal-management --check` a passé avant modification ; le D12 reconstruit doit être revérifié après scellement sur son commit final. Aucun test Windows hôte ou navigateur n'a été effectué.

Cette version n'est **pas** une passerelle universelle vers toutes les applications. Aucun connecteur tiers, compte, serveur MCP non approuvé, navigateur personnel ou fenêtre Windows n'a été testé. Aucune inférence ni mission autonome n'a été exécutée ; Human Gate 3 et `SAFE_FOR_WORKLOADS=False` restent inchangés.
