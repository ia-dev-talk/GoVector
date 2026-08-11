# Workflow terrain

## Deux axes

Un statut doit être lu selon deux questions : le passage terrain est-il actif ? L’ordre est-il encore ouvert ?

| Catégorie | Exemples | Passage actif | Ordre ouvert |
|---|---|---:|---:|
| Non affecté | `PENDING` | non | oui |
| Terrain actif | `ASSIGNED`, `ACCEPTED`, `EN_ROUTE`, `ON_SITE`, `IN_PROGRESS`, `WORK_IN_PROGRESS`, `INSTALLATION_DONE`, `CLIENT_VALIDATION` | oui | oui |
| En validation | `EN_ATTENTE_VALIDATION` | non | oui |
| Interrompu/replanifiable | `FAILED`, `CLIENT_ABSENT`, `POSTPONED`, `ON_HOLD`, `SUSPENDED` | non | oui |
| Fermé | `COMPLETED`, `CANCELLED` | non | non |

La vérité exécutable est `backend/logic/workflow/capabilities.py` et `WorkflowEngine`. Les clients ne doivent pas recopier ces listes.

## Parcours nominal technicien

```text
ASSIGNED → ACCEPTED → EN_ROUTE → ON_SITE
→ IN_PROGRESS → INSTALLATION_DONE
→ CLIENT_VALIDATION → EN_ATTENTE_VALIDATION
→ COMPLETED (validation bureau)
```

Les commandes exposées au client sont métier : `accept_and_start`, `arrive`, `start_work`, `close_field_visit`, `fail`, `postpone`, `validate`, `reassign`.

## Échec, absence et report

Un échec clôt le passage courant mais ne ferme pas nécessairement l’ordre. Le bureau doit pouvoir diagnostiquer, replanifier puis créer un nouveau passage. Sans `JobVisit`, V1 ne peut pas encore représenter proprement deux tentatives; éviter toute logique qui efface l’auteur, les dates ou preuves de la première.

## Clôture pilote

Photos, signature, mesures et longueur de câble sont facultatives. La `CompletionPolicy` backend reste la seule source d’exigences. Le technicien choisit librement les preuves utiles à l’intervention. Une future configuration client/opérateur pourra rendre certains éléments obligatoires sans recoder Flutter ou React.

## Journal

Le journal métier agrège les transitions, actions terrain, médias, échecs, reports et mouvements pertinents. `TechnicianSyncEvent` reste un reçu technique. Chaque future entrée doit être attribuable à un acteur/source et, après introduction de `JobVisit`, à un passage.

## Collaboration après la fin du passage

Un passage terminal ne rend pas le dossier muet. Le bureau et le technicien
peuvent encore ajouter des communications et preuves append-only : instruction,
demande de correction, accusé de prise en compte, réponse et complément.

Ces ajouts ne changent jamais `Job.status`. Une demande nécessitant un nouveau
déplacement devra devenir un futur `JobVisit` au lieu de rouvrir silencieusement
le passage précédent. `JobCommunication` est la vérité structurée de cet échange;
`JobActivityLog` n'en contient qu'une projection de journal.
