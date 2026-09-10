# GoVector — état de livraison mobile

## Dernier commit valide

- `57ad9ff pilot(web): align GoVector creation with Praxedo contract`

## Travail terminé

- Passe web finalisée et sauvegardée.
- Wizard web limité à Création, Qualification et Affectation.
- Cinq types et durées confirmés, compétences fermées sans présélection.
- Design clair GoVector et logo officiel appliqués.
- Runtime Docker reconstruit sans suppression de volume.

## Tests effectués

- Frontend : lint PASS.
- Frontend : 275 tests PASS.
- Frontend : build Vite PASS.
- Docker : `docker compose up -d --build` PASS.
- Santé : `GET /health` PASS (`1.0.1`).
- Contrôle visuel connecté `wahid` : étapes 1 à 3 PASS, sans soumission.
- UTF-8/mojibake et `git diff --check` : PASS.

## Travail restant

- Checkpoint A : parcours Technicien.
- Checkpoint B : parcours Agent terrain.
- Checkpoint C : responsive téléphone/tablette portrait.
- Checkpoint D : tests Flutter, APK debug, contrôles des rôles et checksum.

## Blockers

- Aucun blocker confirmé à ce checkpoint.
- Les captures temporaires non versionnées sous `tmp/praxedo-audit-20260910/` restent volontairement hors commits.

## Prochaine action exacte

- Inspecter uniquement les écrans, services et tests Flutter déjà liés aux parcours Technicien, Agent terrain, formulaires dynamiques, média et outbox.
