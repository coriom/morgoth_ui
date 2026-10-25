# D5 — espace Connaissances

## Ce qui existe réellement

Le Desktop D4 ne possède ni magasin de notes ni graphe natif. L'ancienne application **Next.js** contient `app/wiki/[[...slug]]/page.tsx`, `WikiNav`, `WikiReader` et `lib/wikilinks.ts` : navigation par manifeste et rendu Markdown avec liens `[[note]]`. `app/wiki/graph/page.tsx` emploie `react-force-graph-2d`, le contrat `api.wiki.graph`, un focus de voisinage, clic pour ouvrir une page, ajustement du zoom et glisser pour fixer un nœud. Ce sont des idées d'interaction, pas des composants React/Tauri à migrer tels quels. Le graphe `components/consciousness/ConceptGraph.tsx` est un SVG de synthèse de concepts ; `components/mind/KnowledgeMap.tsx` est une carte radiale de domaines affichant un état vide en l'absence de domaines. Leur esthétique colorée et leur sémantique ne conviennent pas à un carnet personnel.

Le backend historique définit `GET /api/wiki/manifest`, `/page`, `/graph` et `POST /compile` dans `api/routes/wiki.py`, avec un vault Markdown comme source et une compilation qui peut dépendre d'un modèle. `api/routes/knowledge.py` expose des thèses et contradictions de stockage persistant. Ces routes ne sont **pas** des lectures Desktop D4 authentifiées, Project-scopées et validées ; elles ne sont pas un contrat D5 prêt à brancher. Une valeur `vault_dir` existe dans la configuration backend, mais cela ne prouve ni qu'un répertoire de notes personnelles autorisé existe ni qu'il peut être ouvert par la WebView. Aucun répertoire personnel de notes n'a été lu pour cette étude.

## Un modèle de connaissance, deux vues

Le prototype présente cinq notes fictives dans `prototype/app.js`. Chaque note a un identifiant, une collection, un texte, une provenance et des liens typés vers d'autres identifiants. La liste Notes, la lecture, les rétroliens et le Graphe dérivent du **même tableau**. Cette contrainte évite qu'un graphe décoratif contredise les documents.

Pour D5 réel, proposer un magasin natif de notes Markdown **dans le répertoire de données de l'application**, avec identifiants stables, fichiers bornés, écriture atomique et contrôle de révision comme le magasin de briefs D4. Le Markdown reste lisible et exportable. Une association Project utilise un identifiant validé du catalogue ou une identité explicitement mémorisée et non vérifiée. Les liens `[[id]]` ou une table de relations dérivée du Markdown ne donnent aucune autorité. Toute source importée garde son origine, son empreinte et sa date ; une note humaine reste distincte d'une suggestion agent, d'un fait vérifié et d'une procédure apprise. Ces dernières catégories ne deviennent pas automatiquement éditables ou exécutables.

Une future intégration d'un vault Obsidian doit commencer par un **répertoire choisi explicitement par l'utilisateur**, une autorisation native de portée limitée et un mode lecture seule avant toute écriture. Ne pas scanner le HOME ni monter arbitrairement des chemins via la WebView. Définir conflits, symlinks, tailles, suppressions et provenance avant activation. Ne pas appeler la compilation wiki historique pour alimenter silencieusement le Desktop.

## Notes

Navigation par collection, recherche, lecture et édition Markdown, métadonnées discrètes, tags et liens internes ; panneau de rétroliens et sources liées quand ils existent. La provenance accompagne le contenu et les résultats de recherche. Une hypothèse agent non revue doit être nommée comme telle. Les états vides sont utiles : créer une note personnelle ou choisir une source autorisée, sans inventer de savoir.

## Graphe

Modes global et local. Le mode local montre une note et ses relations immédiates ; les filtres s'appliquent au Project, à la collection et au type de lien. Clic ou clavier sélectionne un nœud, l'inspecteur permet d'ouvrir sa note. Zoom/pan restent bornés. La liste accessible reflète les nœuds visibles et permet de trouver un contenu sans graphe. Pour de grands ensembles, limiter le rendu initial, agréger ou filtrer avant l'affichage et conserver les relations consultables dans la liste. Aucune animation de force continue n'est nécessaire à la compréhension.

Le prototype est un concept fonctionnel sur **données fictives**, pas une preuve de capacité backend ou de performance sur grand graphe.
