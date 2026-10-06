# Installer les outils, compiler et mettre à jour

## Prérequis

Git, Node.js 22.12 ou plus récent avec npm, Python 3.14. Android nécessite Java 21, Android SDK Platform 36, Build Tools 36.0.0 et Platform Tools, installables depuis Android Studio → SDK Manager. Pour Linux/Windows, adapter les chemins ; les scripts shell sont destinés à macOS/Linux. Sur Linux, définir JAVA_HOME et ANDROID_HOME avant la compilation.

## Première installation

```sh
git clone https://github.com/AntoineViallefont/Cailloute.git
cd Cailloute
python3 scripts/telecharger-donnees.py
npm --prefix app ci
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements.lock
```

Le téléchargement vérifie l’empreinte de l’archive avant extraction. Aucune base personnelle n’est importée. Les comptes, secrets et photographies privées ne font pas partie des archives.

## Démarrer

```sh
npm --prefix app run dev
```

Ouvrir `http://127.0.0.1:5187/`. Le mode personnel fonctionne sans serveur Python. Pour les essais de l’API Python locale :

```sh
sh scripts/start.sh
```

## Tests et compilation web

```sh
PYTHONPATH=backend backend/.venv/bin/python -m pytest backend/tests -q
npm --prefix app test
npm --prefix app run build
```

Le site généré est dans `app/dist`. Pour les règles Firebase, installer Firebase CLI, avoir Java disponible, puis :

```sh
npm install -g firebase-tools
npm --prefix app run test:free-rules
```

Ce test utilise uniquement `demo-cailloute-free`. La configuration publique de Firebase identifie le service ; elle n’est pas une clé administrateur. Les règles incluses emploient des identités fictives : elles doivent être adaptées dans un projet personnel avant déploiement et ne remplacent pas les règles du service officiel. Aucun secret serveur ne doit porter un préfixe `VITE_`.

## Android pour le développement

```sh
sh scripts/build-android.sh
```

Résultat : `livraison/Cailloute-local.apk`. Cette compilation personnelle ne partage pas la signature publique officielle. L’installer sur un émulateur ou un appareil de développement, sans désinstaller une application contenant des données à préserver. Une clé différente peut empêcher de remplacer la bêta officielle.

La connexion Google native requiert le `google-services.json` de votre projet Firebase, le fournisseur Google activé et les empreintes du certificat choisi. Le fichier local n’est pas publié. La bêta officielle est construite avec la configuration du service Cailloute et un certificat enregistré dans Firebase.

## Reconstruction d’une bêta officielle

Le mainteneur dispose de la clé dédiée, hors dépôt. La preuve de rotation et le certificat sont publics dans `signatures/`. La version distribuée active `VITE_PERSONAL_MODE=true`, `VITE_FREE_COLLABORATION=true` et `VITE_DEV_HTTP=false`. La compilation release désactive le débogage de l’application et le trafic HTTP en clair.

```sh
export CAILLOUTE_KEYSTORE="/chemin/prive/cailloute-public.p12"
export CAILLOUTE_PASSWORD_FILE="/chemin/prive/mot-de-passe.txt"
sh scripts/build-beta.sh
```

La compilation du code est reproductible à partir des dépendances verrouillées et des données de la version ; une égalité binaire complète entre machines n’est pas garantie. La clé privée n’est jamais fournie. Toute personne peut modifier le composant LGPL `opening_hours` depuis `tiers/opening_hours-3.14.0`, le reconstruire selon son README, remplacer la dépendance et reconstruire l’application avec sa propre clé. Les sources, outils et instructions ne restreignent pas ce droit.

## Mettre à jour les sources

Après avoir sauvegardé ou validé vos modifications locales :

```sh
git pull --ff-only
python3 scripts/telecharger-donnees.py
npm --prefix app ci
backend/.venv/bin/pip install -r backend/requirements.lock
npm --prefix app test
```

Ne lancer `npm update` qu’à l’occasion d’une évolution volontaire des dépendances, suivie de tests et d’un audit de licences. Pour une nouvelle version, mettre à jour package.json, package-lock.json, versionName et versionCode Android, les notes et le manifeste de données.

## Vérifier les téléchargements

Télécharger les fichiers et `SHA256SUMS.txt` dans le même dossier. Sur macOS :

```sh
shasum -a 256 -c SHA256SUMS.txt
```

Sur Linux :

```sh
sha256sum -c SHA256SUMS.txt
```

Sur Windows PowerShell, calculer puis comparer au fichier SHA256SUMS.txt :

```powershell
Get-FileHash .\Cailloute-0.1.63-beta.apk -Algorithm SHA256
```
