# D20 · Enquête GitHub bornée

Dans **Missions → Assistant → Enquête supervisée**, choisir un Project géré,
autoriser un seul dépôt GitHub dans Connexions, puis sélectionner un modèle
Ollama déjà installé. L'option « Enquête supervisée · issues » présente
l'objectif, le dépôt, le modèle et la recette avant une confirmation native.

Une confirmation couvre au plus dix résumés d'issues ouvertes sur la première
page, la lecture exacte de l'issue choisie et deux inférences locales. Le
plafond de sécurité de la session reste de trois lectures, trois tours et dix
minutes. La première lecture est une étape fixe de l'application ; le modèle
choisit ensuite uniquement un numéro réellement observé. Rust vérifie la
source et les références `obs:1` et `obs:2`. Les textes GitHub sont des
déclarations externes non vérifiées. Le rapport est une interprétation du
modèle, sans test ni modification du dépôt.

**Arrêter et révoquer** empêche toute étape suivante. Une lecture ou génération
déjà en cours peut se terminer côté service ; une annulation HTTP ne garantit
pas l'arrêt immédiat du calcul dans Ollama. Après un redémarrage, aucune
enquête ne reprend ; les reçus locaux ne contiennent que des identités, des
empreintes et des états. Une liste vide, une réponse incompatible, une source
modifiée ou une expiration arrêtent la recette sans résultat inventé.

Le rapport et les preuves sont visibles avant tout enregistrement. Pour une
issue précise, « Préparer un brief local » passe par la relecture D17 de la
source, un aperçu éditable et une **nouvelle approbation native**. Le brief
utilise le stockage normal des missions et les sauvegardes D8. Un transfert
vers VS Code requiert ensuite sa propre autorisation. Les sauvegardes D8 ne
sont pas chiffrées et peuvent inclure du texte issu d'un dépôt privé.

## Construction et lancement

Depuis le checkout D20 propre, avec les dépendances Node/Rust/Tauri existantes :

```sh
cd /home/corio/Morgoth/dev-desktop-d20-ui/desktop
npm ci --offline
python3 scripts/build_d11.py
```

Le build Tauri embarque les ressources Vite. Le lancement normal ne démarre
ni Vite ni Node ; Python Management au commit
`a91377c9ace8d70bf64aa44b3bd54773af612e3a` demeure requis. Le
répertoire Management persistant doit déjà exister, appartenir à l'opérateur
et être privé. Ne pas le remplacer par une copie de fixture.

```sh
cd /home/corio/Morgoth/dev-desktop-d20-ui/desktop
MORGOTH_DESKTOP_PLANNER_ENABLED=1 python3 scripts/launch_d11.py --home /CHEMIN/PRIVE/management
```

La prévisualisation jetable :

```sh
cd /home/corio/Morgoth/dev-desktop-d20-ui/desktop
MORGOTH_DESKTOP_PLANNER_ENABLED=1 python3 scripts/launch_d11.py --preview
```

Ollama doit être lancé séparément par l'opérateur et disposer d'un modèle déjà
installé ; Morgoth ne télécharge pas de modèle. Sans `MORGOTH_DESKTOP_PLANNER_ENABLED=1`,
les notes, briefs, connecteurs et autres fonctions restent utilisables, tandis
que l'inférence est désactivée. L'ancien moteur autonome reste hors service.

## Qualification publique du 1er novembre 2026

Le test Rust explicitement activé `live_model_selects_observed_public_issue_and_finishes`
a utilisé le vrai modèle local `qwen3:4b-instruct` (Ollama 0.20.6) et le vrai
dépôt public `microsoft/vscode` (identité numérique `41881900`). Le premier
GET fixe a retourné six issues ouvertes ; le modèle a choisi le numéro
`345408`, contenu dans cet ensemble. Le second GET a lu cette issue exacte.
Les observations `obs:1` et `obs:2` portaient respectivement les SHA-256
`42b16b9014b5b13f665211a637aa10d7345a4f04c85ffb5ccac704da3168f99f`
et `ba6fcd7f60e1706e694f79c4222b0374995297bfd5f99b230c802c380a33e7fb`.
Deux inférences et deux lectures ont produit un rapport validé citant `obs:2`
en 84 secondes. Les issues publiques évoluent : ces numéros et empreintes
sont une observation datée, jamais des fixtures ou des critères immuables.

Cette preuve valide le chemin Rust/Ollama/GitHub. Elle ne prouve pas que les
gestes de confirmation GTK, la création d'un Project depuis la fenêtre, la
réouverture native du brief ou le transfert VS Code ont été effectués par un
opérateur. Les tests de fixture vérifient séparément la persistance D17 et
les refus après arrêt. Pour l'acceptation manuelle : dans un Project de test
stable, autoriser `microsoft/vscode`, ouvrir l'enquête, confirmer la session,
vérifier les deux observations et le rapport, créer le brief via l'aperçu D17,
fermer puis relancer l'application sur le même Management home et rouvrir le
brief. La confirmation de transfert VS Code reste indépendante et facultative.
