# BlueVector — livraison 30 min (10/09/2026)

## Base sûre

Cette branche part de `91ba8d3` (`delivery/field-agent-workflow-20260909`) afin de conserver le travail terrain/FTTH récent sans reprendre le commit WIP qui a corrompu des chaînes UTF-8 via Windows PowerShell.

NE PAS reset la base PostgreSQL, supprimer les volumes Docker, stamper Alembic à l'aveugle, ni réécrire massivement les fichiers via PowerShell `Get-Content`/`Set-Content`.

## Nom produit

Le produit livré est **BlueVector** partout dans les surfaces visibles : web, mobile, login, titres, PDF/exports et messages utilisateur. Les noms internes historiques peuvent rester s'ils ne sont pas visibles et si les renommer ajoute du risque.

## Modèle métier — 3 rôles opérationnels

1. **Technicien** — application mobile uniquement (`TECHNICIAN`).
   - Mes interventions
   - Intervention en cours
   - étapes terrain / navigation
   - GPS / temps / synchronisation
   - photo(s), mesures, commentaire
   - câble et mode de pose
   - matériel / splitter
   - historique
   - soumission pour contrôle

2. **Agent terrain** — application mobile/tablette uniquement. Le rôle DB historique `CHEF_ORIENTEUR` peut servir d'identifiant technique pour le pilote, mais l'UI doit afficher **Agent terrain**.
   - voit uniquement son équipe
   - contrôle dossiers terrain remontés
   - vérifie photos/GPS/mesures/câble/matériel
   - retourne au technicien avec motif OU valide
   - ne doit pas recevoir le dashboard bureau

3. **Orienteur** — dashboard local web uniquement (`ORIENTEUR`).
   - tableau de bord / activité du jour
   - interventions
   - affectation / réaffectation manuelle
   - planning
   - carte
   - agents terrain / techniciens
   - stock
   - rapports

`ADMIN` reste un accès maintenance/complet, pas un quatrième rôle métier présenté au pilote.

## Direction UI à reproduire

Référence visuelle validée : dashboard SaaS **blanc / très clair**, sidebar verticale bleu nuit, cartes blanches, bordures légères, accents bleu primaire, badges statut jaune/bleu/vert, typographie sombre et compacte.

Dashboard orienteur :
- sidebar bleu nuit avec `BlueVector`
- `Tableau de bord`, `Interventions`, `Planning`, `Agents terrain`, `Techniciens`, `Stock`, `Rapports`
- bas de sidebar : profil `Orienteur Bureau`
- zone principale blanche : `Bonjour, Voici votre activité du jour`
- recherche + notification + `+ Nouvelle intervention`
- 4 KPI : interventions aujourd'hui / à assigner / en cours / terminées
- panneau `Interventions du jour` sous forme de tableau lisible
- panneau `Carte des interventions`

Écran création/édition intervention : style blanc simple, étapes compactes, éléments réseau, calculs lisibles. Ne pas imposer un assistant générique qui masque le workflow bureau principal.

Mobile : conserver l'efficacité du workflow terrain existant ; adapter le branding BlueVector et la séparation de rôle. Pas besoin de refaire tout le mobile si cela met la livraison en risque.

## Règles FTTH à préserver

- Modes de pose câble gouvernés : `CONDUITE_PEHD` = Conduite / sous PEHD ; `FACADE` = Façade / immeuble ; `AERIEN` = Aérien ; `AUTRE` = Autre.
- Type de câble issu du catalogue, pas du texte libre autoritaire.
- Relevés entrée/sortie câble et consommation calculée/réconciliée.
- Stock technicien / garde terrain et consommation matériel.
- Matériel utilisé, splitter, PBO/PTO/ONT/routeur si disponible dans le catalogue/workflow.
- Photos terrain : Avant, Après, Câble, Splitter, PBO, PTO, ONT, Routeur, Incident, Autre.
- Photo caméra : GPS + heure si disponibles ; échec GPS ne bloque pas la saisie.
- Galerie : envoi multiple, ne pas inventer de GPS.
- Offline/outbox : actions conservées et resynchronisées.
- Mesures optiques/OTDR disponibles mais non bloquantes pour le pilote actuel.
- Signature, longueur câble, photos, commentaire, matériel et autres données terrain : enregistrables mais non bloquantes pour la clôture pilote, sauf vraie règle métier explicitement configurée.
- Agent terrain peut retourner `EN_ATTENTE_VALIDATION -> IN_PROGRESS` avec motif ; ou valider selon le workflow.
- Rapports/exports PDF/Excel/CSV restent disponibles avec branding BlueVector.

## Priorités 30 minutes

P0 — obligatoire avant démo :
1. Branding visible BlueVector.
2. Pas de corruption UTF-8 / mojibake.
3. Routage 3 rôles exact.
4. Orienteur arrive sur dashboard clair et exploitable avec données existantes.
5. Technicien et Agent terrain arrivent sur leur app/surface mobile, pas sur dashboard.
6. Build frontend + backend sain, `/health` OK.
7. Login de démonstration et au moins une intervention exploitable.

P1 — smoke tests métier :
- affectation orienteur -> technicien
- technicien voit intervention
- photo/GPS ou action simple
- câble/matériel présent
- soumission
- contrôle Agent terrain
- stock/rapport ouvrables

P2 — si temps restant : APK 4G via `API_BASE_URL=https://<quick-tunnel>/api/v1` et test réel Wi-Fi coupé.

## Commandes de validation minimales

- `git diff --check`
- rechercher mojibake : `git grep -n -E "Ã|â€|â€™|â€œ|â€|â€¢"`
- rechercher branding visible restant : `git grep -n -E "GoVector|GOVECTOR"`
- frontend tests/build ciblés puis Docker build
- `docker compose ps`
- `curl.exe http://127.0.0.1:8080/health`

Livrer d'abord un parcours fiable et cohérent, pas une refonte exhaustive.