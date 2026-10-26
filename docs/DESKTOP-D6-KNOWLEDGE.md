# D6 — connaissances de Project en lecture seule

## Source et frontière d’autorité

Le Desktop D6 garde les notes personnelles D5 dans leur stockage natif et
ajoute un second espace, « Connaissances Morgoth », exclusivement en lecture.
Sa source intégrée est le **coffre Markdown réellement persisté** des Projects
gérés. Le backend épinglé est `3f18a375453af0c8efe2586440b3e8612707c6f2`
sur `desktop-d6-knowledge-read-v1`. La projection backend est documentée dans
`docs/DESKTOP-D6-KNOWLEDGE-CONTRACT.md` de cette branche backend.

Chemin : fichier Markdown du Project → lecteur backend borné → API Management
locale authentifiée → transport Rust natif → deux IPC fixes → React. La WebView
ne reçoit ni jeton Management, ni chemin de fichier, ni accès HTTP général.
La capacité Tauri est limitée à la fenêtre `main`. Aucune commande d’écriture
de connaissance backend n’existe dans D6.

Les documents ont une identité SHA-256 opaque de leur chemin relatif au coffre.
Leur date « modifié » provient de la métadonnée du fichier, et « lu le »
représente une lecture réussie de la source. Ni l’une ni l’autre ne prouve une
validation humaine. La recherche backend est bornée à 80 caractères et à 20
résultats par page ; la vue charge jusqu’à 96 métadonnées, sur cinq pages au
plus. Les liens du graphe proviennent exclusivement de Wikilinks résolus dans
ce même Project. Les liens cassés restent explicites. Aucun lien entre les
notes personnelles et le coffre backend n’est inventé.

Un Project mémorisé localement mais non confirmé par Management ne déclenche
aucune lecture du coffre. Un coffre existant et vide produit « Coffre vide » ;
une source absente, incompatible, trop grande ou déconnectée reste indisponible.
Le Project historique `default` n’est pas couvert par cette projection, car son
coffre se situe hors de l’arborescence des Projects gérés. Les bases de thèses et
contradictions PostgreSQL restent indisponibles faute d’un contrat de lecture
structuré distinct. `/api/wiki/*` et `compile_wiki.py` ne sont jamais appelés.
Le lecteur historique de missions reste limité à son `morgoth_test` jetable.

## Interface

Connaissances propose « Notes personnelles » et « Connaissances Morgoth ».
Seules les premières sont modifiables. Le coffre affiche liste, recherche
dans titre/contenu, détail, liens sortants, rétroliens et graphe global/local.
Le graphe et les résultats portent la même identité de Project. La palette
Ctrl/Cmd+K consulte le coffre seulement si le catalogue Management a confirmé
le Project et si une recherche d’au moins deux caractères est saisie. Aucune
requête Ollama ni compilation wiki ne peut résulter de ces interactions.

## Prévisualisation jetable

Depuis la branche UI D6 propre et le backend D6 épinglé, avec les dépendances
front et le binaire natif construits :

```bash
cd /home/corio/Morgoth/dev-desktop-d6-ui
cargo build --manifest-path desktop/src-tauri/Cargo.toml --features desktop --bin morgoth-desktop --bin d6-knowledge-smoke
/home/corio/Morgoth/morgoth/.venv/bin/python desktop/scripts/d6_knowledge_fixture.py --window --x11
```

Le fixture crée deux Projects et deux fichiers Markdown **synthétiques** sous
un HOME temporaire. `project_a` contient un lien résolu et un lien cassé ;
`project_b` a un coffre réellement vide. Il ne lit pas les notes personnelles
et ne crée aucune mission. Fermer la fenêtre laisse le fixture supprimer ses
propres données. Un lancement personnel normal utilise les configurations
Tauri D5 existantes et le même identifiant d’application
`com.coriom.morgoth.projects` ; aucun stockage D4/D5 n’a été déplacé.

## Vérification et limites

- Backend : 4 nouveaux tests hermétiques passent (authentification, Project A/B,
  recherche, pagination, liens, répertoire substitué, symlink, fichier trop
  grand, UTF-8 invalide, source vide/absente). Avec les régressions Management,
  `python -m pytest -q tests/test_management_api.py tests/test_desktop_knowledge_read.py`
  passe **16/16** dans l’environnement autorisant le transport local de test.
- Frontend : typecheck et contrat épinglé passent ; 47 tests Vitest passent ;
  build Vite passe. Les tests D6 couvrent refus de DTO, corpus borné,
  distinction vide/indisponible, document et graphe.
- Rust : 30 tests de bibliothèque passent ; Clippy strict et binaire Tauri
  Linux passent. Le smoke natif jetable prouve Project A, détail, lien, recherche,
  Project B vide et 404 inter-Project par l’API authentifiée réelle.
- La fenêtre WSLg/XWayland de 1120×780 a été ouverte et inspectée avec Project
  A et B. AT-SPI a sélectionné A, ouvert Connaissances Morgoth, le document,
  le graphe, puis B ; l’état « Coffre vide » de B a été observé sans document
  A. Le smoke sans fenêtre s’est terminé avec le code 0 ; la session visuelle
  a été interrompue par Ctrl+C après les captures, donc sa sortie est 1.
  Les captures finales D6 sont dans `docs/screenshots/d6-native/` ; elles
  montrent des données synthétiques. L’entrée libre de texte par AT-SPI reste
  une limite du contrôle automatisé WebKitGTK, pas une preuve d’échec de l’UI.

Le coffre est volontairement petit et fail-closed : 96 documents, 16 KiB par
fichier, 32 liens par fichier, profondeur trois. Le graphe ne fait aucun
raisonnement sémantique. Le lecteur backend effectue un parcours synchrone
strictement borné au sein de la route ; les tentatives de dispatch via thread
pool ont bloqué dans la pile ASGI de test. Un grand coffre renvoie une erreur
explicite et demandera un futur contrat de pagination/lecture non bloquante.
La présence éventuelle de connaissances dans le coffre normal de l’utilisateur
n’a pas été inspectée : seul le corpus jetable est démontré ici.
