# Glossaire métier

## Dossier / ordre de travail

Demande opérationnelle à réaliser pour un donneur d’ordre. Il porte la référence externe, le client, l’adresse, le planning, l’activité, les consignes et l’état global. Aujourd’hui il est stocké dans `Job`.

## Intervention / passage terrain

Tentative concrète d’exécution sur le terrain : technicien, départ, arrivée, travaux, résultat et preuves. Un ordre peut nécessiter plusieurs passages après absence client, report, échec ou reprise. Aujourd’hui ce concept n’a pas encore sa table propre; `Job` porte le passage courant. La cible est `JobVisit`.

## Affectation

Décision donnant la responsabilité d’un ordre/passage à un technicien. `Assignment` représente actuellement une seule affectation courante par job. La cible est un historique append-only avec début, fin, motif et acteur.

## Donnée préparée

Information fournie par import, client ou orienteur avant le terrain : adresse, position estimée, PBO/PTO attendu, plan, consigne. Elle peut être absente ou erronée.

## Observation terrain

Fait capturé par un technicien : photo, mesure, commentaire, équipement scanné, position du site, entrée/sortie de câble. Elle possède un auteur, une date, une source et un passage. `TechnicianFieldAction`, `TechnicianMedia` et `JobSiteObservation` en portent déjà une partie.

## Valeur résolue

Valeur retenue après comparaison entre donnée préparée, observation(s) terrain et source externe. Ce mécanisme n’existe pas encore de manière générique. Tant qu’il n’existe pas, l’UI doit montrer la provenance et éviter tout écrasement silencieux.

## Position planifiée

Coordonnées de préparation dans `Job.latitude/longitude`, obtenues par import, saisie carte ou géocodage. Elles servent à préparer/acheminer, mais ne constituent pas une preuve terrain.

## GPS live

Télémétrie temporaire du téléphone pendant une intervention (`GPSHistory` et état live du technicien). Elle sert à la supervision et au trajet. Elle ne doit jamais modifier la position planifiée ni devenir automatiquement le repère du site.

## Repère terrain confirmé

Observation explicite `site_location`, déclenchée par le technicien depuis l’action « Position exacte du site ». Elle est durable et peut être proposée aux passages suivants quand le rapprochement de site est suffisamment fiable.

## Entrée / sortie câble

Observations géolocalisées `cable_entry` et `cable_exit`. Elles décrivent des points physiques utiles au réseau. Ce ne sont ni le GPS live du technicien ni nécessairement le point d’adresse client.

## Site

Lieu physique durable sur lequel plusieurs ordres peuvent être exécutés. Il n’existe pas encore comme entité canonique. Le rapprochement V1 utilise prudemment PTO/PBO/adresse/coordonnées et doit afficher sa base et son niveau de confiance.

## Preuve terrain

Élément attaché à l’exécution : média, signature, mesure, scan, commentaire ou observation GPS. Pour le pilote, ces éléments sont facultatifs à la clôture; ils ne doivent jamais être inventés.

## Reçu de synchronisation

`TechnicianSyncEvent` prouve qu’un événement outbox a été reçu/traité idempotemment. Il ne décrit pas à lui seul ce qui s’est passé métier; le journal métier s’appuie sur logs, actions, médias, échecs et reports.
