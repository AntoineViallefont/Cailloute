# Origine des sources

Version npm 3.14.0, `gitHead` : `5d1d8f5a924d89cc08ad6f5ef70e08b61bbb274f`. Sources complètes du dépôt https://github.com/opening-hours/opening_hours.js à ce commit, accompagnées des fichiers compilés du paquet npm inchangé utilisé par Cailloute.

Les données de vacances générées sont déjà dans `src/holidays/generated-openholidays.js` ; les sous-modules optionnels de rafraîchissement des vacances et de démonstration YoHours ne sont pas nécessaires à cette compilation.

Pour modifier et reconstruire depuis ce dossier :

```sh
npm ci --ignore-scripts
npm run build
```

Remplacer ensuite `app/node_modules/opening_hours/build/` par le dossier `build/` obtenu, puis reconstruire Cailloute selon `docs/COMPILER.md`, avec sa propre signature Android. Un prochain `npm ci` de Cailloute réinstalle la dépendance verrouillée ; conserver ses modifications dans un fork.
