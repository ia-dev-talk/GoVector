# BlueVector — État d'implémentation livraison 14 septembre 2026

Dernière mise à jour : 8 septembre 2026.

## Implémenté sur `delivery/praxedo-qfield-20260914`

### Stock technicien

- source canonique : dépôt technicien `TECH-{technician_id}` ;
- lecture du stock disponible via `technician_stock_payload` ;
- consommation atomique sur intervention ;
- mouvement de stock et historique avec intervention/visite/technicien ;
- réutilisation de cette même source pour construire le snapshot canonique destiné à Praxedo ;
- références externes Praxedo séparées des IDs BlueVector.

### Câble

- `cable_entry` / `cable_exit` peuvent transporter un repère métrique physique ;
- calcul `abs(sortie - entrée)` ;
- projection dans `Job.cable_length_m` ;
- support du sync hors-ligne dans l'ordre inversé ;
- séparation de plusieurs câbles via référence ;
- aucune longueur finale inventée à partir d'une distance GPS à vol d'oiseau.

### QGIS / QField

- import KML/KMZ conservé ;
- import GeoJSON FeatureCollection ajouté ;
- export GeoJSON conservé ;
- contrat QField `qfield-sync-v1` avec UUID stable, révision BlueVector et hash de base ;
- détection `apply`, `noop`, `conflict_stale_revision`, `conflict_future_revision`, `conflict_source_changed` ;
- synchronisation par lot all-or-nothing ;
- audit `GeoFeatureRevision` lors d'une modification QField ;
- recalcul de l'emprise du dataset après modification géométrique ;
- endpoints admin :
  - `GET /api/v1/gis-datasets/{dataset_id}/qfield-sync` ;
  - `POST /api/v1/gis-datasets/{dataset_id}/qfield-sync/preview` ;
  - `POST /api/v1/gis-datasets/{dataset_id}/qfield-sync/apply`.

### Praxedo

- transport REST configurable sans endpoint Praxedo inventé ;
- HTTP Basic ou OAuth2 client credentials ;
- retries réseau/timeout/408/425/429/5xx ;
- endpoints relatifs configurés via environnement ;
- clé d'idempotence transmise uniquement si le contrat tenant confirme le header ;
- contrats canoniques BlueVector pour :
  - snapshot stock technicien ;
  - mouvement/consommation ;
  - intervention ;
  - compte-rendu ;
  - longueur câble ;
- source DB réelle pour construire stock/intervention/compte-rendu ;
- executor outbound durable :
  - journal avant effet externe ;
  - `pending/sending/acknowledged/retryable/rejected` ;
  - backoff applicatif borné ;
  - replay d'une clé identique sans doublon ;
  - refus d'une même clé avec contenu différent ;
  - réponses distantes non recopiées intégralement dans les métadonnées du journal.

### Journal d'intégration

Tables :

- `integration_external_references` ;
- `integration_exchanges`.

Observabilité admin :

- `GET /api/v1/audit/integrations` ;
- `GET /api/v1/audit/integrations/summary`.

Le payload complet n'est pas retourné par défaut par l'API d'audit.

## Tests ajoutés

- calcul câble ;
- GeoJSON upload ;
- client Praxedo ;
- journal d'intégration ;
- contrats/payloads Praxedo ;
- executor Praxedo ;
- source BlueVector -> canonique Praxedo ;
- contrat QField ;
- service QField round-trip et conflit all-or-nothing.

## Ce qui ne doit pas être présenté comme validé tant que l'environnement réel manque

### Praxedo

Il manque encore le contrat privé du tenant :

1. URL sandbox/tenant ;
2. OpenAPI REST et/ou WSDL SOAP exact ;
3. méthode d'authentification réellement activée ;
4. opérations autorisées ;
5. IDs/noms de champs personnalisés ;
6. dictionnaire des statuts ;
7. mapping articles/techniciens/interventions ;
8. pagination/quotas ;
9. mécanisme polling/delta/webhook ;
10. données sandbox anonymisées.

Tant que ces éléments ne sont pas disponibles, BlueVector ne doit pas transformer ses payloads canoniques en payload Praxedo supposé ni appeler des endpoints trouvés sur des forums.

### QField

Pour valider la chaîne terrain réelle, il reste à exercer :

1. un vrai projet QGIS `.qgz` ;
2. QField/QFieldCloud ou QFieldSync selon l'environnement client ;
3. un téléphone Android réel ;
4. une édition hors-ligne ;
5. un retour serveur ;
6. un cas de conflit volontaire.

## Critère de sortie avant le 14

Le SHA livré doit avoir sur une même révision :

- backend vert ;
- bootstrap PostgreSQL + migrations vert ;
- frontend vert ;
- analyse/tests Flutter verts ;
- build APK réussi ;
- aucun secret dans Git ;
- test stock -> consommation -> historique ;
- test entrée/sortie câble -> longueur ;
- test QField export -> modification -> preview -> apply/conflit ;
- test Praxedo sandbox lecture/écriture/replay dès réception des accès.
