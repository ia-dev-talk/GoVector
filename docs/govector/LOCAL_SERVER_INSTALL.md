# GoVector — installation reproductible sur serveur local

Cette procédure vise une machine Linux x86_64 avec Docker Engine et le plugin
Docker Compose. Le socle GoVector n'exige aucun service payant. Le coût éventuel
du VPN dépend du compte retenu par l'entreprise. PostgreSQL, l'API, le Web et les
médias restent sur le serveur de l'entreprise.

## 1. Préparer le serveur

Prérequis : Docker Engine 24+ et `docker compose` 2.20+. Ouvrir uniquement le
port Web choisi (8080 par défaut) sur le réseau interne. Le port PostgreSQL est
lié à `127.0.0.1` et ne doit pas être publié sur le LAN.

```bash
git clone <URL_DU_DEPOT> govector
cd govector
git checkout fix/govector-final-corrections-20260914
git pull --ff-only
git status --short
git rev-parse HEAD
cp .env.server.example .env
openssl rand -hex 32
```

Le répertoire doit être propre après le `pull`. Ne pas fusionner `main`,
`release/*` ou `delivery/*` dans cette branche pendant la recette.

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

## 2 bis. Accès privé depuis la 4G/5G

Une adresse LAN comme `192.168.x.x` n'est pas joignable depuis la 4G. Le chemin
recommandé pour la recette est Tailscale Serve : le serveur reste dans le réseau
de l'entreprise, l'accès est limité au tailnet et le Web comme l'API disposent
d'une URL HTTPS. Ne pas lancer `tailscale funnel`, qui rendrait le service public,
ni le profil Docker `pilot-4g`, réservé au tunnel éphémère de démonstration.

Sur le serveur Linux, après avoir obtenu l'accord et le compte Tailscale de
l'entreprise :

- installation Linux : <https://tailscale.com/docs/install/linux> ;
- partage privé HTTPS : <https://tailscale.com/docs/reference/tailscale-cli/serve>.

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up --hostname=govector-server
sudo tailscale serve --bg 8080
tailscale serve status
```

La commande `tailscale up` fournit un lien d'authentification à ouvrir par le
responsable du compte. Activer MagicDNS et les certificats HTTPS si l'interface
Tailscale le demande. `tailscale serve status` affiche ensuite une URL de la
forme :

```text
https://govector-server.NOM-DU-TAILNET.ts.net
```

Reporter aussi cette origine dans `.env`, en conservant l'origine LAN :

```dotenv
CORS_ORIGINS=["http://IP_DU_SERVEUR:8080","https://govector-server.NOM-DU-TAILNET.ts.net"]
```

Puis recharger l'application et valider l'URL privée :

```bash
docker compose up -d app
curl --fail https://govector-server.NOM-DU-TAILNET.ts.net/health
```

Sur la tablette, installer l'application Tailscale officielle, rejoindre le même
tailnet avec le compte autorisé et vérifier dans le navigateur :

```text
https://govector-server.NOM-DU-TAILNET.ts.net
```

Construire ensuite l'APK release avec exactement le même nom HTTPS :

```bash
cd mobile_app
flutter pub get
flutter test
export ORG_GRADLE_PROJECT_pilotSigning=true
flutter build apk --release --no-pub \
  --dart-define=API_BASE_URL=https://govector-server.NOM-DU-TAILNET.ts.net/api/v1
sha256sum build/app/outputs/flutter-apk/app-release.apk
```

L'APK refuse volontairement une URL HTTP ou `localhost` en release. Tailscale
doit donc être connecté avant l'ouverture de GoVector en 4G/5G. La signature
`pilotSigning` convient uniquement à la recette interne ; une diffusion durable
exige le keystore de production conservé hors Git.

## 3. Administration initiale

Ne pas activer `IS_DEMO` en entreprise. S'il n'existe pas encore de compte
administrateur, le créer explicitement sans mot de passe par défaut :

```bash
docker compose exec \
  -e GOVECTOR_ADMIN_USERNAME=admin \
  -e GOVECTOR_ADMIN_EMAIL=admin@entreprise.local \
  -e GOVECTOR_ADMIN_PASSWORD='REMPLACER_PAR_UN_SECRET_DE_14_CARACTERES_MINIMUM' \
  app python -m backend.create_admin
```

Remplacer l'identifiant, l'adresse et le secret avant exécution. Le script
refuse les champs absents, les secrets de moins de 14 caractères et les
doublons. Créer ensuite les comptes nominatifs depuis l'administration et
vérifier les trois profils : administrateur/orienteur, agent terrain et
technicien.

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
- Web ouvert depuis le LAN, puis depuis la tablette en 4G/5G via l'URL HTTPS Tailscale.
- APK release construit avec l'URL HTTPS Tailscale, empreinte SHA-256 relevée et
  installation manuelle neuve sur la tablette.
- GPS contrôlé dehors/près d'une fenêtre, puis Wi-Fi coupé, action offline mise
  en file et resynchronisation vérifiée en 4G/5G.
- Sauvegarde créée, empreinte vérifiée, procédure de retour arrière connue.
