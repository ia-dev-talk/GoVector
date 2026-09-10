# GoVector — état de livraison mobile

## Dernier commit valide

- `e46ad11 pilot(mobile): align technician experience with GoVector`

## Travail terminé

- Passe web finalisée et sauvegardée.
- Wizard web limité à Création, Qualification et Affectation.
- Cinq types et durées confirmés, compétences fermées sans présélection.
- Design clair GoVector et logo officiel appliqués.
- Runtime Docker reconstruit sans suppression de volume.
- Checkpoint A Technicien : thème clair, logo officiel, planning/détail/actions nettoyés.
- Tous les champs photo dynamiques passent par `FreePhotoActionScreen` ; la galerie n’affirme aucune position.

## Tests effectués

- Frontend : lint PASS.
- Frontend : 275 tests PASS.
- Frontend : build Vite PASS.
- Docker : `docker compose up -d --build` PASS.
- Santé : `GET /health` PASS (`1.0.1`).
- Contrôle visuel connecté `wahid` : étapes 1 à 3 PASS, sans soumission.
- UTF-8/mojibake et `git diff --check` : PASS.
- Mobile ciblé Technicien/formulaires/photos/responsive : 23 tests PASS, puis 21 tests PASS après ajout des contrats de source.

## Travail restant

- Checkpoint B : parcours Agent terrain.
- Checkpoint C : responsive téléphone/tablette portrait.
- Checkpoint D : tests Flutter, APK debug, contrôles des rôles et checksum.

## Blockers

- Aucun blocker confirmé à ce checkpoint.
- Les captures temporaires non versionnées sous `tmp/praxedo-audit-20260910/` restent volontairement hors commits.

## Prochaine action exacte

- Vérifier et ajuster uniquement `FieldAgentShell` et son service : périmètre équipe, consultation du dossier, retour avec motif et validation.
