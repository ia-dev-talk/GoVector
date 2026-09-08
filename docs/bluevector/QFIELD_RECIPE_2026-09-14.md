# BlueVector — Recette QGIS / QField — Livraison 14 septembre 2026

## Décision de livraison

Deux parcours sont supportés, avec une priorité claire :

1. **Parcours A — BlueVector GeoJSON revision-safe** : disponible maintenant, contrôlé par l'API BlueVector, utile pour la recette et comme fallback.
2. **Parcours B — QFieldCloud + PostgreSQL/PostGIS en Offline editing** : cible recommandée pour le terrain multi-technicien dès qu'un vrai projet QGIS et une source PostGIS accessible sont disponibles.

Le parcours B est la cible opérationnelle car QFieldCloud fabrique une copie locale `data.gpkg` pour les couches en Offline editing et applique ensuite les Changes/Deltas à la source lors du push. Il faut éviter de changer le schéma des couches pendant que des techniciens ont encore des modifications non poussées. Les identifiants UUID stables sont recommandés pour le travail en équipe.

Références officielles :

- https://docs.qfield.org/reference/qfieldcloud/system/
- https://docs.qfield.org/reference/qfieldcloud/jobs/
- https://docs.qfield.org/reference/qfieldcloud/secrets/
- https://docs.qfield.org/get-started/tutorials/advanced-setup-qfc/
- https://docs.qfield.org/how-to/project-setup/pg-service/

---

## Parcours A — GeoJSON revision-safe BlueVector

### Préconditions

- API BlueVector disponible.
- Compte administrateur BlueVector.
- Un `GeoDataset` publié.
- QGIS ou QField capable d'ouvrir/modifier un GeoJSON sans supprimer les propriétés `_bv_*`.

### 1. Exporter le dataset pour QField

```text
GET /api/v1/gis-datasets/{dataset_id}/qfield-sync
```

Option couche unique :

```text
GET /api/v1/gis-datasets/{dataset_id}/qfield-sync?layer_id={layer_id}
```

Le fichier contient pour chaque feature :

- une identité BlueVector stable ;
- la couche d'origine ;
- la révision BlueVector ;
- le hash de la donnée métier de départ ;
- la géométrie ;
- les attributs éditables.

**Ne jamais supprimer ni renommer les propriétés `_bv_*` dans le fichier de travail.** Elles servent à empêcher un écrasement silencieux d'une donnée plus récente.

### 2. Modifier dans QGIS/QField

Pour la recette, modifier au minimum :

- un attribut métier ;
- une géométrie ;
- un objet sans le modifier pour vérifier le `noop`.

Ne pas changer la structure des colonnes pendant la campagne de recette.

### 3. Prévisualiser les changements

```text
POST /api/v1/gis-datasets/{dataset_id}/qfield-sync/preview
Content-Type: application/json

<FeatureCollection modifiée>
```

Résultat attendu :

- `apply_count` : objets applicables ;
- `noop_count` : objets identiques ;
- `conflict_count` : objets périmés / modifiés côté serveur.

Aucune écriture n'est faite pendant ce preview.

### 4. Appliquer le lot

Seulement si le preview ne contient aucun conflit :

```text
POST /api/v1/gis-datasets/{dataset_id}/qfield-sync/apply
Content-Type: application/json

<FeatureCollection modifiée>
```

Le lot est all-or-nothing : un conflit bloque l'ensemble avant écriture.

Après succès :

- chaque feature modifiée prend `revision + 1` ;
- le dataset prend `revision + 1` ;
- la bbox de la feature est recalculée ;
- la bbox globale du dataset est recalculée ;
- une `GeoFeatureRevision` est enregistrée ;
- la provenance QField est tracée.

### 5. Test de conflit obligatoire

1. Exporter un fichier QField.
2. Modifier la même feature directement dans BlueVector ou via un autre lot valide.
3. Essayer d'appliquer l'ancien fichier.
4. Attendu : HTTP `409`, aucun changement partiel.

