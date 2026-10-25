# Morgoth Desktop D5 — vision

## Intention

Faire de Morgoth un espace personnel de travail, plutôt qu'un tableau de télémétrie. L'unité visuelle principale est un document ou une liste de travaux, avec une lecture confortable. L'application ne doit pas suggérer que l'agent exécute une mission lorsque la seule preuve est un brouillon local ou un ancien checkpoint.

La direction est **sombre d'abord, minimale, professionnelle, personnalisable ensuite**. Linear inspire la précision de la navigation, Bear la qualité de l'écriture, Obsidian l'exploration des liens. Le prototype n'en reprend ni marque ni mise en page exacte.

## Décisions visibles

- Fond graphite, surfaces voisines et séparateurs discrets. Une seule teinte sauge désaturée sert aux actions et au focus. Pas de gradient lumineux, grille de métriques ni indicateur d'activité fictive.
- Barre latérale de 222 px ; cinq destinations. Un projet reste visible en haut. Les diagnostics techniques quittent la navigation principale.
- Contenu structuré par titre, texte et espace. Les panneaux sont réservés aux situations où une séparation fonctionnelle est nécessaire : liste/éditeur et graphe/inspecteur.
- Un brief est clairement « local · non soumis ». Un checkpoint est « historique · lecture seule ». La provenance et la fraîcheur précèdent les prétentions d'état.
- Les notes et le graphe montrent **le même ensemble de cinq notes fictives**. Cette identité partagée est une règle produit, pas seulement un choix de maquette.

## Ce que démontre le prototype

`prototype/index.html` est un aperçu autonome. La bande supérieure signale les données fictives. Accueil, Missions, Notes, Graphe, Projets et Réglages sont navigables ; la recherche `Ctrl/⌘+K`, la sélection de notes, les liens, le focus du graphe, le zoom, le déplacement et le repli de la barre latérale fonctionnent localement. « Simuler l'enregistrement » ne sauvegarde rien. Aucune donnée personnelle ou API Morgoth n'est lue.

## Critère de réussite visuelle

À 1440 × 900, le regard doit aller au document ou à la liste, jamais à un badge. À 1100 × 750, la rédaction doit rester praticable et la navigation lisible. Les états « indisponible » et « ancien relevé » seront typographiquement discrets mais explicites dans le produit D5.
