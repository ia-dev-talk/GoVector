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
8. Lors d’un futur ordre lié au même `Site`, la position canonique est réutilisée avec sa provenance. Les dossiers non encore liés conservent le rapprochement prudent de compatibilité.

## Données préparées et observations

| Domaine | Préparé par bureau/externe | Observé terrain | Règle V1 |
|---|---|---|---|
| Adresse | adresse/ville/CP | note ou repère GPS | conserver les deux |
| Réseau | NRO/SRO/PBO/PTO attendus | référence scannée/saisie | ne pas écraser sans résolution |
| Équipement | modèle/SN prévu | scan/SN posé | observation attribuée |
| Travaux | plan/consigne | commentaire/photo/mesure | journal append-only |
| Planning | créneau/durée estimée | départ/arrivée/durée réelle | champs distincts |

## Passage et provenance

- Les nouvelles observations de site, actions, médias, positions live, échecs et reports portent un `visit_id` lorsqu’un passage est identifiable.
- La migration v031 rattache les preuves historiques à un passage reconstitué et conserve `backfill_confidence`; elle ne prétend pas connaître une tentative qui n’a jamais été enregistrée.

## Import adaptatif et vérifiable

- Les profils d'import enregistrent les décisions humaines de correspondance
  (`en-tête source -> champ canonique`, y compris « ignorer ») et la ligne
  d'en-tête choisie par feuille.
- Ils sont versionnés dans la configuration, modifiables uniquement par un
  administrateur et chaque création, modification ou suppression est auditée.
- Un profil réutilise une décision déjà vérifiée; il ne transforme jamais une
  colonne inconnue en donnée métier par supposition.

## Identité Site et résolution GPS

- La migration v032 ajoute `Site` et relie `Job`/`JobSiteObservation` par `site_id`.
- Le backfill privilégie le PTO canonique ou une référence PTO exacte dans le même périmètre opérateur/client.
- Sans PTO, un rapprochement n’est permis que si adresse, ville, code postal et périmètre opérateur/client sont tous exactement identiques et désignent un seul site existant. Aucune correction orthographique ou distance approximative n’est utilisée pour fusionner.
- Un dossier insuffisamment identifié n’est jamais fusionné automatiquement. Une première action explicite « Position exacte du site » crée son conteneur stable.
- La première position explicite devient la référence canonique avec observation, auteur, date, source et révision.
- Une observation compatible dans le rayon de précision corrobore le site. Une observation éloignée devient `conflict` et n’écrase rien.
- L’orienteur, le chef orienteur ou l’administrateur peut accepter ou rejeter le repère. La résolution utilise une révision optimiste afin de refuser une décision prise sur un dossier périmé.
- Les entrées/sorties câble restent append-only et `unreviewed` jusqu’à une décision bureau; elles ne changent jamais la position canonique.

## Références réseau et équipements structurés

- Depuis v033, une nouvelle saisie Mobile distingue explicitement PTO, PBO ou PM.
- Les scans ONT, routeur, boîtier WiFi, PTO et splitter deviennent des observations structurées liées au site et au passage.
- Une valeur identique à la référence préparée ou résolue est corroborée.
- Une valeur différente devient `conflict`; une valeur sans référence antérieure reste `unreviewed`.
- Seul le bureau peut accepter une valeur nouvelle comme référence résolue. La valeur préparée sur l’ordre reste conservée.
- Une PTO déjà rattachée à un autre site dans le même périmètre provoque `site_identity_conflict`; BlueVector ne fusionne jamais silencieusement les sites.
- Les anciennes notes réseau non typées restent dans le journal mais ne sont pas transformées rétroactivement en faits structurés.

## Limites V1 connues

- Les dossiers historiques sans PTO et sans position terrain explicite peuvent rester sans `site_id`; ils utilisent temporairement le rapprochement prudent de compatibilité.
- La résolution structurée couvre GPS, PTO/PBO/PM et principaux scans d’équipement. La liaison/fusion manuelle de sites reste à ajouter avec prévisualisation obligatoire.
- Le GPS live nécessite une politique explicite de consentement, rétention et visibilité avant production.

## Cible minimale

Chaque donnée structurante modifiable doit pouvoir porter : `source_system`, `actor_user_id`, `technician_id`, `observed_at`, `visit_id`, `base_job_revision` et un état de résolution. Les actions append-only (photo/commentaire) n’ont pas besoin du même mécanisme de conflit que les références réseau.
