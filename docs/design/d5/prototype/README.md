# Aperçu local D5

Ouvrir `index.html` dans un navigateur local. Depuis WSLg :

```bash
xdg-open /home/corio/Morgoth/dev-desktop-d5-design-v1/docs/design/d5/prototype/index.html
```

Sans WSLg, utiliser un navigateur local avec l'URL `file:///home/corio/Morgoth/dev-desktop-d5-design-v1/docs/design/d5/prototype/index.html`. Les captures se trouvent dans `../screenshots/`.

La navigation utilise la barre latérale. `Ctrl+K` / `⌘K` ouvre la palette. Notes et Graphe sont deux présentations des mêmes données fictives. Dans le graphe : clic/Entrée pour choisir un nœud, bouton « Ouvrir la note », molette ou boutons pour zoomer, glisser le fond pour déplacer ; la liste latérale offre une alternative sans graphe. La barre latérale se replie par le chevron. Un titre de brief peut être modifié, avec une protection de navigation non enregistrée **dans cette page seulement**.

Ce prototype ne lit ni backend, ni Ollama, ni notes personnelles. Il ne sauvegarde rien, y compris l'action « Simuler l'enregistrement ». Le rechargement restaure seulement les exemples initiaux. Pour une capture ciblée, ajouter `?view=home`, `missions`, `notes` ou `graph` à l'URL. Le marquage « Aperçu de design · Données fictives » doit rester visible.
