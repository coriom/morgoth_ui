# D21 · Enquête GitHub et passage VS Code sélectionné

Dans **Missions → Assistant → Enquête supervisée**, le mode GitHub seul de D20
reste disponible sans VS Code. Le nouveau mode « Enquête · issue et sélection
VS Code » ajoute un seul passage choisi par l’utilisateur dans l’éditeur de
l’espace associé. Il ne lit aucun autre fichier et ne donne aucun outil VS Code
au modèle.

## Parcours

1. Choisir un Project géré, autoriser un seul dépôt GitHub et associer le VSIX
   à un espace VS Code Linux/Remote-WSL fiable et à racine unique.
2. Sélectionner 1 à 1024 octets de texte dans un fichier `.md`, `.txt`, `.ts`
   ou `.js` de cet espace. Cliquer « Autoriser la lecture de la sélection… ».
   Une confirmation native précède la lecture.
3. Vérifier l’espace, le document relatif, la version, le texte exact, l’heure
   et le SHA-256 de l’instantané `editor:1` dans Morgoth. Prévoir la session.
4. Vérifier le contexte complet et confirmer séparément l’enquête dans le
   dialogue natif. La sélection est relue pour refuser un document ou texte
   changé avant le démarrage. Une session VS Code révoquée refuse la suite.
5. Le code de confiance lit au plus dix issues ouvertes, le modèle choisit un
   numéro présent dans cette liste, Rust lit l’issue exacte, puis le modèle
   compare les observations `obs:1`, `obs:2` et `editor:1`. Les conclusions
   doivent citer une issue exacte et la sélection ; une relation suggérée ne
   constitue pas une preuve de causalité.
6. Pour enregistrer un brief, examiner l’aperçu éditable D17 et accorder une
   nouvelle autorisation native. Le code n’ajoute pas le passage brut en bloc
   au brief ; le modèle peut néanmoins en citer un extrait dans ses conclusions.
   Contrôler le texte exact de l’aperçu avant de l’enregistrer. Son identité,
   son empreinte et les interprétations approuvées peuvent y figurer. Un envoi dans un onglet VS
   Code non enregistré demande encore un consentement distinct.

La sélection reste en mémoire, liée au Project, à la session VS Code, au
document et à sa version. Elle expire après trois minutes avant démarrage ;
aucun texte sélectionné n’entre dans les reçus durables. Une fois transmise au
modèle local, elle ne peut pas être retirée rétroactivement de son contexte.
Les reçus conservent seulement les empreintes et identités minimales. Une
sauvegarde D8 n’est pas chiffrée : relire tout brief avant d’y copier du code
privé. Les textes GitHub et VS Code restent des données non fiables, jamais
des instructions exécutables.

La recette effectue au plus deux lectures GitHub et deux inférences, avec
plafond absolu 3/3 et dix minutes. Arrêter bloque toute étape suivante.
L’annulation d’un appel HTTP ne garantit pas l’arrêt immédiat d’Ollama.
Ni GitHub ni les fichiers VS Code ne sont modifiés. Le moteur de recherche
autonome historique demeure désactivé.

## Construire et lancer

Dans le checkout D21 propre, avec les dépendances locales déjà qualifiées :

```sh
cd /home/corio/Morgoth/dev-desktop-d21-ui/desktop
npm ci --offline
cd connectors/vscode-extension && npm ci --offline && npm run package:vsix
cd ../..
python3 scripts/build_d11.py
```

Le VSIX optionnel est `connectors/vscode-extension/dist/morgoth-vscode-connector-0.2.1.vsix`.
L’installer volontairement dans un **hôte d’extensions Linux/Remote-WSL**.
Une installation Windows locale seule ne peut pas utiliser le socket Unix.
Ne pas installer automatiquement le VSIX dans le profil personnel.

Lancement avec un Management home existant et privé :

```sh
MORGOTH_DESKTOP_PLANNER_ENABLED=1 python3 scripts/launch_d11.py --home /CHEMIN/PRIVE/management
```

Prévisualisation jetable :

```sh
MORGOTH_DESKTOP_PLANNER_ENABLED=1 python3 scripts/launch_d11.py --preview
```

Ollama et le modèle choisi doivent déjà être présents ; aucun modèle n’est
téléchargé ou lancé automatiquement. Sans VS Code, GitHub ou Ollama, les
fonctions locales de Morgoth restent utilisables. Le lancement ne requiert ni
Vite ni Node ; Python Management épinglé reste nécessaire.

## Limites d’acceptation

Les tests de socket isolé prouvent le protocole et le chemin Rust de
comparaison, pas une lecture issue d’un hôte VS Code réel. Les tests Rust de
brief prouvent la persistance et l’idempotence, pas un clic GTK réel. Rapporter
ces niveaux de preuve séparément. Pour une acceptation opérateur : utiliser un
Project et un espace VS Code synthétiques stables ; sélectionner du texte,
autoriser les deux dialogues, lancer l’enquête, approuver le brief, fermer et
redémarrer Morgoth avec les mêmes données, puis rouvrir le même UUID. Tester
l’envoi VS Code dans un dernier dialogue distinct.

Dans l’environnement de qualification du 1er novembre 2026, un premier
service Ollama 0.20.6 jetable, lancé avec un répertoire de modèles vide,
répondait `models: []`. Le service local habituel exposait bien le modèle déjà
installé `qwen3:4b-instruct`. Un relais temporaire limité au loopback vers ce
service a permis le canari intégré D21 : vrai modèle, vrais GET GitHub publics
sur `microsoft/vscode`, sélection VS Code **synthétique via le protocole privé**.
Le modèle a choisi l’issue observée `#345408` ; les deux observations GitHub
et la référence `editor:1` ont été validées en 26,97 s. Le relais a été arrêté.
Ce succès ne prouve pas une sélection dans un vrai VS Code ni l’autorisation
GTK dans la fenêtre Tauri. Le VS Code Windows installé répond en version
1.140.0 via WSL interop, mais aucun hôte d’extensions Linux/Remote-WSL isolé
n’était disponible pour ce test. La fenêtre Tauri de production a démarré
sous Xvfb avec ses ressources intégrées ; le parcours consentement → brief →
redémarrage reste à accepter dans l’interface avec un Project stable.
