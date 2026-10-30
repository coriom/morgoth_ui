# D14 — navigateur local contrôlé

## Portée effective

D14 ajoute un troisième connecteur au hub : une session **réelle** Playwright 1.64.1 avec Chrome for Testing 156.0.8078.4 (révision 1248, cache local existant). Le processus Node est facultatif : Morgoth Desktop s'ouvre sans lui, et le lance seulement après consentement natif. Le navigateur utilise un contexte temporaire neuf, sans profil Brave/Chrome, cookies importés, extensions, téléchargement accepté ni permissions caméra, micro, presse-papiers ou notifications. `chromiumSandbox: true` a été vérifié sur la machine de développement. Le contexte Playwright n'est pas présenté comme un sandbox de système d'exploitation.

Le protocole JSON v1 passe par stdin/stdout privés entre Rust et un adaptateur Node contenu dans le checkout. Rust vérifie les chemins de l'exécutable Node et de l'adaptateur ; l'adaptateur est comparé aux octets embarqués au build. Le WebView n'envoie aucun chemin d'exécutable, sélecteur CSS, script, profil ou URL arbitraire. L'adaptateur crée lui-même un site d'essai sur `127.0.0.1` avec port éphémère. Une route Playwright refuse toute requête d'une autre origine, y compris les sous-ressources. Seuls `/` et `/second` sont navigables. Les nouvelles pages sont fermées. Les réponses sont bornées : texte 2 KiB, douze titres et 36 éléments visibles au plus ; messages IPC 4/8 KiB. Les références d'éléments contiennent une révision et sont invalidées après chaque inspection, navigation et action.

La session dure au plus dix minutes, n'est jamais restaurée au redémarrage et est terminée par déconnexion, expiration ou fermeture du Desktop. Le démarrage exige un consentement GTK. La saisie ne peut écrire que `D14-CHECK` dans le champ inspecté de la première page ; le clic porte uniquement sur son bouton inspecté. Chacun exige un dialogue GTK distinct. La sortie inclut une relecture de la page. Une permission MCP ou Windows n'autorise jamais le navigateur. Le contenu web est affiché comme donnée non fiable et ne définit aucune opération.

Le test local comprend un titre, des titres de section, une liste, un champ, un bouton, un indicateur et une seconde page. Ce site est synthétique et ne représente pas des données personnelles. Le test `node --test browser/adapter.test.mjs` exécute réellement Chromium, une saisie, un clic, la relecture, la seconde page, les refus d'URL externe et `file:`, les références périmées et une reconnexion avec contexte propre. Le test Rust ignoré par défaut `browser_gateway::tests::real_gateway_fixture_smoke` vérifie séparément le transport Rust → Node → Chromium dans un environnement local explicitement configuré.

## Limites et future autorité

La navigation HTTPS publique reste indisponible. Le blocage actuel est intentionnel : la seule route Playwright par origine ne suffit pas encore à qualifier les redirections, DNS rebinding, proxies, sous-ressources et destinations privées pour des sites publics. Aucune navigation publique n'a été essayée dans le Desktop. Brave personnel, comptes, mots de passe, uploads, téléchargements et soumission externe ne sont pas connectés. Le navigateur est headless dans D14 ; la page et ses éléments sont inspectables dans Morgoth, sans réutiliser une fenêtre personnelle.

Une éventuelle proposition future d'agent devra porter explicitement `session_id`, `origin`, `page_revision`, `operation`, `element_ref`, arguments bornés, classe lecture/écriture et consentement requis. Ce contrat n'est ni enregistré comme IPC exécutable ni relié à un modèle. Human Gate 3 et `SAFE_FOR_WORKLOADS=False` restent inchangés.

## Construction et usage

Depuis la branche propre D14, avec Node 22, Rust/Tauri et le backend compatible :

```bash
cd /home/corio/Morgoth/dev-desktop-d14-ui
cd desktop && npm ci && cd ..
python3 desktop/scripts/build_d13_windows.py
python3 desktop/scripts/build_d11.py
python3 desktop/scripts/launch_d11.py --home /home/corio/Morgoth/personal-management --check
python3 desktop/scripts/launch_d11.py --home /home/corio/Morgoth/personal-management
```

Le build Windows n'est requis que si l'on veut garder le connecteur D13 actif dans ce checkout D14 ; fermer auparavant sa fenêtre WinForms de test. Le navigateur utilise le Node de l'opérateur et le cache Playwright local, détectés par le lanceur sans démarrer de processus Node. `python3 desktop/scripts/launch_d11.py --preview` ouvre un espace jetable séparé. Dans **Réglages → Connexions et applications → Navigateur isolé**, ouvrir une session, inspecter, autoriser séparément la saisie et le clic, lire la seconde page, puis déconnecter.

Le binaire Tauri release incorpore les assets Vite et n'exige ni Vite ni Node au démarrage. Le backend Python épinglé reste requis pour le lancement Management normal. Aucun backend Morgoth, donnée utilisateur, modèle ou moteur autonome n'a été modifié.
