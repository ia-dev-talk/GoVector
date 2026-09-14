# GoVector V1 — handoff final du 14 septembre 2026

## Source de vérité et sécurité

- Dépôt historique : `https://github.com/BigDataai-Dev/bluevector.git`
- Dépôt GoVector de livraison : `https://github.com/ia-dev-talk/GoVector.git`
- Branche de travail protégée : `delivery/govector-final-20260914`
- Base complète : `fix/govector-full-recovery-20260914` / `recovery/bluevector-full-20260914`
- Sauvegarde des migrations locales initiales : branche `backup/govector-local-migrations-20260914`, commit `1618017`
- Ne jamais repartir de `delivery/praxedo-qfield-20260914`, qui appartient à une lignée incomplète.
- Ne pas faire de `reset --hard`, `clean -fd`, réécriture de branche ou fusion automatique vers `main`.

Le checkpoint fonctionnel est `18549a0` et le premier commit de ce handoff est
`3ca4017` sur `delivery/govector-final-20260914`. Utiliser `git rev-parse --short HEAD`
pour le dernier commit de preuve. La branche est présente sur les deux dépôts.
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
- Backend complet avec PostgreSQL Docker sain : 681 réussis, 22 ignorés,
  aucun échec. Un ancien test qui acceptait une ligne Excel sans référence a
  été réaligné sur le contrat d'idempotence obligatoire, puis la suite complète
  a été relancée.
- Frontend : lint sans erreur (1 avertissement hooks préexistant), 287/287 tests,
  build Vite production réussi.
- Mobile : `flutter pub get` réussi ; `flutter test` 98/98 réussi.
- Mobile : `flutter build apk --debug` réussi. APK de 204 560 597 octets,
  SHA-256 `A6C8D79C2A20D053EBEB4BE14F30556CCF4422511BB26BB54A1374CBD577C78D`.
- `flutter analyze` retourne 203 diagnostics historiques (warnings/info), donc
  n'est pas vert. Aucune mise à niveau Flutter ni nettoyage large n'a été entrepris.
- Alembic : une seule tête, `gu1q2r3s4t5u` (v043).
- Docker : images application/migration construites ; PostgreSQL sain, migration
  bootstrap réussie jusqu'à v043, application saine sur `http://127.0.0.1:8080/health`
  avec réponse `{"status":"healthy","version":"1.0.1"}`.
- L'archive ANFA originale n'est pas suivie par Git. Le contrat de reprojection
  est testé synthétiquement ; le nombre réel de 2 415 géométries ne doit être
  déclaré validé qu'après essai de l'archive originale hors Git.

## État des contrôles longs

Tous les contrôles automatisés demandés ont terminé. Seul `flutter analyze`
n'est pas vert à cause des 203 diagnostics historiques consignés ci-dessus.
La validation physique tablette/4G/offline/resynchronisation reste humaine et
obligatoire : aucun test local ne la remplace.

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

1. Fixer l'URL HTTPS/VPN du serveur puis reconstruire l'APK avec cette URL.
2. Tester physiquement sur tablette : Wi-Fi coupé, 4G, compte technicien, capture
   GPS réelle, photo/mesure/signature, passage offline, outbox puis resynchronisation.
3. Tester les rôles ADMIN, ORIENTEUR, CHEF_ORIENTEUR et TECHNICIAN dans l'UI servie.
4. Essayer l'archive ANFA originale hors Git et vérifier exactement 2 415 géométries.
5. Ne fusionner la candidate dans une branche stable qu'après ces preuves terrain.

## Reprise finale — corrections demandées le 14/09/2026

### État distant vérifié avant correction

- `delivery/govector-final-20260914` : `895f44223b0d86466e52403258f10fec7b15bbae`.
- `release/govector-v1-final-20260914` : `3ca14220045e58fec3ad3ba9deeb3d35632cb977`.
- tag annoté `govector-v1-final-20260914-rc1` : objet `aa32a10fa2ff5aa7791f6c720fe60c450159f02d`, pointant sur le commit `319b0408001ecb8b06dd1d3e1c889ca3f9decc4e`.
- checkpoint créé sans réécriture : `checkpoint/govector-final-before-corrections-20260914` à `895f44223b0d86466e52403258f10fec7b15bbae`.
- branche de correction dédiée : `fix/govector-final-corrections-20260914`, créée au même commit.

La session GitHub utilisée pour cette reprise ne donne pas accès au disque Windows
`C:\Users\Guest\Desktop\optmontana\bluevector-clean-upload`. L'état local
(modifications/non suivis, remotes locaux), les conteneurs Docker réellement actifs
et la base PostgreSQL locale doivent donc être revérifiés sur la machine avant de
les déclarer validés. Aucune commande destructive n'a été lancée et aucune branche
`main`, `delivery` ou `release` n'a été déplacée.

### Bloc stable 1 — diagnostics d'import

Commit : `06dc9dc4d7012e95bef1d54384aeb40eba1525ef` — `fix(import): separate blocking errors from advisories`.

- séparation explicite des erreurs bloquantes et des avertissements ;
- message bloquant du type en français : « Type d’intervention obligatoire. Choisissez un type du référentiel pour ce lot ou corrigez le mapping. » ;
- GPS/coordonnées, NRO, PBO, ville et technicien source sont des avertissements non bloquants ;
- codes techniques conservés dans `_warnings` pour diagnostic/rétrocompatibilité, mais messages français exposés dans `_blocking_errors` et `_advisories` ;
- tests ciblés ajoutés dans `backend/tests/test_excel_validator_messages.py`.

Statut de validation de ce bloc : tests ajoutés mais pas encore déclarés réussis.
Le workflow `GoVector quality` ne se déclenche sur push que pour `main` et
`release/**` (ou sur pull request). Une exécution CI ou locale est encore requise
avant de marquer ce bloc vert.
