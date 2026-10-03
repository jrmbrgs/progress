# Progress

Une app pour suivre sa progression au tir en basket : lancers francs, doubles pas, 3 points, floater… C'est une PWA statique (HTML/CSS/JS, sans build ni dépendance), sur la même base que [habits](https://github.com/jrmbrgs/habits), qu'on installe sur l'écran d'accueil de l'iPhone.

## Fonctionnalités
- **Entraînement** : fais une série de tirs, puis touche **+** et choisis le nombre de tirs réussis (0 à 10). Touche un exercice pour revoir tes séries du jour ou en retirer une.
- **Historique** : toutes les séances jour par jour. Touche une séance pour la corriger, ou ajoute une séance passée.
- **Progrès** : réussite sur 30 jours et son évolution, meilleure séance, meilleure série, courbe de progression par exercice, calendrier des entraînements.
- **Exercices** : 9 sont créés au départ (lancers francs, doubles pas droite/gauche, 3 points axe/45°/0°, floater). Le bouton **+** en haut en ajoute d'autres. Chaque exercice a son icône, sa couleur et son nombre de tirs par série (10 par défaut).
- Ça marche hors ligne. Les données sont dans le localStorage de l'appareil, avec un export/import JSON dans Réglages.
- **Synchro entre appareils** via un gist GitHub privé. Dans Réglages → Synchronisation, colle un token GitHub qui n'a que le droit `gist`, et fais-le sur chaque appareil. Le premier appareil crée le gist, les suivants le retrouvent tout seuls. Si les séries d'un même exercice et d'un même jour sont modifiées sur deux appareils, la modification la plus récente l'emporte.

## Lancer en local
```bash
python3 -m http.server 8766
```
Puis ouvre http://localhost:8766.

## Installer sur iPhone
1. Héberge le dossier en HTTPS (GitHub Pages, Netlify Drop, Cloudflare Pages…).
2. Ouvre l'URL dans Safari, puis Partager → **Sur l'écran d'accueil**.

## Déploiement
Chaque push sur `main` déploie sur GitHub Pages via `.github/workflows/pages.yml`. Le workflow renouvelle aussi le cache du service worker, donc les iPhones récupèrent la nouvelle version à l'ouverture suivante.
