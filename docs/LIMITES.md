# Limites connues

- Bêta Android ARM, Android 9 minimum ; pas de version iOS distribuée.
- Couverture France métropolitaine et Corse, variable selon les données disponibles. Les horaires, équipements, tarifs, coordonnées et informations médicales ne sont pas vérifiés sur le terrain de façon exhaustive.
- Les données embarquées ne rendent pas toutes les fonctions disponibles hors connexion : fond de carte non téléchargé, recherche, météo, connexion et nouveaux tracés peuvent nécessiter le réseau.
- Les services IGN, Open-Meteo et Firebase imposent des conditions, quotas et disponibilités. Le partage n’est pas instantané partout ; la synchronisation automatique peut suivre un cycle quotidien, avec actions manuelles et quotas.
- La détection des visages est imparfaite. Vérification humaine et masquage manuel indispensables.
- Le cache national web peut conserver plusieurs générations de fichiers ; les très grandes bases peuvent ralentir les recherches.
- La connexion Google dépend de Firebase, des services Google présents et de la configuration du téléphone. Son parcours réel requiert un essai volontaire sur téléphone ; aucun compte personnel n’est utilisé par les tests automatisés.
- Les tests d’émulateur et de navigateur ne valent pas validation sur le téléphone d’un utilisateur. Voir `VALIDATION.md` pour le périmètre réellement contrôlé.
- Le serveur Python fourni est une autre voie d’exploitation. La bêta distribuée utilise le mode personnel et le partage Firebase ; aucun serveur Cloud Run public n’est promis par cette livraison.
