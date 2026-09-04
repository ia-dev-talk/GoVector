# Agent Orienteur et personnalisation — 4 septembre 2026

## Fonctionnement livré dans le code local

La fiche intervention expose une analyse à la demande pour ADMIN, CHEF_ORIENTEUR
et ORIENTEUR. Le serveur vérifie le rôle et la responsabilité sur chaque dossier.
Les clients, techniciens et orienteurs sans rattachement ou hors périmètre sont
refusés. Les dossiers supprimés ne sont pas analysables.

`GET /api/v1/orienteur-agent/jobs/{job_id}/assessment` retourne le cycle de vie
canonique, les commandes autorisées pour l'utilisateur, le passage et l'affectation
courants, le nombre exact de mouvements matériel et ceux sans passage identifié,
les anomalies avec leur source, les limites et une prochaine revue à effectuer.
Les exigences de clôture proviennent du même `CompletionPolicy` que le workflow.
Les réponses indiquent la date de consultation, la révision du dossier et celle
des paramètres. Elles ne constituent pas un verrou ni une autorisation d'exécution.

Mode : `SIMULATION_ONLY`. Aucune écriture, aucun modèle externe, aucun classement
de techniciens à partir de charges fictives. Les candidats ne sont pas évalués.
Les diagnostics ne sont pas des décisions persistées ou approuvées.

## Personnalisation persistante

Dans Paramètres → Exploitation : tolérance après un rendez-vous (0 à 1440 minutes,
30 par défaut) et signalement des dossiers sans secteur. Ces paramètres sont
stockés dans `operational.orienteur_observation` avec le mécanisme existant de
révision optimiste et d'audit. Ils ne permettent pas d'activer l'exécution.

La nouvelle rubrique Paramètres → Clôture terrain rend accessible l'éditeur
préexistant : signature, câble, mesure optique, GPS, consommation, photos et
champs FTTH ; règles par défaut, par type et par opérateur. La priorité existante
reste opérateur → type → défaut, chaque exception étant complète.

Correction de la réduction silencieuse des exigences photo à deux : une politique
à cinq photos reste à cinq après lecture/édition. Les autres paramètres sont
préservés à la sauvegarde. Un échec de chargement bloque l'édition et la sauvegarde.
L'administrateur seul peut éditer ; les autres rôles consultent. Une révision
obsolète est refusée. La navigation conserve la garde de brouillon existante.

Aucune migration requise : le document JSON existant porte les nouveaux réglages.
Les consommateurs Flutter restent inchangés ; ils utilisent déjà la politique
de clôture backend. Aucun test physique Android effectué dans ce lot.

## Preuves et limites

- 52 tests backend ciblés réussis, dont les contrats PostgreSQL du terrain/stock.
- Test PostgreSQL de la nouvelle analyse également rejoué après raccordement de
  CompletionPolicy : persistance après reconnexion, priorité opérateur, conflit
  de révision et transaction `READ ONLY` réussis.
- 262 tests frontend réussis ; lint et build production réussis.
- Quatre scénarios Playwright : analyse à la demande et changement de dossier,
  accès à la rubrique clôture et préservation des règles, échec de chargement,
  sauvegarde des paramètres et refus d'une tolérance invalide.
- Largeurs 1440 et 390 px contrôlées dans un harnais isolé avec les vrais
  composants/CSS et des réponses API synthétiques. Ce n'est pas une QA complète
  de l'application connectée à la base habituelle.
- Avertissements existants : dépréciations Pydantic/httpx/passlib, chargement
  relationnel SQLAlchemy pendant le scénario de données, chunk AG Grid volumineux.
- Données habituelles, migrations, branche et changements préexistants conservés.
  Aucun push, déploiement ou changement de configuration de la base habituelle.

## Fichiers du lot

Backend :
- `backend/api/main.py` : enregistrement du routeur.
- `backend/api/routes/orienteur_agent.py` : endpoint authentifié.
- `backend/api/schemas/settings.py` : validation des réglages d'observation.
- `backend/logic/job_visits.py` : option de lecture sans relations inutiles.
- `backend/services/orienteur_assessment.py` : diagnostic canonique et exigences.
- `backend/tests/test_orienteur_assessment.py` : états, périmètres et validation.
- `backend/tests/test_orienteur_postgres_contract.py` : preuve persistante et lecture seule.

Frontend :
- `frontend/src/features/intervention-detail/InterventionDetailPage.jsx` : intégration.
- `frontend/src/features/intervention-detail/OrienteurAssessment.jsx` : analyse à la demande.
- `frontend/src/features/intervention-detail/orienteur-assessment.css` : présentation.
- `frontend/src/features/interventions/interventionPermissions.js` : visibilité par rôle.
- `frontend/src/features/interventions/interventionPermissions.test.js` : régression des rôles.
- `frontend/src/components/settings/OperationalSettingsSection.jsx` : règles d'observation.
- `frontend/src/components/settings/CompletionPolicySettingsSection.jsx` : édition sûre et photos.
- `frontend/src/components/settings/completion-policy-settings.css` : présentation responsive.
- `frontend/src/pages/ParametresPage.jsx` : rubrique de clôture.
- `frontend/src/features/settings-v3/settingsCatalog.js` : navigation et recherche.
- `frontend/e2e/orienteur-harness.html` : harnais de composants hors build production.
- `frontend/e2e/orienteur.spec.js` : parcours navigateur ciblés.

Documentation : ce checkpoint.

## Prochaines verticales

1. Historique matériel croisé complet (intervention, technicien, article, dépôt).
2. Proposition d'affectation basée sur disponibilité, compétences, secteurs et
   stocks réellement mesurés ; exclusions et alternatives explicables.
3. Commandes proposées persistées avec préconditions, approbation, expiration,
   idempotence et revalidation au moment de l'exécution par WorkflowEngine.
4. QA de la pile complète isolée puis APK neuf testé sur téléphone physique.
5. GIS/KML/KMZ puis adaptateurs QGIS/Praxedo selon les contrats externes vérifiés.

Le site vitrine Chehbi Management est prévu après BlueVector, dans un lot distinct.