### 6. Test de feature supprimée / étrangère

Un objet absent ou provenant d'un autre dataset doit être refusé, sans appliquer les autres objets du lot.

---

## Parcours B — QFieldCloud + PostgreSQL/PostGIS Offline editing

### Préconditions externes

- QGIS Desktop.
- Plugin QFieldSync.
- Compte/projet QFieldCloud.
- Source PostgreSQL/PostGIS accessible depuis QFieldCloud.
- Rôle DB limité au strict nécessaire.
- Un téléphone Android de recette.

### 1. Construire le projet QGIS

Les couches terrain doivent utiliser des identifiants stables, idéalement UUID.

Pour la livraison FTTH, la couche terrain minimale doit permettre de représenter :

- intervention BlueVector ;
- technicien ;
- référence câble ;
- point/observation entrée câble ;
- point/observation sortie câble ;
- tracé réel LineString/MultiLineString lorsqu'il existe ;
- repère métrique entrée ;
- repère métrique sortie ;
- longueur calculée ;
- statut de synchronisation ;
- timestamp source / dernière modification.

### 2. Configurer QFieldSync

Pour les couches modifiables : **Cloud action = Offline editing**.

Ne pas utiliser `Directly access data source` comme mode terrain principal tant que la qualité de connexion mobile n'est pas garantie.

### 3. Configurer la connexion PostgreSQL

Utiliser un service PostgreSQL (`pg_service`).

Dans QFieldCloud :

- créer le secret du projet ;
- renseigner host, port, DB, user, password, SSL ;
- ne pas mettre le mot de passe dans le `.qgz` ou dans Git.

Sur Android, si un accès direct PostgreSQL est nécessaire, le fichier est nommé `pg_service.conf` sans point initial.

### 4. Charger le projet dans QFieldCloud

Vérifier dans cet ordre :

1. `process_projectfile` = SUCCESS ;
2. `package` = SUCCESS ;
3. téléchargement du projet sur Android.

### 5. Recette offline Android

1. Télécharger le projet avec réseau.
2. Couper le réseau.
3. Modifier une feature existante.
4. Ajouter une observation terrain autorisée.
5. Revenir en ligne.
6. Push / Synchronize.
7. Vérifier `delta_apply` = SUCCESS.
8. Vérifier la donnée dans la source serveur et dans BlueVector.

### 6. Cas d'erreur à provoquer

- feature supprimée côté serveur avant le push ;
- colonne renommée après téléchargement ;
- connexion DB indisponible ;
- deux utilisateurs modifiant la même donnée ;
- ancien projet mobile après évolution du schéma.

Tout échec de `delta_apply` doit rester visible dans la recette et ne doit jamais être masqué par un import destructif.

---

## Calcul câble

Ordre d'autorité BlueVector pour le 14 septembre :

1. `abs(repère_sortie - repère_entrée)` lorsque les repères métriques physiques sont présents ;
2. longueur d'un véritable tracé LineString/MultiLineString représentant le cheminement ;
3. **jamais** la distance GPS à vol d'oiseau comme longueur finale du câble.

La consommation automatique de stock câble reste désactivée tant que la correspondance catalogue/article/unité n'est pas validée avec le client.

---

## Gate G3 — résultat attendu le 13 septembre

La recette QField est considérée prête uniquement si :

- [ ] export BlueVector revision-safe validé ;
- [ ] preview/apply validés ;
- [ ] conflit stale validé ;
- [ ] aucune écriture partielle en cas de conflit ;
- [ ] QGIS ouvre les couches attendues ;
- [ ] Android ouvre le projet ;
- [ ] modification offline possible ;
- [ ] push/synchronisation réel effectué ;
- [ ] `delta_apply` ou round-trip BlueVector vérifié ;
- [ ] aucune donnée plus récente écrasée ;
- [ ] calcul câble contrôlé sur un cas réel.
