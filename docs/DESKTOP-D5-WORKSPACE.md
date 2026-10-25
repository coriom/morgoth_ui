# Morgoth Desktop D5 — espace personnel natif

Base fonctionnelle : D4 `4a3474312724f2028d61b88f3d02188dbef66d37`. Le prototype et les spécifications du design candidat `cab68c3bf69aca94ea56c4a58c337d7afe94b8c3` sont conservés sous `docs/design/d5/` comme référence visuelle, sans données de démonstration dans l'application.

## Application

La navigation principale propose Accueil, Missions, Connaissances, Projets et Réglages. Les vues D3 de modèles, capacités, sécurité et diagnostic Management restent accessibles dans Réglages. Le Project courant est le même identifiant validé et mémorisé qu'en D4 ; un Project mémorisé hors ligne est explicitement non vérifié. La palette Ctrl/Cmd+K cherche les destinations, les documents locaux du Project sélectionné et les Projects du catalogue courant. Elle n'interprète aucune instruction destinée à un agent.

Accueil présente les brouillons et notes locaux récents. Missions utilise le magasin D4 inchangé : brief non soumis, édition, duplication, conflit de révision, suppression et checkpoints historiques en lecture seule issus uniquement du contrat expérimental `morgoth_test`. Les checkpoints ne sont pas des missions en cours. Le thème sombre s'appuie sur des propriétés CSS de couleur et de densité qui peuvent servir à une future préférence. Aucun réglage fictif n'est enregistré.

## Notes locales et liens

Les cinq commandes IPC fixes `local_notes_list`, `local_note_get`, `local_note_create`, `local_note_update`, `local_note_delete` manipulent exclusivement des notes rédigées par l'utilisateur. Le Rust natif dérive le chemin depuis `app_local_data_dir()/knowledge-v1/notes/{project_id}/{note_id}.md` ; la WebView ne fournit jamais de chemin. L'identifiant Tauri `com.coriom.morgoth.projects` ne change pas. Les fichiers D4 sous `mission-workspace-v1` ne sont ni migrés ni modifiés.

Chaque fichier Markdown débute par un commentaire de métadonnées JSON versionnées (identité, Project, collection, dates, révision, provenance `HUMAN_LOCAL`), puis son texte Markdown. Les fichiers restent lisibles et exportables individuellement. Limites : 500 notes par Project, contenu 32 KiB, fichier 40 KiB, titre 160 caractères, collection 48 caractères. Identifiants Project et UUID stricts, propriétaire et modes privés, liens physiques et symboliques refusés, taille et version vérifiées, verrou par Project, contrôle de révision, écriture temporaire puis renommage et synchronisation fichier/répertoire. Les données incompatibles restent intactes et provoquent un refus. Le stockage repose sur les permissions du système ; **aucun chiffrement applicatif au repos** n'est implémenté. Cette qualification concerne Linux/WSL ; elle ne prouve pas un comportement Windows natif.

Un lien interne a la forme `[[uuid|libellé]]` ; la cible appartient nécessairement à la liste du Project courant. Les rétroliens et le graphe sont calculés à partir de ces liens enregistrés. Les cibles absentes sont affichées comme liens cassés ; aucune note n'est inventée. Le graphe offre recherche, collections, vue globale/locale, zoom, panoramique et liste clavier. Son rendu SVG stable est borné à 160 notes ; Notes continue de montrer l'ensemble borné à 500. Le rendu Markdown est un sous-ensemble sûr de titres, listes, paragraphes, gras, code inline et liens internes. Le texte HTML et les URL brutes sont du texte React échappé ; aucun HTML arbitraire n'est exécuté.

## Autorité et limites

La WebView n'obtient que les cinq nouvelles opérations de notes locales dans la fenêtre principale. Les lectures Management/Ollama existantes restent fixes, authentifiées selon leur contrat et sans inférence. Aucune écriture de mission backend, approbation, recherche, chargement de modèle, exploration du système de fichiers ou synchronisation externe n'a été ajoutée. `SAFE_FOR_WORKLOADS=False` et Human Gate 3 demeurent du ressort du backend. Le vieux wiki Next.js n'est pas connecté. Un futur coffre Markdown externe exigerait une sélection explicite du répertoire, une portée d'accès et une qualification distincte.

## Prévisualisation

Depuis WSL, avec les dépendances système Tauri déjà installées et le backend D2 jetable vérifié :

```bash
cd /home/corio/Morgoth/dev-desktop-d5-production-v1
/home/corio/Morgoth/morgoth/.venv/bin/python desktop/scripts/d2_read_fixture.py --window
```

Le script exige une branche propre, le backend D2 épinglé, démarre un `morgoth_test` privé et ouvre deux fenêtres successives avec le même HOME/XDG_DATA_HOME jetable. Fermer la première fenêtre après avoir créé un brouillon et deux notes liées dans `project_a` ; la seconde permet de constater la persistance et l'isolation de `project_b`. Le HOME temporaire est détruit à la fin : ce mode n'enregistre pas de notes personnelles.

Pour le lancement normal avec les données personnelles existantes, utiliser le flux de développement natif (deux terminaux) :

```bash
cd /home/corio/Morgoth/dev-desktop-d5-production-v1/desktop
npm run dev -- --strictPort
```

```bash
cd /home/corio/Morgoth/dev-desktop-d5-production-v1
./desktop/src-tauri/target/debug/morgoth-desktop
```

Le superviseur Management conserve ses exigences de configuration locale existantes. S'il est absent, les notes d'un Project auparavant mémorisé restent accessibles avec le libellé « non vérifié ». Ne pas lancer le vieux serveur Next.js pour prévisualiser D5.
