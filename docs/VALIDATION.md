# Validation de la bêta 0.1.63

Contrôles réalisés le 6 octobre 2026. Cette page distingue les essais techniques d’une validation sur téléphone réel.

## Résultats techniques

- Interface : 354 tests automatisés réussis (62 fichiers).
- API Python : 44 tests réussis ; deux avertissements de dépréciation de dépendances, sans échec.
- Règles Firestore : 53 scénarios et 3 contrôles d’accès administrateur réussis dans un projet de démonstration isolé. Aucun compte réel ni écriture de production utilisés.
- Parcours navigateur : carte, cinq marqueurs fictifs, vue satellite IGN, changement de zone, thème nuit, liste et fiche. Aucune erreur JavaScript relevée. Comparaison des trois captures avec la version 0.1.62 : aucun pixel différent au seuil de 12 niveaux par canal sur 378 000 pixels par capture.
- Android : compilation release, vérification de signature et installation sur émulateur dédié Android 16 / API 36.1 ARM64. Le minimum déclaré est Android 9 / API 28 ; Android 9 n’a pas été exécuté lors de cette validation.
- Migration : installation de la 0.1.62, insertion de données strictement fictives, puis mise à jour signée avec la nouvelle clé dédiée et sa preuve de rotation. Comparaison intégrale des enregistrements de test : lieux, fiches avec avis/photo fictifs, contributions personnelles, favoris, file de contributions et témoin de stockage local. Données conservées, navigation Carte/Favoris/Profil vérifiée.
- Instrumentation de la release : 4 tests réussis, dont migration et décodage photo. Trois autres tests de file native réussis dans une compilation de développement activant le serveur de test local ; cette file historique n’envoie rien dans le mode personnel de la bêta officielle. La collaboration publique utilise Firebase.
- Composant LGPL `opening_hours` : reconstruction depuis les sources amont exactes ; les deux fichiers JavaScript utilisés sont identiques octet par octet à ceux du paquet npm 3.14.0.
- Audit npm des dépendances de production : aucune vulnérabilité connue signalée au moment du contrôle. Ce résultat ne garantit pas l’absence de défaut.
- Détection de secrets avant publication : analyse du contenu destiné au dépôt et contrôle complémentaire des chemins privés, comptes et clés. La configuration cliente Firebase est intentionnellement publique ; elle n’accorde aucun droit administrateur. Les clés de signature et configurations locales restent exclues.

Les références de test sont conservées dans les sources ; les journaux locaux susceptibles de contenir des chemins de travail restent privés. Les captures portent une étiquette de démonstration et n’utilisent aucun compte réel.

## Signature et mise à jour

Identifiant Android : `fr.cailloute.app`. Version : `0.1.63`, code `64`.

Certificat dédié SHA-256 :

```text
4298b9d00f902e96ccee94764ea7bcbc568366e41fe10b7c14202f1f4f591ae2
```

Le certificat antérieur était partagé avec une autre application. La bêta emploie désormais une clé propre à Cailloute. La preuve de rotation Android v3 accompagne l’APK et les sources ; elle permet la mise à jour depuis l’ancienne signature sur les versions Android compatibles. L’APK 0.1.62 original reste conservé dans les archives privées du mainteneur. Ne pas désinstaller l’application pour effectuer la mise à jour.

Le nouveau certificat est enregistré dans Firebase. Cette configuration technique ne constitue pas une validation de connexion Google sur un téléphone réel.

## À valider par les testeurs sur téléphone

- Mise à jour sans désinstallation, puis conservation de vos favoris et contributions.
- Connexion Google et par compte, permissions, géolocalisation et caméra.
- Photos, masquage des visages, reprise après fermeture et synchronisation réelle.
- Lisibilité en extérieur et en mode nuit ; consultation hors connexion dans une zone préalablement enregistrée.
- Comportement sur Android 9 et autres modèles, avec leurs restrictions propres.

Aucune campagne terrain ni validation sur téléphone physique n’est revendiquée. Aucun test réel de charge ou garantie de disponibilité n’est annoncé. Les essais de démonstration ne valident pas l’exactitude des lieux référencés.
