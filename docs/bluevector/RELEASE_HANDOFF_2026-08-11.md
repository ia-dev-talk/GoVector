# Remise BlueVector VNext — 11 août 2026

## Contenu fonctionnel

Cette livraison prolonge la dernière baseline de collaboration média par les
lots suivants :

- import adaptatif corrigible puis profils de mapping réutilisables ;
- passages terrain et affectations historiques ;
- identité `Site`, provenance GPS et résolution des conflits ;
- observations structurées PTO/PBO/PM/équipements ;
- fusion manuelle de sites avec préflight et trace immutable ;
- catalogues métier gouvernés consommés par Web et Mobile ;
- administration des comptes et audit des actions privilégiées ;
- portail client en lecture seule avec KPI, filtres et carte cloisonnée ;
- identité BlueVector et garde-fous de configuration de production ;
- sauvegarde PostgreSQL/médias et restauration DB protégée.

Migrations ajoutées : v031 à v035. Tête attendue : `zm3h4c5d6e7f`.

## Application du paquet sur Windows

Avant toute opération, le dépôt doit être propre :

```powershell
cd C:\Users\Guest\Desktop\optmontana\bluevector-clean-upload
git status --short
git log -3 --oneline
```

Créez une branche de sécurité si des modifications locales existent. N'utilisez
jamais `reset --hard` ou `clean` pour forcer l'application.

Le paquet livré contient des patches numérotés. Après extraction :

```powershell
$bvPatchDir = "CHEMIN_DU_DOSSIER_EXTRAIT\patches"
$bvPatches = Get-ChildItem $bvPatchDir -Filter "*.patch" | Sort-Object Name
$bvPatches | Select-Object Name
git am $bvPatches.FullName
```

En cas de conflit, arrêtez-vous et conservez le message complet :

```powershell
git am --abort
```

## Reconstruction et migrations

```powershell
docker compose -p fieldopt down --remove-orphans
docker compose -p fieldopt up -d --build
Start-Sleep -Seconds 10
docker compose -p fieldopt ps
docker compose -p fieldopt exec app python -m alembic current
docker compose -p fieldopt exec app python -m alembic heads
curl.exe http://127.0.0.1:8080/health
```

`current` et `heads` doivent tous deux indiquer `zm3h4c5d6e7f`.

## Vérifications automatiques

```powershell
python -m pip install -r requirements-dev.txt
python -m pytest -q backend/tests

cd frontend
npm ci
npm run lint
npm test
npm run build

cd ..\mobile_app
flutter pub get
flutter analyze --no-fatal-infos --no-fatal-warnings
flutter test
flutter build apk --release `
  --dart-define=API_BASE_URL=http://192.168.1.225:8080/api/v1
```

## Recette terrain prioritaire

1. Paramètres : créer/modifier un client, un compte, une équipe et le grade
   d'un technicien; vérifier le journal administratif.
2. Import : analyser un fichier inconnu, corriger en-tête/colonnes, enregistrer
   un profil puis réanalyser un second fichier de même source.
3. Intervention : adresse seule, point planifié confirmé, affectation puis
   workflow complet depuis le Mobile.
4. GPS : vérifier que planned, live et position terrain confirmée restent
   distincts; résoudre un conflit depuis le bureau.
5. Réseau : saisir PTO/PBO/PM ou scanner un équipement; accepter/rejeter
   l'observation côté bureau sans écraser la valeur préparée.
6. Collaboration : ajouter commentaire/photo après échec ou clôture et vérifier
   la transmission Web/Mobile.
7. Client : ouvrir un compte client; vérifier KPI, filtres, carte et absence de
   toute donnée d'une autre entreprise.
8. Site : lancer un préflight de fusion; vérifier qu'un conflit bloque et qu'une
   fusion confirmée conserve source, snapshot et audit.

## Limites avant bêta publique

- APK encore signé avec la clé pilote/debug ;
- médias encore sur volume filesystem, pas object storage ;
- scripts de restauration à exécuter sur une copie isolée et à consigner ;
- revue juridique GPS/rétention à finaliser ;
- pas encore de Praxedo/QField de production ;
- pas de MFA/SSO ni révocation centralisée de sessions ;
- avertissement de taille du chunk AG Grid encore présent.

Ces limites ne doivent pas être masquées dans une démonstration client.
