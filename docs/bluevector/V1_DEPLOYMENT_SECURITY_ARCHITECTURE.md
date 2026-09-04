# Architecture de déploiement et sécurité BlueVector V1

## Décision V1

BlueVector conserve deux modes clairement séparés :

- **local/pilote** : Docker Compose sur un poste ou serveur de démonstration,
  accessible sur le réseau contrôlé ;
- **production** : application conteneurisée derrière HTTPS, PostgreSQL privé et
  stockage objet privé. Le dashboard est accessible par une URL web stable et
  l'application mobile utilise la même origine API.

La production ne doit pas dépendre d'un ordinateur de technicien, d'une base
exposée sur Internet ou d'un volume Docker unique non répliqué.

## État réel du dépôt

| Composant | État vérifié | Limite actuelle |
|---|---|---|
| Application | image unique FastAPI + SPA React | pas encore déployée sur une cible publique validée |
| Base | PostgreSQL 15 dans Docker, volume persistant | pas de PITR ni réplication dans le Compose local |
| Médias | volume `technician_media` | stockage objet non implémenté |
| Migration | service Compose dédié avant démarrage | rollback de release à éprouver sur copie réelle |
| Reverse proxy | exemple Nginx HTTPS | certificat et nom historiques à remplacer par la cible réelle |
| Sauvegarde | scripts DB + médias + SHA-256 | restauration réelle encore à consigner |
| Configuration | garde-fous production, CORS HTTPS, secrets obligatoires | coffre de secrets et rotation à raccorder |
| Mobile | URL API explicite exigée en release | signature de production et téléphone réel à valider |

## Architecture de production recommandée

### V1 pragmatique

```text
Internet
  -> DNS
  -> reverse proxy / TLS / limites de requêtes
  -> BlueVector app (SPA + API)
       -> PostgreSQL privé avec sauvegarde continue
       -> stockage objet privé pour médias et fichiers GIS
       -> logs, métriques et alertes
```

Pour la V1, une instance applicative correctement supervisée suffit si la base
et les objets sont durables. La séparation en microservices n'apporte pas de
bénéfice immédiat et augmenterait le risque d'exploitation.

### Accès web et mobile

- origine recommandée : `https://<origine-bluevector>` ;
- dashboard et API servis sur la même origine ;
- API sous `/api/v1` et fichiers via routes authentifiées ;
- WebSocket sous la même origine HTTPS (`wss`) ;
- APK release compilé avec cette URL explicite ;
- aucun fallback `localhost` en production ;
- aucun accès public direct à PostgreSQL ou au bucket.

Le nom de domaine final, le fournisseur cloud et la région doivent être choisis
avant le déploiement. La résidence des données au Maroc ou hors du Maroc est une
décision juridique et contractuelle, pas une valeur à inventer dans le code.

## Stockage

### PostgreSQL

La base porte les identités, ordres, visites, affectations, droits, métadonnées,
géométries GeoJSON, révisions et journaux. La cible V1 est PostgreSQL managé ou
un cluster privé exploité avec :

- chiffrement au repos et en transit ;
- utilisateur applicatif sans privilège d'administration ;
- sauvegarde quotidienne et archivage continu des WAL ;
- restauration à un instant donné ;
- supervision espace disque, connexions, verrous et requêtes lentes ;
- migrations exécutées une seule fois et sauvegarde avant release.

L'[archivage continu PostgreSQL](https://www.postgresql.org/docs/17/continuous-archiving.html)
permet une restauration à un point choisi en combinant sauvegarde de base et
fichiers WAL. Un simple `pg_dump` reste utile mais ne remplace pas ce mécanisme
pour une production exigeante.

### Médias et GIS

Photos, signatures, annotations, pièces jointes et fichiers KML/KMZ vont dans un
stockage objet compatible S3 :

- bucket privé, chiffrement serveur et versioning ;
- clés générées, jamais basées directement sur le nom fourni ;
- accès par l'API ou URL signée courte après contrôle RBAC ;
- lifecycle distinct pour originaux, dérivés et imports rejetés ;
- métadonnées et SHA-256 conservés en base ;
- inventaire et réconciliation périodiques DB/objets ;
- blocage de suppression et réplication selon le niveau de service retenu.

Les fichiers temporaires de parsing sont isolés et supprimés après validation.

## Sauvegarde, reprise et objectifs

Objectifs V1 proposés :

| Indicateur | Cible initiale |
|---|---|
| RPO base | 15 minutes maximum |
| RTO service | 4 heures maximum |
| Rétention PITR | 14 jours minimum |
| Sauvegardes logiques | quotidiennes 30 jours, mensuelles 12 mois |
| Versioning objets | 30 jours minimum |
| Test de restauration | avant V1 puis mensuel |

