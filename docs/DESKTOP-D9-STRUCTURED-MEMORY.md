# Desktop D9 — explorateur de mémoire structurée

## Portée et provenance

D9 ajoute **Mémoire structurée** aux sources de Connaissances. Les notes personnelles restent modifiables localement; le coffre Markdown et la mémoire structurée restent deux sources backend distinctes, en lecture seule. D9 affiche les thèses, leur statut enregistré, la confiance **déclarée** (sans calibration), les identifiants de source autorisés, les quarantaines et supersessions, ainsi que les contradictions explicites, résolues ou non. Une thèse sauvegardée par Morgoth n'est pas une vérité vérifiée ni une approbation humaine.

Une sélection de Project doit être confirmée par le catalogue Management. Créer un Project ne crée pas sa base de mémoire. Une source sans autorité, table absente ou schéma incompatible affiche une indisponibilité; une source qualifiée avec zéro ligne affiche un corpus vide. Le Project historique `default` n'est pas éligible. Aucune lecture ne fait appel à `PersistentMemory.initialize()`, à la compilation wiki ou à Ollama.

Le graphe montre seulement les relations stockées entre les enregistrements de la page chargée. La liste textuelle est l'alternative clavier. Les thèses et contradictions sont paginées séparément (20 par page, décalage maximal 480). La recherche globale n'interroge la mémoire que lorsque le Project est vérifié, la palette ouverte et une requête d'au moins deux caractères saisie. Les résultats gardent leur libellé de source. Aucun lien sémantique entre sources n'est inventé.

## Autorité et contrat

Le Desktop épingle le backend `a91377c9ace8d70bf64aa44b3bd54773af612e3a`. Un fichier de configuration **créé explicitement par l'opérateur**, privé et hors Git, peut autoriser une connexion PostgreSQL par socket Unix privé. Schéma JSON: `{"schema_version":1,"socket_dir":"/chemin/prive/du/socket","port":5432,"database":"nom_de_base","role":"role_lecture"}`. Il contient des localisateurs d'autorité; ne pas le publier. Le rôle PostgreSQL doit pouvoir lire uniquement les tables `theses` et `contradictions` du schéma canonique `p_<sha256(Project ID)[:60]>`; aucun accès aux tables d'autres Projects, privilège d'écriture ou rôle administrateur n'est admis. La configuration n'est jamais fournie par la WebView.

Le chemin est PostgreSQL → Management local authentifié → client Rust → quatre IPC fixes → React. Routes versionnées: `GET /desktop-memory/v1/projects/{project_id}/theses[/{uuid}]` et `GET /desktop-memory/v1/projects/{project_id}/contradictions[/{uuid}]`. Les filtres autorisés sont sujet, statut et confiance déclarée. Le backend contrôle à chaque requête le catalogue canonique, le schéma, les colonnes requises et les privilèges du rôle, puis utilise des transactions en lecture seule, du SQL fixe paramétré et des délais bornés. Les modèles refusent les états historiques inattendus. Un record incompatible bloque la page concernée; il n'est pas caché silencieusement.

Le JSON d'évidence brut ne traverse aucune interface Desktop. Seuls le nombre d'éléments, jusqu'à huit identifiants de source simples et l'indication d'omission sont exposés. Aucun prompt, chemin interne, jeton ou secret n'est retourné. Le transport Rust refuse les champs inconnus, identités étrangères, tailles et valeurs hors contrat; React revalide la portée avant affichage. L'IPC ne reçoit ni SQL, ni DSN, ni chemin, ni URL. La sauvegarde D8 reste strictement limitée aux notes et briefs personnels : la mémoire PostgreSQL en est exclue.

## Lancement

Depuis le worktree D9, pour la vraie application sans autorité PostgreSQL (mémoire structurée honnêtement indisponible) :

```bash
cd /home/corio/Morgoth/dev-desktop-d9-ui
/home/corio/Morgoth/morgoth/.venv/bin/python desktop/scripts/launch_d9.py --home /home/corio/Morgoth/personal-management
```

Après mise en place **séparée** d'un rôle et socket de lecture qualifiés par l'opérateur, ajouter `--memory-read-config /chemin/prive/memory-reader.json`. Ce document n'autorise pas la connexion à une base personnelle réelle; celle-ci requiert une revue de son rôle et de sa portée. La prévisualisation vide et jetable est `... launch_d9.py --preview`. La fixture synthétique complète est `... desktop/scripts/d9_memory_fixture.py`; `--window` ouvre la vraie fenêtre Tauri avec deux Projects synthétiques et arrête le cluster jetable à sa fermeture. La fixture ne lit aucune mémoire personnelle.

## Vérification et limites

Contrôles frontend: TypeScript, contrat API épinglé, Vitest et build Vite. Contrôles natifs: formatage, tests Rust, Clippy strict, build Tauri, preuve du transport via cluster PostgreSQL jetable. Contrôles backend: routes authentifiées et fixture PostgreSQL jetable avec rôles séparés, Project étranger, enregistrements incompatibles et dérive de schéma. Les résultats exacts et l'acceptation WSLg figurent dans le rapport de livraison et ne doivent pas être déduits du seul build.

La source normale reste indisponible tant qu'aucun rôle de lecture dédié, socket privé et schéma Project existant n'ont été explicitement qualifiés. Les colonnes historiques optionnelles requises par le contrat doivent exister; aucune migration n'est exécutée. Les liens vers des thèses manquantes restent signalés comme absents. Le graphe et la recherche portent sur des pages bornées, sans index global ni inférence. La restauration native D8 par dialogue GTK conserve sa propre acceptation opérateur en attente; D9 ne la requalifie pas.
