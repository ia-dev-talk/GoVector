# GoVector V1 — handoff final du 14 septembre 2026

## Source de vérité et sécurité

- Dépôt historique : `https://github.com/BigDataai-Dev/bluevector.git`
- Dépôt GoVector de livraison : `https://github.com/ia-dev-talk/GoVector.git`
- Branche de travail protégée : `delivery/govector-final-20260914`
- Base complète : `fix/govector-full-recovery-20260914` / `recovery/bluevector-full-20260914`
- Sauvegarde des migrations locales initiales : branche `backup/govector-local-migrations-20260914`, commit `1618017`
- Ne jamais repartir de `delivery/praxedo-qfield-20260914`, qui appartient à une lignée incomplète.
- Ne pas faire de `reset --hard`, `clean -fd`, réécriture de branche ou fusion automatique vers `main`.

Au dernier checkpoint fonctionnel poussé, HEAD est `18549a0` sur
`delivery/govector-final-20260914`. La branche est présente sur les deux dépôts.
Les commits GoVector ajoutés pendant la reprise sont :

1. `c812c6d` — identité GoVector et vrai logo ;
2. `867e0b9` — import fiable, technicien source séparé et absence de valeurs inventées ;
3. `8bf088f` — éligibilité d'affectation gouvernée côté serveur et interface ;
4. `6fecaee` — correction de la route de hiérarchie territoriale qui répondait 405 ;
5. `6664ec6` — import QGIS RAR/Shapefile sécurisé et reprojeté ;
6. `18549a0` — catalogue de formulaires terrain administrable et versionné.

## Fonctionnel livré dans cette reprise

- Logo réel `frontend/src/assets/govector-logo.png` sur connexion et navigation ; placeholders `GV` retirés.
- Import Excel/CSV preview + confirm : `TECHNICIEN` devient une donnée historique
  `operational_data.source_technician_name`, jamais une affectation GoVector.
- Import idempotent par référence, modes création/mise à jour/ignoré cohérents,
  type et compétences non inventés, GPS absent conservé à `NULL`.
- Affectation multi-interventions : secteur canonique unique obligatoire, contrôle
  côté serveur des secteurs d'équipe, compétences, disponibilité, planning,
  chevauchements et capacité ; audit/historique préservés.
- Paramètres : référentiels existants conservés et nouveau catalogue formulaires
  avec création, duplication, nouvelle version, activation/désactivation,
  associations activité/opérateur/client, champs texte/nombre/choix/photo/mesure/signature,
  obligatoire et ordre. Une version publiée ne peut être réécrite ni supprimée.
- Hiérarchie territoriale montée sur `/api/v1/territories` au lieu d'être imbriquée
  à tort sous `/api/v1/sectors`.
- Import QGIS RAR isolé depuis le commit historique utile seulement : protections
  path traversal/bombes d'archive, extraction `unar`, XML `defusedxml`, Shapefile,
  reprojection EPSG:26191 vers WGS84 et conservation des groupes QGIS.
- Aucune occurrence de `33.649915,-7.473584` dans le code opérationnel. La carte
  de saisie peut être centrée visuellement sur Casablanca, mais ne crée aucun
  marqueur et n'enregistre rien avant une action explicite.
- Contrats Praxedo/QField préservés. Aucun tenant Praxedo réel n'est déclaré validé.

## Preuves disponibles

- Backend import ciblé : 28 réussis.
- Backend affectation et rôles associés : 64 réussis, 1 ignoré.
- Backend territoire : 2 réussis.
- Backend SIG : 31 réussis, 2 ignorés.
- Backend paramètres/référentiels/formulaires : 20 réussis.
- Frontend : lint sans erreur (1 avertissement hooks préexistant), 287/287 tests,
  build Vite production réussi.
- Mobile : `flutter pub get` réussi ; `flutter test` 98/98 réussi.
- `flutter analyze` retourne 203 diagnostics historiques (warnings/info), donc
  n'est pas vert. Aucune mise à niveau Flutter ni nettoyage large n'a été entrepris.
- Alembic : une seule tête, `gu1q2r3s4t5u` (v043).
- L'archive ANFA originale n'est pas suivie par Git. Le contrat de reprojection
  est testé synthétiquement ; le nombre réel de 2 415 géométries ne doit être
  déclaré validé qu'après essai de l'archive originale hors Git.

## État des contrôles longs à reprendre si interrompus

Au moment de rédiger ce document, la reconstruction Docker et la génération de
`app-debug.apk` sont encore en cours. Mettre à jour cette section avec leur sortie
finale. Le test backend complet sur PostgreSQL propre reste à lancer après santé
Docker. La validation physique tablette/4G/offline/resynchronisation reste humaine
et obligatoire : aucun test local ne la remplace.

## Commandes de reprise immédiate

```powershell
cd C:\Users\Guest\Desktop\optmontana\bluevector-clean-upload
git status --short
git branch --show-current
git rev-parse --short HEAD
git fetch --all --prune
git log --oneline -8
docker compose ps
```

Quand les fichiers de ce handoff sont commités, pousser explicitement vers les
deux dépôts (l'upstream local pointe désormais vers GoVector) :

```powershell
git push govector delivery/govector-final-20260914
git push origin delivery/govector-final-20260914
```

## Installation demain sur le serveur Linux local

Ne mettre aucun secret dans Git. Préparer un `SECRET_KEY` long et aléatoire dans
le `.env` du serveur, puis :

```bash
git clone https://github.com/ia-dev-talk/GoVector.git govector
cd govector
git checkout delivery/govector-final-20260914
cp .env.example .env
# renseigner SECRET_KEY, mots de passe PostgreSQL et CORS_ORIGINS dans .env
docker compose up -d --build
docker compose ps
docker compose logs --tail=200 migrate app
curl --fail http://127.0.0.1:8080/health
docker compose exec app python -m alembic current
```

Sur le LAN, le web est ensuite accessible via `http://IP_DU_SERVEUR:8080`.
Pour la 4G, choisir une adresse HTTPS durable avant de compiler l'APK : VPN privé
géré (par exemple Tailscale) ou tunnel nommé avec contrôle d'accès. Le profil
`pilot-4g` fournit un tunnel de démonstration éphémère et limite l'exposition à
`/health` et `/api/v1/*`, mais ne remplace pas une configuration durable. Ne
jamais exposer PostgreSQL ni publier un secret.

Build APK debug après fixation de l'URL HTTPS :

```bash
cd mobile_app
flutter pub get
flutter test
flutter build apk --debug --dart-define=API_BASE_URL=https://ADRESSE-HTTPS/api/v1
```

APK attendu : `mobile_app/build/app/outputs/flutter-apk/app-debug.apk`.

## Todo P0 restant

1. Terminer Docker, confirmer migration v043 et `/health`.
2. Lancer le backend complet contre PostgreSQL propre et consigner le résultat.
3. Fixer l'URL HTTPS/VPN du serveur puis reconstruire l'APK avec cette URL.
4. Tester physiquement sur tablette : Wi-Fi coupé, 4G, compte technicien, capture
   GPS réelle, photo/mesure/signature, passage offline, outbox puis resynchronisation.
5. Tester les rôles ADMIN, ORIENTEUR, CHEF_ORIENTEUR et TECHNICIAN dans l'UI servie.
6. Essayer l'archive ANFA originale hors Git et vérifier exactement 2 415 géométries.
7. Seulement après ces preuves, créer/pousser `release/govector-v1-final-20260914`.
