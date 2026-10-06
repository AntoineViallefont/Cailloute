# Licences et crédits

## Code de Cailloute

Le code original est publié sous [MIT](../LICENSE), licence permissive compatible avec les composants conservés, sous réserve de leurs obligations propres. La permission concerne uniquement les droits de l’éditeur ; elle ne remplace aucune licence de tiers.

La liaison restrictive React Leaflet a été remplacée par une intégration originale utilisant directement l’API publique de Leaflet. Aucun code de React Leaflet n’est incorporé à cette intégration. L’ancien modèle de têtes non exécuté est exclu de la copie publique ; le détecteur de visages effectivement utilisé est conservé.

## Composants

- React, Capacitor, ONNX Runtime et de nombreux utilitaires : MIT.
- Leaflet et SunCalc : BSD-2-Clause ; Supercluster et Lucide : ISC.
- Firebase, Dexie et composants AndroidX : Apache-2.0.
- Manrope : SIL Open Font License 1.1.
- `opening_hours` : LGPL-3.0-only pour le moteur, avec licences de données internes décrites par son dossier LICENSES/REUSE. Les sources amont exactes et les fichiers du paquet npm inchangé sont conservés sous `tiers/opening_hours-3.14.0/`. Il est possible de le modifier et de reconstruire l’application selon COMPILER.md ; aucune interdiction d’ingénierie inverse nécessaire au débogage de ses modifications n’est ajoutée.
- YuNet : MIT, Shiqi Yu. Poids et licence dans `app/public/photo-privacy/`.
- Google Play services (connexion Google et localisation native) : composants propriétaires sous [conditions du SDK Android](https://developer.android.com/studio/terms). Ils ne deviennent pas MIT. Le code original est ouvert, mais l’APK officiel et ses services ne constituent pas un ensemble entièrement libre. Le SDK de développement lui-même n’est pas redistribué. Les notices Android sont conservées dans `tiers/licences-android.txt`, accessibles aussi depuis les informations de l’application.
- Dépendances Python : licences propres aux paquets verrouillés, notices dans `tiers/licences-python.txt`.

Les textes complets des composants JavaScript distribués sont réunis dans `app/public/licences-composants.txt`. Les textes juridiques sont conservés dans leur langue originale pour éviter une traduction faisant foi non autorisée. Les sources et outils nécessaires pour reconstruire et remplacer les composants libres sont accessibles ; une compilation personnelle doit utiliser sa propre signature Android et ne remplace pas nécessairement une installation officielle.

## Données ouvertes

La base dérivée incluant OpenStreetMap est distribuée sous [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/), © contributeurs OpenStreetMap. Les données DATAtourisme et producteurs territoriaux conservent la Licence Ouverte 2.0 ; les données CC0 conservent leur statut. Les attributions, sources et dates sont conservées dans les enregistrements. Les faits publics sur les enseignes et les descriptions originales ont été intégrés à la base dérivée. Les crédits de contenu restent distincts des droits sur la base.

Le paquet `Cailloute-donnees-0.1.63.tar.gz` de la version GitHub fournit la base sous forme exploitable par machine, avec les fichiers sources nécessaires à cette version. MIT ne s’applique pas à ces données. Les sources non confirmées, les comptes, contributions privées, originaux de photos, clés et bases personnelles ne sont pas inclus.

Les fonds de carte proviennent de l’IGN et ne sont pas redistribués en tant que tuiles dans les archives. Les captures conservent leur attribution. Météo : Open-Meteo ; qualité de l’air : CAMS ENSEMBLE. Les services restent soumis à leurs conditions ; l’offre Open-Meteo sans abonnement est notamment destinée aux usages non commerciaux. Une réutilisation commerciale du code exige de choisir des services adaptés.

## Logo

Le logo et le nom servent à identifier le projet Cailloute. Leur redistribution inchangée avec cette application et leur emploi pour présenter le projet sont autorisés. Les forks doivent éviter toute confusion ou suggestion d’approbation. Pour une autre utilisation, demander l’accord du titulaire. Le code et les données restent réutilisables selon leurs licences ; aucun dépôt de marque n’est revendiqué.

## Références

[MIT](https://opensource.org/license/mit) · [Leaflet](https://github.com/Leaflet/Leaflet/blob/v1.9.4/LICENSE) · [ODbL](https://opendatacommons.org/licenses/odbl/1-0/) · [opening_hours](https://github.com/opening-hours/opening_hours.js) · [Conditions Open-Meteo](https://open-meteo.com/en/terms)
