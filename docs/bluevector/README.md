# Référentiel métier BlueVector

Ce dossier est la mémoire métier et architecturale du produit. Il doit être lu avant toute modification touchant le workflow, le GPS, les affectations, les preuves terrain, les rôles, l’import ou les intégrations.

## État réel au 11 août 2026

La branche V1 dispose d’un workflow technicien piloté par le backend, d’une outbox mobile idempotente, de médias durables, d’un historique personnel/site, d’un contexte bureau-terrain, d’une géolocalisation live distincte de la position planifiée, d’un premier modèle d’équipes/clients, de passages terrain et d’affectations historiques depuis v031, puis d’une identité `Site` et d’une résolution GPS explicite depuis v032.

`Job` reste l’ordre de travail stable consommé par les anciens clients. `JobVisit` porte chaque tentative terrain et `Assignment` conserve chaque participation, avec une seule visite et une seule affectation courantes par ordre. `Site` stabilise l’identité physique et la position terrain résolue sans fusion approximative d’adresses. Depuis v033, les observations PTO/PBO/PM et les principaux scans d’équipement utilisent aussi un contrat planned/observed/resolved. La fusion manuelle de sites et les adaptateurs Praxedo/QField restent à construire.

## Ordre de lecture

1. [Glossaire métier](DOMAIN_GLOSSARY.md)
2. [Propriété des données et géolocalisation](DATA_OWNERSHIP_AND_GEOLOCATION.md)
3. [Workflow terrain](FIELD_WORKFLOWS.md)
4. [Rôles et capacités](ROLE_CAPABILITIES.md)
5. [Scénarios d’acceptation](ACCEPTANCE_SCENARIOS.md)
6. [Frontières Praxedo/QField](INTEGRATION_BOUNDARIES.md)
7. [Roadmap de convergence](ROADMAP.md)
8. [Rapport de validation B0](B0_VALIDATION_REPORT.md)
9. [Confidentialité et rétention GPS](GPS_PRIVACY_AND_RETENTION.md)
10. [Checklist de livraison Android](ANDROID_RELEASE_CHECKLIST.md)
11. [Import adaptatif Excel et CSV](ADAPTIVE_IMPORT.md)

## Principes non négociables

- Une donnée inconnue reste `null`; elle ne devient jamais `0`, chaîne vide, époque Unix, Casablanca ou « inconnu ».
- La position planifiée, le GPS live et le repère terrain confirmé sont trois données différentes.
- Une observation terrain est append-only, attribuée et datée. Elle ne remplace pas silencieusement la donnée préparée.
- Le backend décide des transitions, permissions et exigences. React et Flutter rendent les capacités reçues.
- Un reçu technique de synchronisation n’est pas un historique métier.
- Le client entreprise consulte son périmètre en lecture seule.
- Les identités d’acteur viennent du JWT, jamais d’un payload client.
- Toute intégration externe passe par un adaptateur et des identifiants/version externes; aucun statut Praxedo/QField ne fuit dans `JobStatus`.
