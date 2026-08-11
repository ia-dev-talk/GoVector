# Sauvegarde et reprise BlueVector

## Périmètre

Une sauvegarde BlueVector complète comporte au minimum :

1. un dump PostgreSQL au format custom ;
2. l'archive des médias techniciens ;
3. le manifeste JSON avec commit Git, tailles et SHA-256 ;
4. les secrets et certificats conservés séparément dans un coffre — jamais dans
   l'archive ou dans Git.

Les scripts fournis ciblent le pilote Docker Compose sous Windows. Ils ne
remplacent pas des snapshots chiffrés, répliqués et supervisés en production.

## Créer une sauvegarde

Depuis PowerShell, à la racine du dépôt :

```powershell
.\scripts\backup-bluevector.ps1 -IncludeMedia
```

Les fichiers sont créés dans `backup/`, ignoré par Git. Copiez ensuite le jeu
complet vers deux emplacements chiffrés distincts. Le dump et les médias sont
capturés séquentiellement : pour une sauvegarde de production strictement
cohérente, mettez les écritures en maintenance ou utilisez stockage objet et
snapshots coordonnés.

## Tester une restauration

Ne testez jamais d'abord sur la base active. Préparez une copie isolée du projet
avec un autre nom Compose et d'autres ports, puis utilisez le SHA-256 présent
dans le manifeste :

```powershell
.\scripts\restore-bluevector-database.ps1 `
  -DatabaseDump .\backup\bluevector-database-YYYYMMDD-HHMMSS.dump `
  -ExpectedSha256 COPIER_LE_SHA256_DU_MANIFESTE `
  -ConfirmRestore
```

Le script vérifie l'empreinte, arrête l'API, restaure la base, applique Alembic
puis redémarre l'API. En cas d'échec, l'API reste arrêtée. L'archive média doit
être restaurée séparément sur une copie du volume `technician_media`; cette
étape est volontairement non automatisée tant que le stockage filesystem reste
le backend média.

## Critères de validation mensuelle

- le hash de chaque fichier correspond au manifeste ;
- `alembic current` égale `alembic heads` ;
- `/health` retourne 200 ;
- un compte de test peut lire une intervention, son historique et un média ;
- une action outbox rejouée reste idempotente ;
- la date, la durée et le responsable du test sont consignés hors du système.

Avant la bêta publique, migrer les médias vers un stockage objet avec versioning,
chiffrement, lifecycle, réplication et procédure de réconciliation DB/objets.
