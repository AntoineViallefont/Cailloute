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

- Photo de profil et points : la version 0.1.64 les sauvegarde dans l’espace privé du compte. Attendre la confirmation dans Profil avant de désinstaller. Une photo effacée avant cette sauvegarde ne peut pas être reconstruite. Les ajouts historiques confirmés par le serveur peuvent rétablir leurs points ; le total des anciennes corrections perdues n’est pas déductible du compteur serveur (qui inclut aussi avis, photos et validations).
- Un échec de mise à jour via Firebase Tester a été signalé sur Samsung S23 Ultra / Android 16 avec la 0.1.63. Sa cause n’est pas établie. Les contrôles ADB sur émulateur ne reproduisent pas ce parcours Samsung : conserver l’application et signaler le message exact plutôt que désinstaller.
- Le dédoublonnage d’affichage reconnaît les fichiers identiques, pas toutes les photos visuellement proches ou réencodées. Aucun effacement automatique de photos distinctes n’est effectué.
