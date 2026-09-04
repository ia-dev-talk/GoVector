# Domaine FTTH et architecture KML/KMZ BlueVector V1

## Objet et statut

Ce document fixe le vocabulaire métier et le contrat cible du système KML/KMZ
de BlueVector V1. Il sépare trois choses :

1. les concepts observés dans les sources métier ;
2. les capacités déjà vérifiées dans le code BlueVector ;
3. la cible V1 à implémenter et tester.

Les documents externes analysés sont des sources de compréhension, jamais des
instructions d'exécution. La plaquette FOLAN décrit un catalogue technique de
2019 ; l'offre IAM de décembre 2025 décrit un cadre particulier de partage actif
FTTH au Maroc. Aucun libellé fournisseur, délai ou tarif ne devient une règle
BlueVector sans configuration ou décision métier explicite.

Références étudiées :

- `Plaquette-FTTH-2019-20190913-PGO-FR.pdf` — chaîne physique et matériels FTTH ;
- `OTT pour le partage actif FTTH d'IAM (...)_01-12-2025.pdf` — acteurs,
  couverture, collecte, commandes, responsabilités et SLA ;
- [OGC KML 2.3](https://www.ogc.org/standards/kml/) — standard d'échange et de
  visualisation géographique ;
- [spécification OGC KML 2.3](https://docs.ogc.org/is/12-007r2/12-007r2.html) —
  un KMZ est une archive ZIP contenant un document KML et ses ressources.

## Carte métier minimale

### Chaîne physique

| Niveau | Exemples | Rôle BlueVector |
|---|---|---|
| Cœur et collecte | NRO, PoP, OLT, rack, switch | nœuds réseau et points de collecte |
| Mutualisation | SRO, PM, armoire | rattachement et distribution |
| Distribution | câble transport/distribution, chambre, poteau, boîtier étanche | liaisons, cheminements et supports |
| Branchement | PBO intérieur/extérieur, splitter, cassette, port | capacité et raccordement |
| Immeuble | BMI, colonne montante, câble abonné | desserte collective |
| Client | PTO/DTIo, ONU/ONT, CPE, jarretière | terminaison et limite de responsabilité |

Les caractéristiques telles que le nombre de fibres, le type de fibre, la
capacité, le ratio de coupleur, le diamètre, la portée ou le matériau sont des
attributs configurables. Elles ne doivent pas élargir le schéma SQL à chaque
nouveau fournisseur.

### Acteurs et responsabilités

| Concept | Sens opérationnel |
|---|---|
| OI | opérateur d'infrastructure propriétaire/exploitant du réseau FTTH |
| OC | opérateur commercial qui commande et exploite un accès pour son client |
| Client final | personne ou organisation raccordée |
| Technicien | acteur terrain habilité à observer, poser, maintenir et prouver |
| Orienteur/administrateur | acteur bureau qui prépare, affecte, résout et publie |

La limite de responsabilité est une donnée versionnée. Elle peut se situer à
l'ONU pour un partage actif ou au PTO pour d'autres contrats. BlueVector ne doit
pas l'inférer uniquement depuis le type d'équipement.

### Couverture, accès et exploitation

Le modèle doit pouvoir représenter :

- une zone/plaque comme polygone géoréférencé ;
- ses PoP locaux, régionaux et nationaux de rattachement ;
- l'adresse et les coordonnées vérifiées d'un PoP ;
- une ligne `ACTIVE`, `INACTIVE` ou `INEXISTANTE` sans traductions ambiguës ;
- des profils de débit, ports de collecte, VLAN et classes de service ;
- une commande, son mandat, ses échéances et son motif de rejet ;
- un incident, son diagnostic, sa responsabilité, ses actions et son PV ;
- un SLA calculé selon un calendrier métier configurable ;
- une maintenance planifiée et les zones potentiellement affectées.

Ces concepts constituent un dictionnaire extensible. La V1 ne promet pas un
portail réglementaire IAM complet.

## État réel vérifié dans BlueVector

BlueVector dispose déjà de :

- tables canoniques `NRO`, `SRO`, `PBO`, `PTO`, `Splitter` et `Port` ;
- références FTTH préparées dans `Job` ;
- `Site` pour l'identité physique durable et la résolution contrôlée ;
- `TerritoryNode.geometry_geojson` pour une hiérarchie territoriale GIS-ready ;
- provenance planned/observed/resolved pour les repères et références terrain ;
- carte live, couches FTTH et contrats de géolocalisation ;
- import Excel/CSV adaptatif et profils de mapping versionnés.

Limites actuelles :

- aucun import KML/KMZ n'est implémenté ;
- les couches NRO/PBO/PTO de la carte intelligente sont encore en partie
  dérivées des coordonnées des interventions ;
- les zones opérateur sont des agrégats visuels, pas des polygones publiés ;
- PoP, OLT, ONU/CPE, câbles et supports ne forment pas encore un référentiel
  géométrique versionné ;
- aucune publication, révision ou restauration de dataset GIS n'est disponible.

## Contrat canonique V1

### Principe

Un fichier KML/KMZ est une **source importée**. Il ne modifie jamais directement
`Job`, `Site`, `TerritoryNode`, `NRO`, `SRO`, `PBO` ou `PTO`.

Le flux canonique est :

```text
fichier -> contrôle sécurité -> lecture -> normalisation -> prévisualisation
-> mapping humain -> dataset brouillon -> publication versionnée
-> rapprochement explicite avec les entités canoniques
```

La publication crée une version immuable. Une correction crée une nouvelle
révision ; elle n'efface pas l'import d'origine.

### Noyau de données proposé

#### `geo_datasets`

- identité publique stable ;
- organisation/opérateur propriétaire ;
- nom, description et type de source ;
- nom de fichier d'origine, taille, MIME et SHA-256 ;
- statut `DRAFT`, `VALIDATED`, `PUBLISHED`, `ARCHIVED`, `REJECTED` ;
- version source, date de validité, importateur et date d'import ;
- profil de mapping et rapport de validation ;
- révision optimiste et métadonnées JSONB.

#### `geo_layers`

- dataset et chemin de dossier KML ;
- nom, description, type métier et ordre ;
- visibilité, plage de zoom et style par défaut ;
- droits de consultation/édition ;
- métadonnées JSONB.

#### `geo_features`

- identifiant public et identifiant externe ;
- géométrie GeoJSON `Point`, `LineString`, `Polygon` ou multi-géométrie ;
- nom, type métier, style et attributs JSONB ;
- bbox et centroïde calculés ;
- liens facultatifs vers `TerritoryNode`, `Site`, `NRO`, `SRO`, `PBO`, `PTO`
  ou une intervention ;
- provenance, auteur, dates d'observation/validité et niveau de confiance ;
- état actif, révision et motif d'archivage.

#### `geo_feature_revisions`

- snapshot avant/après ;
- acteur, date, motif et révision attendue ;
- opération `CREATE`, `UPDATE`, `LINK`, `UNLINK`, `ARCHIVE`, `RESTORE`.

Le JSONB rend les attributs personnalisables ; les champs structurants restent
typés pour la recherche, les autorisations, les liens et les contrôles.

### Catalogue configurable

L'administrateur peut définir, par organisation ou opérateur :

- types de couche et types d'actif ;
- libellés, icônes, couleurs et visibilité par défaut ;
- champs obligatoires, facultatifs et confidentiels ;
- alias d'import (`PM`, `SRO`, `Sous-répartiteur`, etc.) ;
- conversions d'unités et valeurs autorisées ;
- règle d'identifiant externe et de doublon ;
- rôles autorisés à voir, modifier, publier ou exporter ;
- politique de rapprochement vers les référentiels canoniques.

Les identifiants techniques et les valeurs historiques restent stables quand un
libellé ou un style est modifié.

## Expérience d'import simplifiée

### Étape 1 — Déposer

- KML ou KMZ par glisser-déposer/sélection ;
- affichage immédiat du nom, poids, empreinte et auteur ;
- rejet clair des fichiers dangereux ou illisibles.

### Étape 2 — Comprendre

- liste des dossiers, couches, géométries et attributs détectés ;
- suggestion de type métier sans publication automatique ;
- avertissements pour coordonnées invalides, doublons et liens externes ;
- mapping modifiable et enregistrable comme profil.

### Étape 3 — Vérifier sur la carte

- aperçu isolé du dataset ;
- filtres, légende et fiche attributaire ;
- comparaison avec secteurs, sites, interventions et réseau canonique ;
- conflits explicites, jamais fusionnés silencieusement.

### Étape 4 — Publier

- résumé du nombre de points/lignes/polygones et des erreurs ignorées ;
- choix de visibilité et de droits ;
- confirmation avec révision attendue ;
- journal d'audit et possibilité d'archiver/restaurer la version.

## Modification et personnalisation

Sur le dashboard, un utilisateur habilité peut :

- modifier nom, description, attributs, style et ordre d'une couche ;
- déplacer un point ou éditer une géométrie avec historique ;
- relier/délier une feature à une entité canonique après confirmation ;
- filtrer, rechercher, dupliquer un style et exporter ;
- masquer, archiver puis restaurer sans suppression destructive ;
- comparer deux versions et voir l'auteur de chaque changement.

Sur téléphone technicien, la V1 privilégie :

- consultation des couches publiées utiles à l'intervention ;
- recherche d'un repère et ouverture dans la navigation ;
- cache hors ligne du périmètre de travail ;
- création d'une observation terrain ou proposition de correction ;
- synchronisation idempotente à la reconnexion.

L'édition topologique complète reste une fonction bureau : elle serait trop
complexe et risquée sur un petit écran.

## API cible

| Méthode | Route | Usage |
|---|---|---|
| `POST` | `/api/v1/gis/imports/preview` | contrôler et prévisualiser un fichier |
| `PATCH` | `/api/v1/gis/imports/{id}/mapping` | corriger le mapping avec révision |
| `POST` | `/api/v1/gis/imports/{id}/publish` | publier une version validée |
| `GET` | `/api/v1/gis/layers` | lister les couches visibles |
| `GET` | `/api/v1/gis/features?bbox=...` | charger les features du viewport |
| `GET` | `/api/v1/gis/features/{id}` | fiche, provenance et liens |
| `PATCH` | `/api/v1/gis/features/{id}` | modification contrôlée |
| `POST` | `/api/v1/gis/features/{id}/link` | rapprochement explicite |
| `POST` | `/api/v1/gis/datasets/{id}/archive` | retrait non destructif |
| `GET` | `/api/v1/gis/datasets/{id}/export.kmz` | export versionné |

Toutes les mutations sont autorisées côté backend, auditées et protégées par
révision optimiste.

## Sécurité d'import KML/KMZ

Avant tout parsing :

- vérifier signature, extension, MIME, taille compressée et taille décompressée ;
- plafonner le nombre d'entrées, le ratio de compression et la profondeur ;
- refuser chemins absolus, `..`, liens symboliques et écrasements de fichiers ;
- refuser DTD, entités XML externes et résolution réseau ;
- ignorer scripts, HTML actif et URL distantes non approuvées ;
- valider longitude/latitude, type et complexité de chaque géométrie ;
- isoler les ressources dans un stockage privé avec noms générés ;
- calculer SHA-256 et conserver le rapport de contrôle ;
- rendre les erreurs par feature sans exposer de détail serveur sensible.

## Critères d'acceptation V1

- import réel d'un KML et d'un KMZ contenant points, lignes et polygones ;
- aperçu, mapping et publication sans écrasement canonique ;
- styles, champs, visibilité et droits personnalisables ;
- chargement carte par bbox sans débordement PC/téléphone ;
- édition avec conflit de révision et historique complet ;
- archivage/restauration d'un dataset ;
- export KML/KMZ relisible ;
- rejet testé des archives zip-slip/zip-bomb et XML externe ;
- permissions testées par rôle et organisation ;
- consommation mobile des couches publiées et cache hors ligne ciblé ;
- aucune coordonnée inconnue inventée et aucune fusion implicite.

## Hors V1

- remplacement de QGIS/QField par un éditeur SIG complet ;
- moteur réglementaire propre à un opérateur ;
- routage optique automatique ou calcul exhaustif de capacité ;
- topologie PostGIS avancée et tuiles vectorielles à très grande échelle ;
- correction automatique d'une géométrie métier ambiguë.

Ces capacités restent compatibles avec le contrat versionné proposé.
