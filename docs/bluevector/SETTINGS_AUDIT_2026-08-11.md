# Audit fonctionnel des paramètres — 11 août 2026

Cet audit distingue les réglages réellement persistés des vues informatives.
BlueVector ne présente pas un contrôle modifiable lorsqu’aucun contrat backend
ne permet de l’appliquer durablement.

| Section | État réel | Persistance / effet |
|---|---|---|
| Vue d’ensemble | lecture réelle | document runtime et révisions backend |
| Exploitation | modifiable | seuil GPS ancien et rétention GPS, document versionné |
| Équipes & clients | modifiable selon rôle | entreprises, comptes, équipes, secteurs et grades affectés |
| Référentiels métier | modifiable par admin | catalogue atomique et versionné, codes workflow protégés |
| Modules opérationnels | navigation réelle | ouvre les modules raccordés, sans dupliquer leur configuration |
| Intégrations | informative | Praxedo/QField/notifications restent explicitement non raccordés |
| Journal d’administration | lecture réelle | événements append-only des mutations privilégiées |
| Capacités à connecter | informative | dette produit visible, aucun faux bouton |
| À propos | lecture réelle | version et architecture du build courant |

## Correctifs de cette passe

- Les lignes du catalogue utilisent une identité d’interface stable. Modifier
  l’identifiant ne remonte plus le composant et ne fait plus perdre le focus.
- Le sélecteur de couleur modifie le brouillon sans rechargement de page.
- L’état « modifications non enregistrées » est visible, annulable et protégé
  lors d’un changement de section, d’une actualisation ou d’une fermeture.
- Les identifiants sont validés côté client selon le même contrat que FastAPI.
- Les deux entrées nommées « Référentiels métier » ont été séparées en
  « Référentiels métier » et « Modules opérationnels ».
- Un chargement partiel d’Équipes & clients est désormais signalé au lieu de
  remplacer silencieusement une ressource indisponible par une liste vide.

## Évolutions encore honnêtement non livrées

- La politique de clôture avancée est persistée mais ne dispose pas encore d’un
  éditeur administratif complet par opérateur et type d’intervention.
- Les intégrations Praxedo, QField et notifications n’ont pas encore leurs
  adaptateurs; elles restent donc volontairement en lecture informative.
- La suppression définitive des comptes, grades utilisés et équipes est évitée
  au profit de l’archivage afin de conserver l’historique métier.
