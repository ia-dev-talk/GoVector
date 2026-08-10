# Frontières d’intégration

## État actuel

Praxedo et QField ne sont pas connectés. Les écrans/paramètres qui les mentionnent décrivent une roadmap, pas un flux opérationnel actif.

## Praxedo

```text
payload Praxedo → PraxedoAdapter → commande/DTO BlueVector
événement métier BlueVector → PraxedoAdapter → statut/payload Praxedo
```

Le lien externe doit être qualifié par `(source_system, entity_type, external_id)` et conserver `source_revision`/ETag. `job_number` seul ne suffit pas.

À clarifier avec Praxedo avant code : authentification, environnements, webhooks/polling, quotas, identifiants, dictionnaire de statuts, affectations, créneaux, formulaires, pièces jointes, reprises, idempotence et règles de conflit.

## QField

QField doit envoyer des deltas, pas écraser directement les tables FTTH :

```text
delta QField → QFieldAdapter → validation → observation/version
→ résolution explicite → projection canonique éventuelle
```

Chaque delta futur porte `operation_id`, feature externe, version de base, attribut/géométrie, auteur/source et date d’observation. Les conflits PBO/PTO/coordonnées sont évalués par champ et version. PostGIS n’est requis que lorsque le contrat géométrique le justifie.

## Assistant BlueVector

Le bot doit interroger les mêmes services RBAC que l’interface, tolérer fautes et synonymes, citer la provenance et dire « inconnu » quand la donnée manque. Il ne doit jamais contourner les permissions, inventer une réponse, déclencher une mutation ambiguë ni utiliser un reçu sync comme preuve métier.
