# Desktop D5.1 — finition visuelle native

Base fonctionnelle : `caef12c1c7a9a2a38c8c28709c626b6ae822ba40`. Branche isolée : `feat/morgoth-desktop-d5-visual-polish-v1`.

## Décision produit

Le contenu et les actions de D5 restent les mêmes. La feuille `desktop/src/polish.css` est chargée après les styles D5 : elle réduit les capitales et l'espacement des libellés, harmonise les poids, donne plus d'air aux textes longs et maintient des largeurs de lecture adaptées. Les glyphes de navigation disparates deviennent des icônes SVG à trait uniforme, sans bibliothèque ajoutée.

Source Sans 3 est embarquée en WOFF2 variable, droit et italique, sans requête réseau à l'exécution. Source : dépôt officiel Adobe `adobe-fonts/source-sans`, branche `release`, commit `87b37a2daaed80fcb8e8ccb0085c4d72ddade12e`, fichiers `WOFF2/VF/SourceSans3VF-{Upright,Italic}.ttf.woff2`. Licence SIL Open Font License 1.1 d’origine, dont seul un espace final a été normalisé, incluse dans `desktop/src/assets/fonts/LICENSE.md`. Empreintes SHA-256 : droit `5f16566f7a40d39b339ad26be151fa5a1ab1f0c2574c7a2e619765584a1acbd8` ; italique `b4959abc0569392f87c6c6ac612f90e3fe0104d283724189b7d8b6f61af347d3` ; licence `f9e57d28452ab6162c7fc0d248b5a5e81bf64676a6950d56b2e137c1253f79e8`. Le bundle Vite contient les fichiers locaux.

Les barres de défilement restent natives, fines et neutres ; la poignée se renforce au survol. La barre latérale et la liste des notes défilent dans les petites fenêtres. L'éditeur, les listes de missions, le graphe et les réglages conservent le défilement standard au clavier, à la molette et au pavé tactile. Aucun mécanisme JavaScript ne remplace le défilement natif.

Les sélecteurs de Project et de lien interne restent des éléments HTML `select`. Seul leur habillage CSS change : chevron discret, hauteur compacte, alignement et focus visible. La liste déroulante elle-même reste celle de WebKitGTK ; son apparence interne dépend de la plateforme. Aucun listbox personnalisé n'est introduit.

## Portée et sécurité

Aucun changement Rust, IPC, stockage, identifiant Tauri, transport, backend ou autorité. Les notes et briefs existants gardent leur emplacement et leur format. Les permissions, Human Gate 3 et `SAFE_FOR_WORKLOADS=False` ne sont pas touchés. Aucun modèle n'est chargé ou interrogé.

## Vérification

Contrôles de référence : `cd desktop && npm run typecheck && npm run contract:check && npm test -- --reporter=dot && npm run build`. Contrôles natifs : `cd desktop/src-tauri && cargo fmt --check && cargo test --offline --features desktop --lib && cargo clippy --offline --all-targets --features desktop -- -D warnings && cargo build --offline --features desktop --bin morgoth-desktop --bin d2-read-smoke`.

La fixture jetable reste `desktop/scripts/d2_read_fixture.py --window`; D5.1 est explicitement admise dans sa liste de branches, sans changer ses préconditions de dépôt propre, backend épinglé et PostgreSQL temporaire. Elle ouvre deux fenêtres avec le même répertoire temporaire, puis nettoie ses ressources. Les captures et constats natifs sont consignés ci-dessous après leur exécution ; ne pas interpréter une capture Chromium ou un test React comme une observation de WebKitGTK.

## Lancement de prévisualisation

Depuis le worktree D5.1 propre et construit :

```bash
/home/corio/Morgoth/morgoth/.venv/bin/python desktop/scripts/d2_read_fixture.py --window
```

Pour l'installation locale personnelle, le lancement natif normal conserve l'ancien identifiant et les données D4/D5 ; utiliser `cd desktop && npm run tauri dev` uniquement dans l'environnement local configuré. La fixture jetable est recommandée pour l'inspection sans toucher aux notes personnelles.

## Résultats d'acceptation

Sur le code D5.1 avant capture native : TypeScript PASS ; contrat API épinglé PASS ; React/Vitest 42/42 PASS ; Vite PASS (avertissements préexistants `use client` de React Query) ; `cargo fmt --check` PASS ; tests Rust 29/29 PASS ; Clippy strict PASS ; deux binaires Linux Tauri PASS. `fc-scan` a identifié les axes de poids de la fonte variable. Le contrôle final après les derniers ajustements CSS est exécuté séparément. Ces vérifications ne démontrent pas à elles seules le rendu de WebKitGTK.

Inspection native WSLg, captures et limites : à compléter avec l'exécution réelle de la fixture jetable, une fois la branche propre.
