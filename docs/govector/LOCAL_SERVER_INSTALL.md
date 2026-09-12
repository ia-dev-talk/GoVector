# GoVector — installation reproductible sur serveur local

Cette procédure vise une machine Linux x86_64 avec Docker Engine et le plugin
Docker Compose. Aucun service payant n'est nécessaire. PostgreSQL, l'API, le
Web et les médias restent sur le serveur de l'entreprise.

## 1. Préparer le serveur

Prérequis : Docker Engine 24+ et `docker compose` 2.20+. Ouvrir uniquement le
port Web choisi (8080 par défaut) sur le réseau interne. Le port PostgreSQL est
lié à `127.0.0.1` et ne doit pas être publié sur le LAN.

```bash
git clone <URL_DU_DEPOT> govector
cd govector
git checkout delivery/govector-final-20260914
cp .env.server.example .env
openssl rand -hex 32
```

Reporter le secret généré dans `SECRET_KEY`, définir un mot de passe PostgreSQL
fort, remplacer `CHANGE_ME_SERVER_IP`, puis vérifier qu'aucun `CHANGE_ME` ne
reste :

```bash
grep -n CHANGE_ME .env
docker compose config --quiet
```

## 2. Démarrage à froid

```bash
docker compose pull postgres
docker compose build --pull app migrate
docker compose up -d
docker compose ps
curl --fail http://127.0.0.1:8080/health
```

Le service `migrate` crée le schéma actuel sur une base vide ou applique les
migrations jusqu'à la tête sur une base déjà gérée. Il refuse volontairement
une base non vide sans historique Alembic.

Vérifier ensuite depuis un poste du LAN :

```text
http://IP_DU_SERVEUR:8080
```

## 3. Administration initiale

Ne pas activer `IS_DEMO` en entreprise. Utiliser le compte administrateur déjà
fourni par l'entreprise ou le mécanisme de seed explicite documenté par le
projet. Ne jamais conserver un mot de passe par défaut. Vérifier ensuite les
trois profils : administrateur/orienteur, agent terrain et technicien.

Dans **Stocks**, créer chaque bobine avec son unique `CODE`, son type FO16 ou
FO64, son repère courant, puis l'affecter au technicien. Un transfert vers un
autre technicien exige une justification.

## 4. Exploitation quotidienne

```bash
docker compose ps
docker compose logs --tail=200 app migrate postgres
docker compose restart app
docker compose up -d
```

Les conteneurs applicatif et PostgreSQL redémarrent automatiquement. Les logs
sont limités à cinq fichiers de 10 Mo par service. Les données sont conservées
dans `postgres_data` et les médias dans `technician_media`.

## 5. Sauvegarde

```bash
bash deploy/govector-backup.sh /srv/backups/govector
sha256sum -c /srv/backups/govector/govector-AAAAmmjjTHHMMSSZ.sha256
```

Copier les trois fichiers produits vers un stockage interne distinct du
serveur. Tester une restauration sur une machine isolée avant la livraison.

## 6. Restauration contrôlée

La restauration remplace les données courantes : arrêter l'application et
faire une nouvelle sauvegarde avant toute action.

```bash
docker compose stop app
docker compose exec -T postgres pg_restore \
  --clean --if-exists --no-owner \
  -U govector -d govector < /chemin/govector-db-AAAAmmjjTHHMMSSZ.dump
docker compose exec -T app tar -C /app/uploads -xzf - \
  < /chemin/govector-media-AAAAmmjjTHHMMSSZ.tar.gz
docker compose up -d
curl --fail http://127.0.0.1:8080/health
```

Adapter utilisateur/base si `.env` utilise d'autres noms.

## 7. Mise à jour et retour arrière

Avant mise à jour : sauvegarder, noter le commit actif, puis construire la
nouvelle image sans supprimer les volumes.

```bash
git rev-parse HEAD
bash deploy/govector-backup.sh /srv/backups/govector
git fetch --all --prune
git checkout <COMMIT_VALIDE>
docker compose build app migrate
docker compose up -d
curl --fail http://127.0.0.1:8080/health
```

En cas d'échec, revenir au commit noté et reconstruire. Ne jamais exécuter
`docker compose down -v` : `-v` supprimerait les données. Si une migration a
modifié les données de manière incompatible, restaurer le dump et les médias.

## 8. Checklist avant ouverture aux utilisateurs

- `docker compose ps` : `postgres` et `app` sont `healthy`, `migrate` est sorti à 0.
- `/health` répond 200 depuis le serveur et depuis un poste du LAN.
- Connexion Web et mobile avec les comptes de chaque rôle.
- Import du fichier Magillan : prévisualisation, erreurs ligne par ligne et doublon rejoué.
- Intervention importée visible, affectable et récupérée dans `/jobs/my`.
- Bobines 4475 et 9281 testées avec continuité et historique.
- Rapport individuel contrôlé sans photo, avec une photo et avec plusieurs photos.
- APK debug construit avec l'URL LAN réelle et installé manuellement sur le téléphone.
- GPS contrôlé téléphone dehors/près d'une fenêtre, puis Wi-Fi coupé et resynchronisation en 4G/5G.
- Sauvegarde créée, empreinte vérifiée, procédure de retour arrière connue.
