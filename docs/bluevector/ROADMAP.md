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
- Choisir un `applicationId` BlueVector, une stratégie de version et une signature release; la configuration `com.example`/debug est seulement pilote local.
- Exécuter le scénario GPS sur PostgreSQL/Docker puis sur un téléphone réel.
- Faire valider la finalité, l'information technicien et la durée GPS avant production.
- Remplacer le stockage média filesystem par un object storage de production.

## B2 — modèle multi-passage

- Ajouter `JobVisit` sans renommer brutalement `Job`.
- Rendre affectations et appartenances d’équipe historiques.
- Relier logs, actions, médias, échecs, reports, stock et GPS au passage.
- Backfill prudent avec niveau de confiance.

## B3 — site et provenance

- Introduire un identifiant `Site` stable.
- Conserver planned/observed/resolved avec auteur, source, date et révision.
- Résoudre explicitement conflits PTO/PBO/GPS/équipement.
- Ne plus faire dépendre l’historique du site de valeurs modifiables du job.

## B4 — intégrations

- Obtenir la documentation/les accès sandbox Praxedo, écrire mapping et tests contractuels.
- Définir le format de delta QField et sa stratégie de conflit.
- Ajouter inbox/outbox d’intégration idempotentes et observabilité.

## Hors promesse actuelle

Ne pas annoncer comme livré : orchestration Praxedo, synchronisation QField, géométrie GIS versionnée, historique multi-visites complet, résolution automatique d’adresse/secteur sans confiance, ou assistant omniscient.
