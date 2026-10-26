# Desktop D8 — sauvegarde portable de l’espace personnel

## Portée

D8 exporte uniquement les **notes humaines locales** (`knowledge-v1`) et les **briefs de mission locaux** (`mission-workspace-v1`) du Project géré sélectionné. Les stores existants restent à leur emplacement et dans leur format D4/D5. L’identifiant Tauri reste `com.coriom.morgoth.projects`. Le coffre Markdown du backend, les mémoires agent, modèles, jetons, processus et données d’autres Projects sont exclus. Une sauvegarde n’est ni une synchronisation ni une protection automatique.

L’interface impose une identité de Project présente dans le catalogue Management authentifié, gérée et valide. Aucun appel d’inférence ni mutation du backend n’est ajouté. Quatre IPC fixes comptent, exportent, prévisualisent et appliquent la restauration. Le WebView ne transmet jamais un chemin de fichier : un dialogue GTK natif choisit la destination ou la source, et la prévisualisation ne rend au WebView qu’un jeton éphémère et un reçu borné. La restauration demande aussi une confirmation **native** indépendante du bouton React. L’application revalide le fichier et son empreinte lors de l’application. L’annulation du dialogue n’écrit rien.

## Format 1

Extension : `.morgoth-workspace.json`. Il s’agit d’un JSON UTF-8 inspectable, limité à 32 Mio. Il ne contient ni ZIP, ni compression, ni entrée à extraire. L’absence de décompression élimine les bombes de décompression et les chemins internes. Le manifeste contient le Project canonique, le format/version, l’horodatage d’export, la provenance `HUMAN_LOCAL`, les nombres d’entrées et l’exclusion explicite du coffre backend. Les notes et briefs sont triés par identifiant stable. Chaque enregistrement porte SHA-256 de sa sérialisation canonique et le payload entier porte une empreinte SHA-256. Les UUID, liens Markdown, révisions et horodatages sont conservés. Une modification du fichier invalide sa vérification.

Le fichier contient potentiellement des informations personnelles et **n’est pas chiffré**. La création locale tente le mode 0600, mais les permissions Unix ne sont pas garanties sur les montages Windows ou supports amovibles. Il faut choisir un support de destination de confiance et sécuriser le transfert. L’application refuse les liens symboliques, composants de chemin non canoniques, la destination située dans ses données locales, les conflits de nom, les fichiers excessifs ou incompatibles. Une publication atomique sans remplacement utilise un fichier temporaire synchronisé et un lien dur dans le même répertoire ; un support incapable de fournir cette primitive est refusé. Si la synchronisation finale échoue après publication, le fichier peut exister malgré une erreur : vérifier son intégrité et choisir une nouvelle destination avant tout nouvel export.

## Restauration et panne

Seul un Project géré existant ayant **le même ID canonique** est admis. Les notes et briefs du Project cible doivent être vides. L’archive est intégralement analysée et validée avant l’écriture : schémas, taille, identité, contenu, limites actuelles des stores, UUID, doublons, empreintes. Les liens cassés restent visibles comme tels ; aucun UUID n’est réécrit. La restauration ne fusionne jamais, ne supprime rien et ne remplace aucun fichier existant.

Les deux stores sont des répertoires séparés : la transaction globale ne peut pas être publiée atomiquement. D8 écrit un journal privé et synchronisé avant le premier enregistrement. Si l’application est interrompue, le journal reste; une nouvelle sélection explicite du **même fichier et de la même empreinte** permet une reprise, après vérification que les données déjà présentes sont exactement un sous-ensemble de l’archive. Une archive différente, une modification locale ou un journal incompatible bloque la reprise. Une restauration terminée retire et synchronise le journal. Aucun nettoyage ne supprime les notes ou briefs publiés. Une erreur de synchronisation finale peut rendre l’issue incertaine; inspecter les enregistrements avant toute autre action.

## Migration vers un autre Linux/WSL

1. Sur l’ancienne machine, lancer le vrai Desktop D8, sélectionner le Project, ouvrir **Réglages → Données et sauvegardes**, choisir **Exporter le Project…** et conserver le fichier hors du répertoire applicatif. Vérifier le nombre de notes/briefs et l’empreinte affichée.
2. Transférer le fichier de façon sûre. Ne pas le déposer dans un dépôt Git ni un service partagé non voulu.
3. Sur la nouvelle installation, lancer D8 avec un Management home persistant; créer ou sélectionner un Project géré portant **exactement le même ID**, sans créer de notes ni briefs.
4. Ouvrir **Données et sauvegardes → Choisir une sauvegarde à restaurer…**. Vérifier ID, date, comptes et empreinte, puis confirmer explicitement.
5. Fermer et rouvrir l’application. Contrôler notes, briefs, recherche, liens, backlinks et graphe. Le coffre backend n’est pas restauré par cette opération.

