# Confidentialité de la bêta

Cailloute s’adresse aux parents et accompagnants adultes. Il n’y a pas de compte enfant ni de fonction de suivi des enfants.

## Sans compte

Les favoris, avis, corrections et photos personnels restent dans le stockage de l’application. La désinstallation ou l’effacement du stockage peut les supprimer. L’application n’intègre ni publicité ni outil de mesure d’audience.

La consultation peut néanmoins effectuer des connexions : l’IGN reçoit les recherches d’adresse et les demandes de fond de carte ; Open-Meteo reçoit des coordonnées arrondies pour la météo et la qualité de l’air ; Firebase Hosting fournit les compléments de catalogue et les tracés. Ces services reçoivent l’adresse IP nécessaire à la connexion. L’application d’itinéraire choisie reçoit la destination et éventuellement l’origine.

## Avec un compte

Un compte ou Google est recommandé pour participer au partage. Firebase Authentication traite les données de connexion ; Cloud Firestore conserve le profil, les contributions, les favoris synchronisés et les éléments nécessaires à la modération. Les contributions partagées sont visibles sous le pseudonyme. La photo de profil compressée (40 Ko maximum) et les compteurs de points sont sauvegardés dans un document privé du compte, lisible uniquement par ce compte via les règles de l’application. La sauvegarde est supprimée lors de la suppression du compte avec cette version. Elle reste soumise au réseau et aux quotas : l’état affiché dans Profil permet de vérifier sa confirmation. Les photos déjà perdues avant cette mise en place ne peuvent pas être récupérées depuis une sauvegarde qui n’existait pas. Une connexion Google relève également des conditions de Google.

Les contributions anciennes restées privées ne sont pas publiées automatiquement. Les nouvelles contributions en attente restent sur l’appareil si le réseau ou les quotas sont indisponibles. La suppression du compte est proposée dans Profil → Mon compte ; les lieux, avis et photos déjà partagés peuvent rester, avec anonymisation du nom selon les conditions affichées dans l’application. Retirez les contenus concernés avant suppression ou faites une demande privée si nécessaire.

## Photos et permissions

La localisation est facultative et utilisée au premier plan. La recherche manuelle reste possible sans permission GPS. Caméra et accès aux photos sont utilisés à votre demande. Les visages sont détectés et masqués localement ; le résultat doit être vérifié manuellement. L’aperçu compressé envoyé ne conserve pas les EXIF. Un floutage automatique ne garantit pas l’anonymat. Ne publiez pas de personne identifiable sans les autorisations nécessaires.

## Retours et contact

Les issues GitHub sont publiques, avec le pseudonyme GitHub. N’y publiez pas de données privées. Le formulaire de contact de l’application dépose un message dans la boîte privée de l’éditeur ; il nécessite un compte vérifié et n’envoie pas automatiquement d’e-mail. Les messages sont prévus pour être retirés au plus tard 12 mois après traitement, conformément aux conditions affichées.

Les détails applicables au service, aux droits et à la conservation restent consultables dans À propos → Confidentialité et droits. L’offre externe peut évoluer ; aucune garantie de disponibilité permanente n’est donnée.
