# BlueVector — Longueur câble par tracé QGIS/QField — 14 septembre 2026

## Règle d'autorité

BlueVector conserve cet ordre, sans exception implicite :

1. **repères métriques physiques / compteur de touret** (`cable_entry` + `cable_exit`) ;
2. **tracé réel QGIS/QField** `LineString` / `MultiLineString` explicitement désigné comme route câble ;
3. aucune longueur automatique.

Une distance GPS à vol d'oiseau entre deux points n'est jamais utilisée comme longueur finale de câble.

## Calcul SIG

Les GeoJSON QField utilisent longitude/latitude WGS84. BlueVector calcule donc chaque segment du tracé sur l'ellipsoïde WGS84, puis additionne tous les segments. Un `MultiLineString` additionne toutes ses parties.

Le calcul ne remplace jamais le tracé par la distance directe entre son premier et son dernier point.

Métadonnées serveur conservées dans la provenance de la `GeoFeature` :

- `geometry_length_m` ;
- `geometry_length_method = wgs84_vincenty_segments` ;
- `geometry_length_calculated_at` ;
- état de projection vers l'intervention.

## Désignation explicite

Une ligne SIG ordinaire ne peut pas modifier `job.cable_length_m`. Un administrateur doit d'abord la relier explicitement :

```text
POST /api/v1/gis-datasets/{dataset_id}/features/{feature_id}/cable-route
Content-Type: application/json

{
  "job_id": 42,
  "expected_feature_revision": 3
}
```

Le serveur :

- vérifie que le dataset est publié ;
- verrouille dataset + feature + intervention ;
- vérifie la révision attendue ;
- refuse une feature déjà liée à une autre intervention ;
- refuse un rôle BlueVector incompatible ;
- exige une `LineString` ou `MultiLineString` ;
- calcule la longueur géodésique ;
- inscrit `bluevector_role = cable_route` dans la provenance serveur ;
- incrémente les révisions ;
- journalise la désignation.

## Protection de la source physique

Avant chaque projection de longueur issue du tracé, BlueVector recherche une observation terrain `cable_entry` / `cable_exit` contenant :

```text
calculation = absolute_meter_delta
computed_length_m = ...
```

Si elle existe, le tracé QField peut continuer à être recalculé, mais **ne remplace pas** la longueur canonique de l'intervention.

État attendu :

```text
cable_length_projection_state = skipped_physical_meter_authoritative
```

## Mise à jour du tracé

Après désignation, chaque synchronisation QField qui modifie la géométrie :

1. passe d'abord les contrôles de révision/hash QField ;
2. recalcule la longueur de tous les segments ;
3. met à jour la provenance de la feature ;
4. actualise `job.cable_length_m` seulement si la valeur actuelle provient encore de cette même route ;
5. n'écrase jamais une valeur physique/manuelle/higher-priority apparue entre-temps.

Si une route câble explicitement désignée est transformée en Point/Polygon, la synchronisation est refusée.

## Gate de recette

- [ ] LineString avec détour : longueur > distance directe entrée/sortie ;
- [ ] MultiLineString : toutes les parties sont additionnées ;
- [ ] désignation admin d'une route liée à une intervention ;
- [ ] projection vers `job.cable_length_m` lorsque celui-ci est vide ;
- [ ] modification QField du tracé -> recalcul ;
- [ ] repères physiques présents -> projection SIG bloquée ;
- [ ] valeur existante non issue de la route -> non écrasée ;
- [ ] changement de type LineString vers Point -> refus ;
- [ ] historique `GeoFeatureRevision` et audit présents.
