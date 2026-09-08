# BlueVector — Livraison Praxedo / QGIS / QField — 14 septembre 2026

## Objectif non négociable

Pour la recette du 14 septembre, BlueVector doit démontrer un circuit traçable et rejouable pour :

1. stock technicien courant ;
2. dotation/transfert vers le technicien ;
3. matériel consommé par intervention ;
4. historique complet des mouvements avec technicien, intervention, visite et date ;
5. remontée/descente des données nécessaires vers Praxedo ;
6. échange terrain SIG avec QGIS/QField ;
7. calcul automatique de longueur de câble sans double saisie.

La livraison ne doit pas prétendre qu'une intégration externe est validée tant qu'elle n'a pas été exercée sur un environnement Praxedo/QField réel.

## Source de vérité et frontières

- **BlueVector PostgreSQL** reste le référentiel opérationnel canonique pour cette livraison.
- Praxedo et QField sont des systèmes externes servis par des adaptateurs isolés ; leurs identifiants sont conservés comme identifiants externes, jamais substitués aux clés BlueVector.
- Toute écriture externe doit être idempotente et journalisée : `source`, identifiant externe, hash du payload, tentative, résultat, date et erreur.
- Toute réception externe doit être rejouable sans créer deux consommations, deux mouvements de stock ou deux actions terrain.
- Les données métier internes ne doivent pas dépendre du nom d'un endpoint Praxedo ou d'une structure QField spécifique.

## État déjà disponible dans BlueVector

### Stock technicien

La verticale existante comporte déjà :

- un dépôt déterministe par technicien (`TECH-{id}`) ;
- la quantité détenue / réservée / disponible ;
- la consommation atomique sur intervention ;
- les lignes de consommation avec série/MAC ;
- les mouvements de stock avec article, dépôt, intervention, visite, technicien et auteur ;
- une synchro mobile idempotente par `event_id` ;
- un contrôle renforcé de custody pour les équipements sérialisés.

### SIG

La verticale existante sait :

- analyser KML/KMZ ;
- versionner et publier des jeux de données SIG ;
- conserver géométries, attributs, provenance et révisions ;
- exporter une couche publiée en GeoJSON.

Le GeoJSON est un format d'échange ; il ne constitue pas à lui seul une synchronisation QField.

## Calcul câble

Deux sources sont acceptables, dans cet ordre :

1. **Repères métriques physiques / compteur de touret** saisis sur `cable_entry` et `cable_exit` :
   `longueur = abs(repère_sortie - repère_entrée)` ;
2. **Géométrie réelle LineString/MultiLineString QGIS/QField** représentant le cheminement : calcul de la longueur du tracé.

Une simple distance à vol d'oiseau entre deux coordonnées GPS ne doit jamais être utilisée comme longueur de câble finale.

Le premier mode est implémenté sur la branche de livraison. Les événements GPS-only existants restent rétrocompatibles.

## Architecture QGIS / QField retenue

Pour la recette multi-technicien, cible recommandée :

`BlueVector PostgreSQL/PostGIS <-> QFieldCloud/QFieldSync <-> QField`

Les couches terrain éditables sont configurées en **Offline editing**. QFieldCloud produit un paquet GeoPackage pour le mobile et applique ensuite les Changes/Deltas à la source PostgreSQL/PostGIS lors de la synchronisation.

Secrets PostgreSQL : utiliser un `pg_service` stocké dans les Secrets QFieldCloud avec un rôle DB limité au strict nécessaire. Ne pas mettre le mot de passe PostgreSQL dans le projet QGIS partagé.

Documentation de référence :

- https://docs.qfield.org/reference/qfieldcloud/system/
- https://docs.qfield.org/reference/qfieldcloud/secrets/
- https://docs.qfield.org/how-to/project-setup/pg-service/

## Architecture Praxedo retenue

Praxedo documente des interfaces SOAP et REST et une synchronisation bidirectionnelle. La documentation technique complète est liée à l'espace client Praxedo ; le connecteur BlueVector ne doit donc pas inventer les URLs, opérations, statuts ou noms de champs du tenant.

Références publiques :

- https://www.praxedo.fr/vos-besoins/adoptez-une-solution-eprouvee/
- https://www.praxedo.fr/nos-connecteurs-erp-crm-api/
- https://www.praxedo.fr/connexion/

### Flux minimum de recette

**Praxedo -> BlueVector**

