# Roadmap de convergence

## B0 — stabilisation et référentiel

- Tests/backend reproductibles et audit runtime.
- Routes opérationnelles authentifiées; contrats stock/acteur sécurisés.
- Aucune référence OCR fabriquée.
- Référentiel métier, rôles, GPS et scénarios d’acceptation versionnés.

## B1 — qualité livrable pilote

- ESLint ramené à zéro sans désactiver les règles.
- CI backend, frontend et Flutter ajoutée avec analyze/tests/build APK.
- Contrat GPS complet backend ajouté et rétention quotidienne configurable.
- [x] Remplacer les identifiants `com.example` par `dev.bigdataai.bluevector` et harmoniser l’identité affichée.
- Choisir une stratégie de version et configurer une signature release dédiée; la clé debug reste uniquement destinée au pilote local/CI.
- Exécuter le scénario GPS sur PostgreSQL/Docker puis sur un téléphone réel.
- Faire valider la finalité, l'information technicien et la durée GPS avant production.
- Remplacer le stockage média filesystem par un object storage de production.

## B2 — modèle multi-passage

- Consolider `JobVisit` sans renommer brutalement `Job` et étendre les tests de reprise.
- Exploiter les affectations append-only dans les indicateurs et exports.
- Relier aussi les consommations de stock au passage.
- Auditer le backfill prudent avec son niveau de confiance.

## B3 — site et provenance

- [x] Introduire un identifiant `Site` stable sans fusion approximative d’adresses.
- [x] Conserver planned/observed/resolved pour le GPS avec auteur, source, date et révision.
- [x] Rendre les conflits GPS explicites et résolubles par le bureau.
- [x] Donner la priorité à `site_id` dans l’historique et l’héritage des repères.
- [x] Étendre le même contrat de résolution aux conflits PTO/PBO/PM/équipement.
- [x] Fournir une action bureau contrôlée pour lier/fusionner deux sites après vérification humaine, avec préflight des conflits, révisions optimistes et trace immutable.

## B4 — intégrations

- Obtenir la documentation/les accès sandbox Praxedo, écrire mapping et tests contractuels.
- Définir le format de delta QField et sa stratégie de conflit.
- Ajouter inbox/outbox d’intégration idempotentes et observabilité.

## B3.1 — paramétrage gouverné et expérience opérateur

- [x] Publier des catalogues backend versionnés pour activités, grades, priorités, statuts et actions terrain.
- [x] Raccorder les grades d’équipe, les présentations du workflow, le wizard Web et les actions Mobile à ce catalogue.
- [x] Administrer les comptes opérationnels avec liens de profil, activation et réinitialisation protégée.
- Permettre la préparation puis l’activation d’une configuration après validation.
- [x] Conserver les identifiants techniques historiques même lorsqu’un libellé est archivé.
- Fournir une recherche transversale et des vues de travail par exception.
- Unifier les états chargement/vide/erreur/succès du Web et du Mobile.

## Hors promesse actuelle

Ne pas annoncer comme livré : orchestration Praxedo, synchronisation QField, géométrie GIS versionnée, historique multi-visites complet, résolution automatique d’adresse/secteur sans confiance, ou assistant omniscient.
