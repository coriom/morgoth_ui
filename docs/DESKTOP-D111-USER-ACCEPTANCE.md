# Desktop D11.1 — sauvegarde des briefs et lisibilité

D11.1 part du candidat natif D11 `4381ce328767ce7e9936bb96735a337c6703fd1a`. Le backend compatible reste épinglé à `a91377c9ace8d70bf64aa44b3bd54773af612e3a`. L'identifiant Tauri `com.coriom.morgoth.projects`, les magasins D4/D5, les sauvegardes D8 et les autorisations de lecture backend restent inchangés.

## Correction produit

Le formulaire D11 déclarait trois champs HTML `required`. En cas d'omission, le navigateur pouvait empêcher `submit` avant le gestionnaire React, sans le message prévu par l'application. Les zones de texte hautes et l'espacement vertical repoussaient également l'action sous la fenêtre. D11.1 valide explicitement les trois champs dans le gestionnaire, explique l'omission, concentre le premier champ invalide, empêche les doubles soumissions et conserve le texte si l'IPC refuse. L'éditeur est plus compact et dispose d'une zone de défilement avec actions persistantes. Une sauvegarde réussie est signalée ; les contrôles de révision et l'isolement par Project du magasin Rust restent en place.

La bande Management permanente disparaît des vues de productivité. Son état, la dernière lecture et l'actualisation se trouvent dans **Réglages → Vue générale et diagnostics**. Les erreurs nécessaires aux opérations restent contextuelles.

Le pied de la barre latérale propose **A− / pourcentage / A+**. Les niveaux sont 90, 100, 110, 120, 130 et 140 % ; le niveau 100 % correspond à une base visuelle 8 % plus grande que D11. Le bouton central remet à 100 %. Une commande Tauri fixe lit et écrit `mission-workspace-v1/text-size-v1.json` dans le répertoire de données applicatif existant, avec validation, fichier privé, écriture atomique et refus d'un ancien fichier malformé. Aucune préférence ne part au backend. Les polices Source Sans 3 restent embarquées. Le dialogue GTK natif garde la taille décidée par le système.

Un coffre backend vide est maintenant expliqué comme une source distincte des notes personnelles ; aucun agent ne le remplit automatiquement. Le graphe personnel montre les notes isolées, explique l'absence de liens UUID et distingue une lecture locale échouée d'un ensemble réellement vide. Les filtres qui masquent tout produisent une explication. Aucun lien n'est inventé.

## Construction et lancement

Sur la branche D11.1 propre, installer les dépendances épinglées si nécessaire, puis construire la release une fois :

```bash
cd /home/corio/Morgoth/dev-desktop-d111-ui
python3 desktop/scripts/build_d11.py
```

Lancement normal avec un Management home privé préexistant :

```bash
python3 desktop/scripts/launch_d11.py --home /CHEMIN/ABSOLU/VERS/MANAGEMENT_HOME
```

Prévisualisation jetable :

```bash
python3 desktop/scripts/launch_d11.py --preview
```

Le reçu `morgoth-d111-release.json` lie le binaire, l'index des assets et le commit source. Le lanceur vérifie le backend propre et épinglé. Node et Vite ne sont requis que pour construire, pas pour lancer. La lecture PostgreSQL structurée reste optionnelle via `--memory-read-config`; aucune inférence n'est lancée.

## Vérifications locales et acceptation native

Sur des données synthétiques et un répertoire applicatif jetable, le binaire Tauri release a été lancé sans serveur Vite. À 140 %, le bouton Enregistrer est visible à 1120×780, 1100×750 et 960×640. Une soumission incomplète affiche l'erreur et concentre le premier champ manquant. Après saisie des trois champs, un clic sur Enregistrer a créé un brouillon privé dans le magasin Rust ; après arrêt et redémarrage du binaire, ce brouillon a été rouvert, modifié et sauvegardé en révision 2. Le retour visuel « Brief enregistré localement » a été observé. Les captures de cette seule fixture se trouvent dans `docs/screenshots/d111-*.png`.

La même fenêtre native a montré le coffre backend accessible et vide, sans le confondre avec les notes personnelles. Une note personnelle créée dans l'éditeur apparaît comme nœud isolé. Une deuxième note contenant un lien UUID vers la première a produit une arête dans le graphe. Les captures `d111-empty-vault-native.png`, `d111-isolated-note-graph-native.png` et `d111-linked-notes-graph-native.png` documentent ces états. La préférence 140 % a survécu au redémarrage. Ces observations ne concernent aucun document personnel réel.

Vérifications : TypeScript, contrat OpenAPI épinglé, 67/67 tests Vitest, build Vite, format Rust, 69/69 tests Rust et Clippy strict ont réussi. Une création concurrente du répertoire des préférences a été observée sur la première fenêtre native et corrigée avec un test de concurrence ; un ancien fichier malformé reste refusé. Les contrôles de sauvegarde D8, de notes D5/D10 et de lecture Management restent dans les suites de régression. Le processus de construction scellée lie l'index des assets et le binaire au commit source final.

Le test de saisie native a utilisé XTest sur une fenêtre Xvfb, avec seulement des chaînes synthétiques ; il ne constitue pas une vérification du comportement manuel de toutes les installations WSLg. L'utilisateur peut confirmer le même parcours avec son propre Project, ainsi que les niveaux 100, 120 et 140 % et le sélecteur de Project dans sa fenêtre WSLg. Aucune donnée personnelle n'a servi aux tests ou aux captures.