Ces cibles doivent figurer dans le contrat d'exploitation. Le test de
restauration s'effectue sur une cible isolée et vérifie : migrations, santé API,
connexion, intervention, historique, média, dataset GIS et idempotence outbox.

## Baseline sécurité

BlueVector utilisera [OWASP ASVS 5.0](https://owasp.org/www-project-application-security-verification-standard/)
pour le Web/API et [OWASP MASVS](https://mas.owasp.org/MASVS/) pour Flutter.
Une preuve de contrôle est exigée ; l'exécution d'un scanner seule ne constitue
pas un audit complet.

### Périmètre serveur et Web

- TLS 1.2/1.3, HSTS après validation de l'origine et en-têtes de sécurité ;
- secrets dans un coffre, rotation et séparation staging/production ;
- CORS limité à l'origine HTTPS explicite ;
- contrôle RBAC backend pour chaque lecture et mutation ;
- isolation stricte par organisation pour clients, exports, médias et GIS ;
- validation de taille/type/contenu des uploads ;
- limites de requêtes sur login, imports, exports et endpoints coûteux ;
- requêtes SQL paramétrées et migrations revues ;
- journal d'audit append-only sans secret ni contenu sensible inutile ;
- erreurs publiques neutres, corrélation interne par identifiant de requête ;
- dépendances et images scannées, SBOM et correctifs critiques suivis ;
- sauvegardes chiffrées avec accès séparé de l'application.

Le token Web est actuellement conservé côté navigateur. L'audit V1 doit mesurer
le risque XSS et décider soit d'une migration vers cookies `HttpOnly`, `Secure`,
`SameSite`, soit de protections compensatoires documentées. Ce point ne doit pas
être présenté comme résolu avant test.

### Périmètre mobile

- aucun secret d'infrastructure dans l'APK ;
- token et données sensibles dans un stockage sécurisé de la plateforme ;
- HTTPS uniquement en release ;
- cache SQLite chiffré ou données minimisées selon leur sensibilité ;
- nettoyage du périmètre utilisateur au logout ;
- outbox propriétaire, idempotente et non partageable entre comptes ;
- permissions Android minimales et demandées au moment utile ;
- masquage des secrets dans logs, captures et rapports d'erreur ;
- signature release dédiée, sauvegardée et contrôlée hors Git ;
- tests MASVS stockage, auth, réseau, plateforme, code et confidentialité.

### Données personnelles et GPS

- finalité, base légale, information technicien et durée validées ;
- séparation position planifiée, GPS live et repère terrain ;
- rétention et purge configurables, auditables et testées ;
- accès au GPS limité aux rôles et organisations autorisés ;
- export/suppression traités selon la politique légale approuvée ;
- aucun suivi hors des périodes et finalités déclarées.

## Observabilité et exploitation

Minimum V1 :

- `/health` pour le processus et `/ready` pour DB/stockage ;
- logs JSON avec environnement, version, request ID et acteur pseudonymisé ;
- métriques latence, erreurs, saturation DB, outbox, uploads et imports GIS ;
- alertes sur 5xx, indisponibilité, sauvegarde manquée, stockage faible et
  synchronisations durablement bloquées ;
- traces d'une intervention du Web au backend sans inclure preuve sensible ;
- tableau d'état et procédure d'escalade.

## Environnements et promotion

| Environnement | Données | Accès | Usage |
|---|---|---|---|
| local | synthétiques | poste/LAN | développement et QA rapide |
| staging | anonymisées/synthétiques réalistes | équipe restreinte | migrations, E2E et APK candidat |
| production | réelles | utilisateurs habilités | exploitation |

Une release est promue par image immuable identifiée par commit. La même image
passe staging puis production, seule la configuration change. La migration est
testée sur copie, la sauvegarde est vérifiée, puis les parcours critiques sont
rejoués.

## Décisions à fournir avant mise en ligne

Les éléments suivants exigent une information externe mais ne bloquent pas la
préparation technique :

- domaine public et accès DNS ;
- fournisseur cloud/on-premise et région ;
- budget et niveau de disponibilité contractuel ;
- responsable légal des données et règles de résidence ;
- comptes de messagerie/notification éventuels ;
- certificats, signature Android et propriétaires du coffre de secrets.

## Gate de déploiement

- [ ] domaine et TLS valides ;
- [ ] variables production sans valeur par défaut ;
- [ ] PostgreSQL privé, chiffré, sauvegardé et restauré sur copie ;
- [ ] stockage objet privé, versionné et restauré ;
- [ ] migration testée sur copie anonymisée ;
- [ ] tests ASVS/MASVS prioritaires exécutés avec preuves ;
- [ ] limites upload et protections KML/KMZ vérifiées ;
- [ ] logs, métriques et alertes opérationnels ;
- [ ] APK signé et testé sur téléphone physique ;
- [ ] rollback applicatif et procédure incident répétés ;
- [ ] responsable d'astreinte et contacts d'escalade définis.