Lancement normal depuis le worktree D8 :

```bash
/home/corio/Morgoth/morgoth/.venv/bin/python desktop/scripts/launch_d8.py --home /home/corio/Morgoth/personal-management
```

Aperçu jetable, avec un `HOME` et un `XDG_DATA_HOME` isolés :

```bash
/home/corio/Morgoth/morgoth/.venv/bin/python desktop/scripts/launch_d8.py --preview
```

Le mode jetable est supprimé à sa fermeture : ne pas y créer de données personnelles à conserver. Le lancement normal conserve les données de l’identifiant Tauri existant. Les deux commandes exigent le checkout D8 et le backend D6 épinglé. Aucun service global ou lancement d’agent n’est créé.

## Vérification et limites

Tests requis : round trip sur deux racines séparées, identité Project, intégrité, doublons, données malformées, symlinks, conflits, reprise après interruption, IPC fixe, contrôle visuel de la fenêtre native et tests React. Le mode natif qualifié est Linux/WSL; le format JSON lui-même est indépendant de la plateforme. La compatibilité d’une application Windows native n’est pas revendiquée.

Contrôle manuel final : créer deux briefs et trois notes, relier deux notes avec le sélecteur de lien, exporter, inspecter le fichier hors du répertoire applicatif, restaurer dans un nouveau profil D8 avec Project de même ID, rouvrir, vérifier liens/backlinks/graphe et l’isolation d’un second Project. Si l’automatisation AT-SPI ne saisit pas les textes ou ne manipule pas le dialogue GTK, cette étape reste à effectuer par l’opérateur et ne peut pas être déduite des tests de stores.

## Preuves d’acceptation du candidat D8

Base D7 exacte : `a3a364ef315525de3b8c42fefe5c94c937f0cf0d`. Backend D6 compatible inchangé : `3f18a375453af0c8efe2586440b3e8612707c6f2`.

- `npm run contract:check` : PASS, schéma OpenAPI épinglé inchangé.
- `npm run typecheck` : PASS.
- `npm test -- --maxWorkers=1` : 8 fichiers, 55 tests PASS. Le lancement par défaut a aussi passé avant l’ajout du contrôle de refus natif (54/54). Une exécution ultérieure simultanée à Clippy a échoué à créer huit workers (`Timeout waiting for worker to respond`, aucun test exécuté) ; la relance seule avec un worker a passé, sans augmentation de délai.
- `npm run build` : PASS; avertissements Vite existants liés aux directives `use client` de TanStack Query.
- `cargo test --offline --lib --no-default-features` : 36/36 PASS, dont les quatre tests D8 d’export, relecture sur une seconde racine, integrity, refus et reprise.
- `cargo fmt --all --check`, `cargo clippy --offline --all-targets --features desktop -- -D warnings`, `cargo build --locked --offline --features desktop --bin morgoth-desktop --bin d7-personal-smoke` : PASS.
- `desktop/scripts/d7_personal_smoke.py` : premier essai FAIL par `STARTUP_TIMEOUT` Management au délai existant de 20 secondes; second essai PASS dans un nouveau répertoire jetable, Project créé, moteur non démarré, briefs/notes rouverts, séparation de Projects. La cause précise du premier délai n’est pas établie.
- `desktop/scripts/launch_d8.py --preview --check` : PASS.
- Fenêtre Tauri réelle sous WSLg/XWayland : ouverte avec un répertoire applicatif et un Management home jetables; sélection d’un Project géré synthétique, navigation vers Réglages → Données et sauvegardes, contrôles disponibles. Le sélecteur `FileChooserNative` initial a produit des avertissements GTK et aucun dialogue accessible; il a été remplacé par `FileChooserDialog`, vérifié accessible. Un premier export natif a créé un JSON vide hors des données applicatives. Un second export, depuis une fixture persistée, a créé un JSON contenant **2 notes, 1 brief et un lien UUID résolu**, avec Project exact, mode 0600 et empreinte SHA-256 présente. Le dialogue de restauration s’ouvre et présente le fichier, mais l’automatisation AT-SPI n’a pas achevé sa sélection; le parcours natif de restauration de documents reste **à confirmer manuellement**. La capture GDK de la fenêtre était noire : aucune capture n’est présentée comme une preuve visuelle. Tous les fichiers de fixture et processus possédés par cette procédure ont été supprimés/arrêtés.

Le test de store Rust prouve la conservation exacte de 3 notes, 2 briefs, révisions, Unicode, collections, lien UUID et lien cassé après restauration sur une nouvelle racine. Les tests React vérifient la résolution UUID, les backlinks et l’arête du graphe à partir de notes persistées synthétiques. Ils ne remplacent pas une saisie complète dans le WebView ni une restauration native manuelle avec contenu non vide.
