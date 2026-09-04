# Apports de recherche - FTTH, terrain et Agent Orienteur

Date d'analyse : 2 septembre 2026.

Ce document transforme les sources reçues en décisions de produit. Une source
d'inspiration n'est ni une norme applicable, ni une autorisation de copier son
code, ni une preuve que BlueVector possède déjà la fonctionnalité.

## Approbation humaine des actions d'agent

Sources : transcription Human-in-the-Loop et
[exemples associés](https://github.com/daveebbelaar/ai-cookbook/tree/main/models/openai/10-human-in-the-loop).

- Pour l'Agent Orienteur, préférer un plan de commandes structurées à une boucle
  libre d'outils lorsqu'une décision métier peut être décrite à l'avance.
- Une approbation est un objet persistant, pas un processus ou une connexion
  laissée en attente : proposition figée, arguments, règle déclenchée,
  approbateur, décision, date, expiration et résultat.
- Le backend recalcule permissions et préconditions au moment d'exécuter.
- Les commandes à risque échouent fermées si les arguments sont ambigus.

## Exécution durable avec Temporal

Sources : transcription de l'atelier Temporal/OpenAI Agents SDK et
[intégration Python officielle](https://github.com/temporalio/sdk-python/tree/main/temporalio/contrib/openai_agents).

Verdict : candidat sérieux pour les automatisations longues et l'orchestration
future de l'Agent Orienteur, mais pas une dépendance à introduire maintenant.

Prototype isolé attendu avant décision :

1. Une intervention entrante produit une proposition d'affectation.
2. Le workflow se suspend sans worker bloqué.
3. Une approbation humaine arrive plusieurs heures plus tard.
4. L'action reprend après redémarrage et n'est exécutée qu'une fois.
5. Une limite LLM et une API indisponible déclenchent des reprises bornées.
6. Les traces se raccordent à l'identifiant de commande BlueVector.

Temporal transporte l'exécution ; BlueVector reste l'autorité des faits,
permissions, transitions et journaux. Toute activité qui écrit doit être
idempotente. Les fonctions rejouées ne contiennent ni I/O directes ni
comportement non déterministe. Certaines surfaces de l'intégration sont encore
expérimentales : décision uniquement après spike, charge, reprise et audit.

## Mobile offline-first

Les deux fichiers reçus sont strictement identiques. Le guide explique bien le
stockage SQLite, le repository pattern, les suppressions logiques et l'état hors
ligne. Il ne livre toutefois que la partie 1 : le vrai moteur de
synchronisation, les reprises et le background sync sont annoncés pour la suite.

À ne pas reprendre tel quel :

- last-write-wins global pour des événements terrain ou du stock ;
- fusion de texte générique pour des champs métier structurés ;
- mot de passe de chiffrement codé dans l'application ;
- conflit résolu sans version serveur, précondition ni preuve d'idempotence ;
- tests qui ne simulent pas les coupures au milieu d'une écriture.

Contrat BlueVector cible : outbox persistante, `event_id` stable, accusé serveur,
rejeu sans doublon, états `pending/sending/acknowledged/conflict/rejected`, ordre
par intervention et passage, pièces jointes séparées, reprise progressive et
écran d'exceptions compréhensible par le technicien.

## Référentiel terrain FTTH fourni en PDF

Le document « Ligne terminale fibre optique - Normes et conseils » apporte une
bonne taxonomie NRO -> SRO -> PBO -> PTO, les segments transport/distribution/
branchement, des architectures, des codes couleur et des listes de contrôle au
SRO, PBO et chez le client.

Utilisation proposée : dictionnaire d'actifs et relations FTTH ; checklists par
opérateur et intervention ; preuves structurées de mesure ; règles de pose,
fixation, étiquetage et rangement ; contrôle de cohérence couleurs/capacités.

Réserve : le document mélange des références ivoiriennes et une formulation du
Plan France THD, sans métadonnées suffisantes pour en faire une norme actuelle
universelle. Seuils et dimensionnements deviennent des valeurs de catalogue
versionnées, jamais des constantes globales, puis sont confirmés par pays,
opérateur, client, contrat et date d'effet.

## QGIS, GeoMapTric et FiberQ

[GeoMapTric](https://www.geomaptric.co.uk/planning-ftth-networks-with-qgis/)
montre comment relier bâtiments, routes et hubs, mais reconnaît que le plus
proche voisin produit des anomalies et non un tracé réel. C'est un démonstrateur,
pas un algorithme de conception exploitable.

[FiberQ](https://github.com/vukovicvl/fiberq) est la référence la plus utile du
lot pour le validateur GIS : topologie, connectivité, intégrité référentielle,
identité, attributs requis, domaines, longueurs, CRS et géométries, avec rapport
HTML/JSON/CSV. Son code est GPL-3.0-or-later : observer les comportements et
concevoir nos propres contrats/tests, sans copier son code dans BlueVector.

## Field Service Management

[Beveren FSM](https://github.com/Beveren-Software-Inc/Field_Service_Management)
confirme un parcours lisible : demande -> devis optionnel -> ordre -> rendez-vous
-> exécution -> facturation, avec planning, technicien et pièces consommées.

Il dépend de Frappe/ERPNext et utilise l'AGPL-3.0. BlueVector ne migre pas vers
cette pile et n'en reprend pas le code. Les idées à comparer sont le dispatch
board, le lien rendez-vous/consommation, les approbations et la continuité vers
le reporting ou la facturation client.

## Décisions de backlog

1. Terminer l'historique matériel croisé autour de `JobVisit`.
2. Formaliser `AgentCommand`, `ApprovalRequest` et `DecisionAudit` sans LLM en
   production.
3. Écrire les règles de validation GIS BlueVector et leurs fixtures.
4. Durcir le contrat offline avec tests de coupure/rejeu/conflit.
5. Transformer les contrôles FTTH du PDF en catalogues versionnés et checklists
   configurables, après validation métier humaine.

