# D5 — système visuel et interactions

## Jetons

Le prototype utilise des propriétés CSS remplaçables plutôt que des couleurs répétées dans les composants.

| Jeton | Valeur initiale | Usage |
| --- | --- | --- |
| `--bg` | `#141716` | fond de travail |
| `--sidebar` | `#191d1b` | navigation |
| `--surface` / `--raised` | `#1d2220` / `#252c29` | champs et survols |
| `--ink` / `--muted` / `--faint` | `#e9ece8` / `#9aa49e` / `#859188` | texte principal, secondaire, métadonnées |
| `--line` | `#323a35` | séparateurs seulement |
| `--accent` / `--accent-ink` | `#a4bda8` / `#17221b` | action primaire et libellé |
| `--focus` | `#d6e3d5` | contour clavier indépendant de l'accent |
| `--sidebar-width` / `--list-width` | `222px` / `272px` | proportions de départ |
| `--radius` | `9px` | surfaces interactives |

Les teintes sont des propositions à vérifier en contexte et avec un outil de contraste avant implémentation. La typographie utilise la police système, avec une serif locale seulement pour un titre éditorial ponctuel. Pas de police distante. Échelle indicative : texte 14 px, métadonnée 11–12 px, section 14–16 px, titre de page 27–39 px ; corps de note à 1,78 de hauteur de ligne.

Espacement de base : 4/8/12/16/24/32/48/64 px. Liste dense mais respirable : ligne 42–58 px selon le contenu. Zone d'édition plafonnée autour de 750–880 px. Un séparateur de 1 px structure les colonnes ; les contenus ne sont pas systématiquement encerclés.

## États et commandes

- Action primaire : remplissage sauge seulement pour « Nouveau brief » ou sauvegarde réelle future. Action secondaire : texte sobre. Destructif : confirmation explicite et libellé direct.
- Survol : élévation d'une nuance, sans translation. Sélection : fond discret. Focus clavier : contour de 2 px visible. Les animations sont supprimées sous `prefers-reduced-motion`.
- Chargement : lignes réservant l'espace et libellé de source. Vide : expliquer l'absence réelle et proposer une action autorisée. Erreur : message local, conserver les brouillons non enregistrés. Hors ligne : distinguer catalogue non vérifié des brouillons locaux disponibles.
- Palette : `Ctrl/⌘+K`, champ et liste de résultats, Entrée pour ouvrir, Échap pour fermer ; uniquement navigation et créations locales autorisées.
- Graphe : pan/zoom, focus, recherche, local/global ; une liste adjacente permet la navigation au clavier et aux technologies d'assistance. Respecter les tailles de nœuds et le contraste en test réel.

## Personnalisation ultérieure

Introduire des couches de jetons `theme: dark|light|system`, `accent`, `density: comfortable|compact`, `sidebar: expanded|compact` dans une préférence locale versionnée. D5 ne requiert ni éditeur de thèmes complet ni synchronisation. Les couleurs fonctionnelles d'erreur et la visibilité du focus doivent rester indépendantes des accents sélectionnables.
