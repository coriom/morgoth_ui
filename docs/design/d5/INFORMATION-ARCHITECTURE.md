# D5 — architecture de l'information

| Destination primaire | Question résolue | D5 possible sans inférence | Source future ou condition |
| --- | --- | --- | --- |
| Accueil | Où reprendre ? | Brouillons D4 récents ; projets du catalogue vérifié ; notes locales si un magasin D5 est approuvé | Activité uniquement depuis des événements datés et sourcés ; sinon état vide |
| Missions | Que préparer ou relire ? | Briefs locaux éditables ; checkpoints D2/D4 historiques en lecture seule | Missions soumises seulement avec contrat backend et autorisation distincts |
| Connaissances | Que sais-je, et comment les idées se relient-elles ? | Notes locales explicitement autorisées ; liens internes ; graphe dérivé des mêmes liens | Sources agent, index et validation nécessitent un contrat de lecture révisé |
| Projets | Dans quel contexte suis-je ? | Sélection D4 persistante, catalogue Management, identité mémorisée hors ligne | Association notes–projet et gestion des projets à définir avant mutation |
| Réglages | Quelle est la configuration et quelles sont les limites ? | Réorganiser les lectures D3 Ollama, capacités et sécurité ; préférences locales de présentation | Aucun grant ni changement de modèle depuis cet écran |

## Parcours

La barre latérale conserve la navigation et le projet courant. Un clic sur Connaissances ouvre Notes ; le commutateur Notes/Graphe garde le nœud sélectionné. `Ctrl+K` ou `⌘K` propose seulement des destinations, notes, briefs et un nouveau brouillon local. La palette ne commande jamais un outil ou un agent. Le retour vers une note depuis le graphe garde la même identité.

Accueil montre d'abord « Reprendre », puis « Commencer ». Si les sources sont vides, l'espace propose de créer un brief ou une note, sans fabriquer d'activité. Les éléments non vérifiés sont toujours qualifiés « local », « ancien relevé » ou « source indisponible ».

À largeur réduite, la barre devient compacte. Dans Missions ou Notes, la liste peut se placer au-dessus du document ; le document garde la priorité. Les panneaux secondaires de rétroliens passent sous la note ou se masquent au profit d'un accès accessible. Dans le graphe, une liste de notes demeure utilisable sans interpréter la géométrie.

## Modèle de provenance commun

Chaque ligne qui représente un contenu doit porter `id`, `project_id` éventuel, `kind` (brouillon humain, note personnelle, source importée, suggestion agent, savoir vérifié, procédure), `source`, `observed_at` ou `updated_at`, et un état de revue si pertinent. Ces champs ne créent aucun droit d'exécution. Les historiques D2 restent séparés des brouillons D4. Le prototype emploie exclusivement des données de démonstration.