- techniciens / ressources utiles ;
- interventions ciblées + identifiant externe ;
- articles/catalogue nécessaires ;
- stock/dotation si Praxedo est configuré comme émetteur de ce référentiel ;
- compte-rendu / statuts / consommations lorsque saisis dans Praxedo.

**BlueVector -> Praxedo**

- mise à jour d'intervention autorisée ;
- données de compte-rendu convenues ;
- consommations / mouvements convenus ;
- longueur câble calculée dans le champ Praxedo réellement mappé ;
- références SIG seulement si le contrat Praxedo du tenant prévoit les champs correspondants.

### Informations Praxedo obligatoires à obtenir

Avant de brancher le transport réel, récupérer depuis l'espace client / Customer Care :

1. URL/région/tenant de test ;
2. accès à la documentation API du tenant ;
3. authentification autorisée (OAuth 2 ou HTTP Basic) et identifiants de test ;
4. REST OpenAPI si disponible et/ou WSDL exacts si SOAP ;
5. opérations autorisées pour ressources, interventions, articles, stocks, consommations, comptes-rendus, formulaires et pièces jointes ;
6. identifiants/champs personnalisés réellement utilisés par le client ;
7. dictionnaire des statuts et règles de transition ;
8. quotas, pagination, limites de taille, timeout et politique de retry ;
9. mécanisme de delta/événement disponible ou stratégie de polling ;
10. jeu de données sandbox anonymisé permettant un aller-retour sans toucher la production.

## Matrice canonique minimale

| BlueVector | Praxedo | QField/QGIS | Sens |
| --- | --- | --- | --- |
| technician.id + external ref | ressource/technicien réel du tenant | technician_id | bidirectionnel selon autorité |
| job.id + external ref | intervention | job_id | bidirectionnel |
| stock_item.reference | article | item_reference | bidirectionnel |
| dépôt `TECH-{id}` | stock véhicule/technicien si exposé | lecture formulaire | vers terrain + retour métier |
| StockMovement | mouvement/consommation selon API réelle | non édité directement | BlueVector -> Praxedo |
| StockConsumption | articles consommés | formulaire terrain | retour vers BlueVector/Praxedo |
| cable_entry / cable_exit | champs CR mappés | points/attributs | terrain -> systèmes |
| job.cable_length_m | champ CR Praxedo mappé | longueur calculée / tracé | BlueVector -> Praxedo |
| GeoFeature revision | n/a sauf mapping explicite | feature + geometry | QField <-> BlueVector |

## Gates de recette avant le 14

### G1 — Stock

- dotation d'un article à un technicien ;
- lecture de son stock courant ;
- consommation sur intervention ;
- quantité décrémentée exactement une fois ;
- historique visible et exportable ;
- replay du même événement sans deuxième consommation.

### G2 — Câble

- entrée et sortie avec repères métriques ;
- calcul automatique ;
- projection dans `job.cable_length_m` ;
- ordre de sync inversé supporté ;
- deux câbles référencés sur la même intervention non mélangés ;
- GPS-only toujours accepté sans faux calcul.

### G3 — QField

- projet QGIS réel ;
- couche PostgreSQL/PostGIS packagée en Offline editing ;
- téléchargement sur un Android ;
- modification hors-ligne ;
- push ;
- delta appliqué au serveur ;
- conflit/feature supprimée testé et rendu visible à l'opérateur.

### G4 — Praxedo

- authentification sandbox ;
- lecture d'une intervention et de ses identifiants ;
- lecture/écriture d'un champ de test ;
- transfert d'au moins une consommation de test ;
- replay sans doublon ;
- erreur externe journalisée puis rejouable ;
- aucune écriture sur production pendant la recette technique.

### G5 — Release

- backend/PostgreSQL/frontend/mobile verts sur un même SHA ;
- smoke E2E pile connectée ;
- téléphone Android réel ;
- secrets absents du dépôt Git ;
- rollback documenté.

## Ordre d'exécution 8 -> 14 septembre

1. **8 septembre** : branche de livraison, intégrité stock, calcul câble et contrats.
2. **9 septembre** : vues/couches d'échange SIG + projet QGIS/QField de recette.
3. **10 septembre** : adaptateur Praxedo à partir du contrat réel du tenant ; auth + lecture.
4. **11 septembre** : écritures contrôlées, stocks/consommations, inbox/outbox et retries.
5. **12 septembre** : E2E Praxedo + QField + BlueVector, conflits et offline.
6. **13 septembre** : gel fonctionnel, recette Android, corrections bloquantes uniquement.
7. **14 septembre** : démo/livraison sur SHA marqué et rollback disponible.
