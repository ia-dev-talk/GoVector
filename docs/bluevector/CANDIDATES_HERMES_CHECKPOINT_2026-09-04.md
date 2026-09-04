# Agent Orienteur, QA HTTP et Hermes — 4 septembre 2026

## Résultat

L’Agent Orienteur possède maintenant une comparaison de techniciens à la demande, accessible depuis la fiche intervention. Le serveur vérifie le droit de consulter le dossier et la capacité canonique de réaffectation. Une intervention fermée ou un état non compatible ne retourne pas de candidats.

Les contrôles portent sur le profil actif, les compétences déclarées, la couverture du secteur par l’équipe et les chevauchements d’affectations courantes dont le créneau est exploitable. Les anciennes affectations terminées ne servent pas de disponibilité actuelle. Les créneaux adjacents ne se chevauchent pas.

Les résultats sont `REVIEW` ou `EXCLUDED`, jamais automatiquement affectables. L’affichage distingue vérifié, écart détecté et à confirmer, avec provenance et date de consultation. L’ordre des techniciens est celui de leurs identifiants, pas un classement de performance. Maximum 100 profils, compteur total et troncature explicites. Un changement de dossier efface le résultat ; une réponse tardive ne peut pas contaminer le dossier suivant.

La portée d’un orienteur repose sur son équipe ; une ancienne projection `Technician.orienteur_id` ne permet pas d’exposer un technicien désormais rattaché à une autre équipe. Les profils legacy sans équipe utilisent encore leur rattachement existant.

Endpoint : `GET /api/v1/orienteur-agent/jobs/{job_id}/candidates`. Il retourne `SIMULATION_ONLY`, `execution_enabled=false`, `ready_for_assignment=false`. Aucune commande d’affectation n’est exécutée ou enregistrée par ce lot.

## Limites métier

Horaires de travail, absences, capacité journalière, habilitations client/opérateur, temps de trajet et matériel requis ne sont pas encore établis. Ils restent inconnus, sans score de remplacement. Un créneau local textuel sans fuseau métier gouverné n’est pas converti arbitrairement en instant UTC ; son contrôle de chevauchement reste incomplet. Les compétences et couvertures sont déclaratives, pas des certifications vérifiées.

Le prochain développement de planification doit résoudre cette convention de fuseau avant d’annoncer une disponibilité fiable. Les propositions persistantes, approbations, expiration, idempotence et revalidation au moment d’exécuter restent à construire. Le produit complet, Praxedo, QField et l’APK physique ne sont pas déclarés livrés.

## Validation indépendante

- Un agent a développé le service et ses 15 tests, dont PostgreSQL en transaction `READ ONLY`.
- Un autre agent a ajouté un contrat HTTP/JWT réel pour les candidats : refus anonyme, technicien et orienteur hors périmètre ; utilisateurs persistés ; 105 candidats comptés et 100 retournés ; scope équipe ; compétences ; conflits ; compteurs inchangés. Chaque requête DB est en `READ ONLY`.
- Ce second agent a aussi validé le parcours SIG avec connexion réelle par mot de passe/JWT : création de clients par HTTP, import multipart, idempotence, publication, exports, contrôle des rôles et révocation après désactivation du compte. Seule la connexion DB est dirigée vers une base UUID jetable ; les services et autorisations ne sont pas simulés.
- Rejeu intégré après correction SIG : **57 tests backend réussis**. Périmètre : GIS persistant et HTTP complet, candidats unitaires/PostgreSQL/HTTP, analyse Orienteur existante.
- **6 parcours Playwright réussis** : les quatre précédents Orienteur/paramètres et deux nouveaux sur la comparaison. Les deux nouveaux contrôlent l’affichage, les inconnues, la troncature, le refus d’accès, le changement de dossier et la réponse tardive. Captures bureau 1440 et mobile 390 vérifiées. Les API du navigateur restent synthétiques.
- Lint et build réussis sur le composant intégré. Avertissements existants : bundle AG Grid volumineux, chunk vendor vide et dépréciations backend. Contrôle des différences Git sans erreur.

Ces tests HTTP utilisent ASGI en mémoire et PostgreSQL réel, pas une recette navigateur de la pile déployée. La chaîne de migrations et le téléphone physique n’ont pas été testés dans ce lot. Les données habituelles n’ont pas été modifiées.

## Hermes utilisé réellement

Nouvelle session `20260904_113019_6f90e7`, titre « Revue de code GIS en lecture seule », profil `bluevector-qa`. Exécution interactive normale avec GPT-5.6 Luna, limitée à huit itérations et trois minutes ; aucun mode one-shot ni contournement des approbations.

Hermes a rendu un verdict **LIMITED**, explicitement limité à la revue statique. Il a trouvé un défaut confirmé : l’aperçu persistant reconstruisait le chemin de dossier GIS à partir du nom de couche tronqué. La correction transmet désormais le vrai `GeoLayer.folder_path`. Un test PostgreSQL avec un chemin de plus de 180 caractères vérifie sa conservation.

La session est terminée et conservée. Reprise possible : `hermes --resume 20260904_113019_6f90e7 -p bluevector-qa`. Le modèle par défaut du seul profil QA a été remplacé par `gpt-5.6-luna`, après un appel réussi, en conservant fournisseur et règles d’approbation. Hermes reste en v0.21.0 ; les 778 mises à jour annoncées n’ont pas été appliquées. Pas de nouveau bot ni de tâche récurrente créée.

## Fichiers du lot

| Fichier | Modification |
| --- | --- |
| `backend/services/orienteur_candidates.py` | Nouveau diagnostic lecture seule des candidats. |
| `backend/api/routes/orienteur_agent.py` | Nouvelle route de comparaison. |
| `backend/tests/test_orienteur_candidates.py` | Tests métier et PostgreSQL du service. |
| `backend/tests/test_orienteur_candidates_postgres_contract.py` | Contrat HTTP/JWT et lecture seule. |
| `backend/tests/test_gis_full_http_contract.py` | Contrat HTTP/JWT complet du parcours SIG. |
| `backend/api/routes/gis_datasets.py` | Conservation du chemin réel de couche dans l’aperçu. |
| `backend/tests/test_gis_dataset_contract.py` | Régression du chemin long. |
| `frontend/src/features/intervention-detail/OrienteurCandidates.jsx` | Comparaison à la demande et protection contre réponses tardives. |
| `frontend/src/features/intervention-detail/OrienteurAssessment.jsx` | Intégration du panneau candidats. |
| `frontend/src/features/intervention-detail/orienteur-assessment.css` | Présentation des résultats et sources. |
| `frontend/e2e/orienteur-candidates.spec.js` | Deux parcours navigateur ciblés. |
| `docs/bluevector/CANDIDATES_HERMES_CHECKPOINT_2026-09-04.md` | Ce bilan de reprise. |
| `C:/Users/Guest/AppData/Local/hermes/profiles/bluevector-qa/config.yaml` | Modèle QA par défaut Luna ; fournisseur et approbations conservés. |

Les exports de la revue Hermes et les captures sont conservés dans le dossier de sortie du travail Codex. Aucune modification Git de branche, aucun commit, push ou déploiement réalisé. Les nombreux changements préexistants du dépôt sont conservés.
