# Desktop D13 — application Windows de test par UI Automation

## Portée vérifiable

D13 ajoute une connexion Windows **limitée à une seule application WinForms de test**, distincte du connecteur MCP D12. Le binaire Windows `morgoth-d13-test-target.exe` est lancé explicitement par l'opérateur. Le compagnon `morgoth-d13-companion.exe` reconnaît uniquement ce nom de processus, le fichier exact à côté de lui et le SHA-256 de l'application de test intégré lors de sa compilation. Il n'expose aucune commande générale, aucun sélecteur UIA fourni par React, aucun chemin, URL, terminal ou processus à lancer.

La recherche officielle a examiné [Windows App Development CLI](https://learn.microsoft.com/en-us/windows/apps/dev-tools/winapp-cli/) et ses opérations [UI Automation](https://github.com/microsoft/winappCli/blob/main/docs/ui-automation.md). `winapp.exe` n'était pas installé sur l'hôte vérifié. Sa sortie JSON est encore susceptible d'évoluer en préversion ; [la version 0.3.1 a modifié ses enveloppes](https://github.com/microsoft/winappCli/releases). Aucun binaire tiers n'a été téléchargé. Un compagnon C# .NET Framework minimal, compilé avec les composants déjà présents dans Windows PowerShell 5.1, donne ici un contrat plus étroit et testable. Ce choix n'implique pas que le compagnon puisse contrôler d'autres applications.

## Protocole et identité

Le Desktop Linux lance uniquement le compagnon attendu du worktree D13 par WSL interop, sans shell et sans port réseau. Il transmet une ligne JSON UTF-8 de 4 KiB au maximum et reçoit une réponse de 8 KiB au maximum. L'environnement enfant est effacé, sauf `WSL_INTEROP`, observé comme suffisant sur cet hôte. Chaque opération démarre un nouveau processus Windows, attend au plus cinq secondes, puis le récolte ou l'arrête. Le protocole `v=1` n'accepte que `host_status`, `discover_test_target`, `inspect_target` et `invoke_test_action` avec l'opération fixe `toggle_test_state`.

Le reçu local du build Windows contient le commit source et les SHA-256 des deux exécutables. Le client Rust compare ces valeurs aux fichiers réguliers privés, sans symlink, et au commit incorporé lors du build Tauri. Le lanceur D13 conserve le reçu du binaire Linux, l'index des assets, la vérification du backend épinglé et le Management home explicite. Ces hash protègent contre une substitution accidentelle des artefacts dans le worktree qualifié ; ils ne constituent pas une signature éditeur ou une défense contre un attaquant qui contrôle le même compte utilisateur et tous ses fichiers.

Avant chaque lecture ou action, le compagnon redécouvre la cible et contrôle : fichier exécutable exact et SHA-256, utilisateur Windows, session, absence d'élévation, PID, heure de création, HWND et PID propriétaire du HWND. Les contrôles UIA doivent porter les identifiants fixes `D13State` (texte non secret) et `D13Toggle` (bouton avec `InvokePattern`). Seuls leurs noms allowlistés, état actif/inactif, type, capacité d'invocation et disponibilité franchissent le pont. L'action appelle `InvokePattern`, puis relit l'état et refuse un état inchangé. Aucun titre de fenêtre étrangère, champ de mot de passe, capture, presse-papiers ou frappe globale n'est transmis.

La simple détection ne donne pas un droit de lecture. Une boîte GTK native distincte autorise l'inspection pour dix minutes. Une autre boîte GTK est obligatoire avant **chaque** bascule. Le WebView n'envoie aucun argument de cible ou d'action. Déconnexion et expiration retirent la permission ; une identité différente après redémarrage de la cible impose une nouvelle détection et autorisation. Le compagnon lancé directement n'est pas une API de sécurité pour des applications personnelles : son unique action reste confinée à l'application de test. Une future extension à d'autres applications exigera son propre modèle d'identité, d'approbation et d'audit.

## Construction et utilisation

Prérequis : Windows avec Windows PowerShell 5.1 et les assemblages `UIAutomationClient`/`UIAutomationTypes`, WSL2 interop actif, Tauri/Node/Rust déjà installés pour le build Linux, et le backend compatible au commit `a91377c9ace8d70bf64aa44b3bd54773af612e3a`. Aucune installation système, service, élévation, changement PATH/registre/UAC ou téléchargement n'est effectué. Le script de build Windows n'utilise une politique d'exécution `Bypass` que dans **son propre processus de compilation** ; il ne change pas la politique de la machine.

Après le commit D13 propre :

```bash
cd /home/corio/Morgoth/dev-desktop-d13-ui
python3 desktop/scripts/build_d13_windows.py
python3 desktop/scripts/build_d11.py
python3 desktop/scripts/launch_d11.py --home /home/corio/Morgoth/personal-management --check
python3 desktop/scripts/launch_d11.py --home /home/corio/Morgoth/personal-management
```

Prévisualisation sans données personnelles : `python3 desktop/scripts/launch_d11.py --preview`. Pour rendre la cible disponible, l'opérateur ouvre séparément `desktop/windows/target/morgoth-d13-test-target.exe` dans sa session Windows ordinaire. Dans **Réglages → Connexions et applications**, il choisit **Détecter**, approuve l'inspection, lit les contrôles, approuve éventuellement une bascule, puis **Déconnecter Windows**. La cible se ferme depuis sa propre fenêtre. Le Desktop reste utilisable si Windows ou le compagnon est indisponible.

## Limites et acceptation

Le test d'interop a obtenu une réponse `host_status` réelle par stdin/stdout. Une fenêtre WinForms dédiée a été découverte avec un PID, un HWND et un SHA-256 exacts. UI Automation a lu `D13State` et `D13Toggle` ; `InvokePattern` a changé l'état de `INACTIVE` à `ACTIVE`, confirmé par relecture. Ces observations ne prouvent aucun accès à une application personnelle. Les suites Rust/React testent séparément les refus de consentement, d'identité périmée, de révocation et d'expiration ; l'acceptation native complète doit être rapportée après scellement du binaire final.

Le navigateur, les comptes API, les applications Windows tierces, les fenêtres élevées, les données personnelles et le planificateur autonome ne sont pas connectés. Human Gate 3, `SAFE_FOR_WORKLOADS=False`, l'identifiant Tauri et les données D4–D12 restent inchangés. Aucun modèle n'est chargé.
