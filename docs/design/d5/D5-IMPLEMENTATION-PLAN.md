# D4 → D5 — plan d'implémentation

## Base à conserver

D4, commit `4a3474312724f2028d61b88f3d02188dbef66d37`, fournit le magasin Rust `desktop/src-tauri/src/drafts.rs` : fichiers locaux bornés, permissions, refus des symlinks, révisions et écritures atomiques. `desktop/src/MissionWorkspace.tsx` sépare déjà brouillons et checkpoints, et ses clés React Query incluent le Project. `desktop/src/App.tsx` conserve la préférence de Project, les lectures Management/Ollama et les états de source. Garder les contrats de lecture D2/D3, les tests et les limites historiques `morgoth_test` ; remplacer la présentation, pas les garanties.

Le binaire Tauri porte l'identifiant `com.coriom.morgoth.projects`, qui détermine aussi des chemins de données. **Ne pas le changer** pour modifier une marque visible. `desktop/src-tauri/capabilities/main.json` reste une liste fixe de permissions. Aucun nouvel IPC ne doit donner URL, chemin ou commande arbitraire à la WebView.

## Un seul jalon produit D5

1. **Fondations visuelles et navigation.** Créer jetons CSS et primitives légères (`AppShell`, `Sidebar`, `SourceStamp`, `EmptyState`, `ListRow`, `WorkspaceHeader`). Déplacer les cinq destinations dans le shell, conserver Project global. Réorganiser Overview en Accueil ; déplacer Models, Capabilities et Security sous Réglages sans perdre leurs lectures. Conserver le refus d'action et la fraîcheur. Tests : navigation clavier, largeur 1100/780, focus, reduced motion, aucune action backend supplémentaire.
2. **Missions éditoriales.** Extraire les hooks de liste/détail historiques et de drafts depuis `MissionWorkspace` sans changer le Rust. Réutiliser création, révision, duplication, suppression, garde des modifications et isolation Project. Mettre la liste et l'éditeur au premier plan, les checkpoints dans une section lisible et séparée. Tests : cycle complet, changement Project, conflit de révision, hors ligne et retour après redémarrage.
3. **Connaissances locales.** Ajouter un magasin natif de notes Markdown Project-scopé, borné, avec une revue de sécurité équivalente aux drafts ; contrat TypeScript strict. Construire Notes, liens et rétroliens, puis Graphe dérivé de ces mêmes données. Ne pas connecter les anciens endpoints wiki sans contrat autonome, authentifié et Project-scopé. Tests : persistence, liens cassés, symlinks/traversée, révisions, isolation, recherche, graphe/listes cohérents et performance à taille bornée.
4. **Accueil et palette.** Accueil ne lit que les brouillons, notes et Projects réellement disponibles ; les activités manquantes ont un état vide. Palette locale pour naviguer, trouver une note/brief et créer un document. Tests : pas de requête d'inférence, pas de pseudo-activité, pas d'exécution, recherche et raccourcis.
5. **Acceptation native.** Tests TypeScript/Vitest, contrats, Vite, fmt/Clippy/Rust, build Tauri. Fenêtre native sous WSLg si disponible : 1440×900 et 1100×750, navigation, rédaction, note/graphe, redémarrage, hors ligne, lecteur clavier. Garder une acceptation explicite en attente si une interaction AT-SPI ou la saisie WebKit n'est pas vérifiée.

## Limites à ne pas franchir

Une mission soumise et exécutée requiert un futur contrat backend, une autorisation humaine, des reçus et des états de vérification. Les catégories de savoir issues de Morgoth requièrent des interfaces de lecture sûres et une provenance. Le nouveau magasin de notes reste local et humain jusqu'à cette qualification. Le graphe n'est jamais une mesure d'« intelligence ». Garder Human Gate 3 et `SAFE_FOR_WORKLOADS=False`.

## Critères d'acceptation D5

- Même projet et même brief D4 retrouvés après mise à jour, édition et redémarrage ; aucune migration destructive.
- Historique expérimental clairement identifié, dates de lecture correctes, aucune assimilation à une exécution active.
- Création/édition d'une note locale, liens et rétroliens cohérents avec un graphe navigable au clavier ; isolation entre Projects.
- Accueil et palette utiles sans Ollama ni backend de mission ; Réglages conservent les observations D3 sans mutation.
- Sécurité native et tests de contrat au moins au niveau D4 ; aucun nouveau droit implicite dans la WebView.

Effort indicatif : environ 2–4 semaines d'ingénierie et d'acceptation, surtout pour le nouveau magasin de notes, ses tests de sécurité et les contrôles natifs du graphe. Risques : performance/grands graphes, édition Markdown non fiable sur WSLg AT-SPI, migration visuelle qui masque la provenance, confusion entre catalogue Project vérifié et identité locale mémorisée.
