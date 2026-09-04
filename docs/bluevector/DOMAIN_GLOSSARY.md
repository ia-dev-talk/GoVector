# Glossaire métier

## Dossier / ordre de travail

Demande opérationnelle à réaliser pour un donneur d’ordre. Il porte la référence externe, le client, l’adresse, le planning, l’activité, les consignes et l’état global. Aujourd’hui il est stocké dans `Job`.

## Intervention / passage terrain

Tentative concrète d’exécution sur le terrain : technicien, départ, arrivée, travaux, résultat et preuves. Un ordre peut nécessiter plusieurs passages après absence client, report, échec ou reprise. Depuis v031, `JobVisit` conserve ces tentatives; `Job` reste l’ordre de travail stable et sa projection courante pour compatibilité.

## Affectation

Décision donnant la responsabilité d’un ordre/passage à un technicien. Depuis
v031, `Assignment` conserve l'historique append-only des participations, avec
une seule affectation courante par ordre et des dates, motifs et acteurs pour
les changements.

## Donnée préparée

Information fournie par import, client ou orienteur avant le terrain : adresse, position estimée, PBO/PTO attendu, plan, consigne. Elle peut être absente ou erronée.

## Observation terrain

Fait capturé par un technicien : photo, mesure, commentaire, équipement scanné, position du site, entrée/sortie de câble. Elle possède un auteur, une date, une source et un passage. `TechnicianFieldAction`, `TechnicianMedia` et `JobSiteObservation` en portent déjà une partie.

## Valeur résolue

Valeur retenue après comparaison entre donnée préparée, observation(s) terrain
et source externe. Le contrat planned/observed/resolved existe pour la position
du site et, depuis v033, pour les principales références PTO/PBO/PM et certains
équipements. Il n'est pas encore générique pour tous les champs : l'interface
doit toujours montrer la provenance et éviter tout écrasement silencieux.

## Position planifiée

Coordonnées de préparation dans `Job.latitude/longitude`, obtenues par import, saisie carte ou géocodage. Elles servent à préparer/acheminer, mais ne constituent pas une preuve terrain.

## GPS live

Télémétrie temporaire du téléphone pendant une intervention (`GPSHistory` et état live du technicien). Elle sert à la supervision et au trajet. Elle ne doit jamais modifier la position planifiée ni devenir automatiquement le repère du site.

## Repère terrain confirmé

Observation explicite `site_location`, déclenchée par le technicien depuis l’action « Position exacte du site ». Elle est durable et peut être proposée aux passages suivants quand le rapprochement de site est suffisamment fiable.

## Entrée / sortie câble

Observations géolocalisées `cable_entry` et `cable_exit`. Elles décrivent des points physiques utiles au réseau. Ce ne sont ni le GPS live du technicien ni nécessairement le point d’adresse client.

## Site

Lieu physique durable sur lequel plusieurs ordres peuvent être exécutés.
Depuis v032, `Site` porte une identité canonique distincte des ordres. Le
rapprochement utilise prudemment PTO/PBO/adresse/coordonnées, expose sa base et
son niveau de confiance, et la fusion reste une décision humaine auditée.

## NRO

Nœud de raccordement optique situé en amont de la distribution FTTH. Il peut
héberger des équipements actifs et rattacher plusieurs SRO/PM.

## SRO / PM

Sous-répartiteur ou point de mutualisation entre la partie amont et la
distribution. Les termes peuvent varier selon l'opérateur ; BlueVector conserve
un identifiant technique stable et permet des libellés configurables.

## PBO

Point de branchement optique desservant plusieurs abonnés ou locaux. Sa
capacité, ses ports, son emplacement et son état sont des faits distincts.

## PTO / DTIo

Terminaison optique dans le local du client. La référence préparée, la référence
observée et la valeur résolue ne doivent pas être confondues.

## PoP de collecte

Site où un opérateur collecte le trafic d'un ensemble d'accès. Son niveau peut
être local, régional ou national selon l'architecture de l'opérateur.

## OLT, ONU/ONT et CPE

L'OLT termine et active les accès côté réseau. L'ONU/ONT convertit le signal
optique chez le client. Le CPE fournit les services au client. La limite de
responsabilité entre ces équipements est contractuelle et configurable.

## Zone / plaque FTTH

Ensemble de locaux raccordables associé à un ou plusieurs points de collecte.
Dans BlueVector, sa géométrie et ses rattachements proviennent d'une source
versionnée ; un centroïde calculé ne remplace jamais le polygone publié.

## Dataset GIS

Version contrôlée d'un ensemble de couches et de features géographiques issu
d'un import KML/KMZ ou d'une autre source. Il reste distinct du référentiel
canonique jusqu'à un rapprochement explicite.

## Preuve terrain

Élément attaché à l’exécution : média, signature, mesure, scan, commentaire ou observation GPS. Pour le pilote, ces éléments sont facultatifs à la clôture; ils ne doivent jamais être inventés.

## Reçu de synchronisation

`TechnicianSyncEvent` prouve qu’un événement outbox a été reçu/traité idempotemment. Il ne décrit pas à lui seul ce qui s’est passé métier; le journal métier s’appuie sur logs, actions, médias, échecs et reports.
