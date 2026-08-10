# Propriété des données et géolocalisation

## Trois vérités à ne pas fusionner

| Donnée | Auteur typique | Stockage V1 | Usage | Peut écraser une autre donnée ? |
|---|---|---|---|---|
| Position planifiée | import/orienteur/géocodeur | `Job.latitude/longitude` | préparation, carte, navigation initiale | non |
| GPS live technicien | téléphone | `GPSHistory`, statut live | supervision et trajet | non |
| Repère terrain confirmé | technicien, action explicite | `JobSiteObservation(site_location)` | retour d’expérience et prochain passage | non; présenté avec provenance |
| Entrée/sortie câble | technicien | `JobSiteObservation(cable_entry/cable_exit)` | contexte réseau | non |

Une adresse seule est valide. Le géocodage retourne soit une coordonnée résolue, soit `null`; il ne fabrique pas de point. Une position proposée doit rester identifiable comme donnée de préparation.

## Confirmation cartographique sans API Google

Le bureau peut ouvrir une recherche Google Maps au moyen de l'URL publique officielle `maps/search/?api=1&query=...`. Cette ouverture ne nécessite ni clé ni API Google et ne transmet aucun résultat automatiquement à BlueVector.

Si le géocodeur ouvert ne trouve pas l'adresse avec une confiance suffisante, l'orienteur peut :

1. vérifier visuellement le lieu dans Google Maps ;
2. utiliser « Partager » et coller le lien officiel dans BlueVector, ou coller directement `latitude, longitude` ;
3. contrôler le marqueur sur la carte Leaflet ;
4. enregistrer explicitement le point.

BlueVector extrait uniquement des coordonnées déjà présentes dans le lien partagé. Il ne scrape pas le contenu d'une page Google, ne contourne pas de CAPTCHA et ne transforme jamais une adresse seule en coordonnées supposées. Les liens courts officiels peuvent être développés en suivant uniquement des redirections HTTPS vers une liste fermée de domaines Google.

La provenance est conservée sur l'ordre avec `planned_location_source` et `planned_location_precision`. Elle reste distincte du GPS live et du repère terrain confirmé par le technicien.

## Scénario GPS de référence

1. L’orienteur crée/import un dossier avec une adresse, même sans coordonnées.
2. Il peut demander un géocodage et confirmer la position planifiée sur la carte.
3. Le technicien reçoit adresse, position planifiée, plans, photos et consignes.
4. Pendant le passage, le GPS live alimente seulement la supervision.
5. Sur place, le technicien choisit explicitement « Position exacte du site »; précision, auteur et date sont conservés.
6. Il peut enregistrer séparément entrée et sortie câble.
7. Le frontend montre position planifiée, repère confirmé et provenance sans les fusionner.
8. Lors d’un futur ordre, le repère peut être hérité si le rapprochement serveur est fiable; l’UI doit préciser « passage précédent », critère de rapprochement et confiance.

## Données préparées et observations

| Domaine | Préparé par bureau/externe | Observé terrain | Règle V1 |
|---|---|---|---|
| Adresse | adresse/ville/CP | note ou repère GPS | conserver les deux |
| Réseau | NRO/SRO/PBO/PTO attendus | référence scannée/saisie | ne pas écraser sans résolution |
| Équipement | modèle/SN prévu | scan/SN posé | observation attribuée |
| Travaux | plan/consigne | commentaire/photo/mesure | journal append-only |
| Planning | créneau/durée estimée | départ/arrivée/durée réelle | champs distincts |

## Limites V1 connues

- `JobSiteObservation` est reliée au job, pas encore à un `JobVisit`.
- L’héritage d’un repère repose sur un rapprochement prudent, pas sur un identifiant `Site` stable.
- Il n’existe pas encore de workflow `unreviewed/accepted/rejected/conflict` pour résoudre PTO/PBO/GPS contradictoires.
- Le GPS live nécessite une politique explicite de consentement, rétention et visibilité avant production.

## Cible minimale

Chaque donnée structurante modifiable doit pouvoir porter : `source_system`, `actor_user_id`, `technician_id`, `observed_at`, `visit_id`, `base_job_revision` et un état de résolution. Les actions append-only (photo/commentaire) n’ont pas besoin du même mécanisme de conflit que les références réseau.
