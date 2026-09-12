# Rôles et capacités

| Rôle | Portée | Écritures attendues | Interdictions |
|---|---|---|---|
| Admin | plateforme entière | clients, comptes, paramètres, équipes, référentiels | aucune donnée inventée; actions auditées |
| Agent terrain (`CHEF_ORIENTEUR` historique) | contrôle terrain de son équipe | interventions de son équipe, preuves, retour ou validation | aucun droit global d’administration |
| Orienteur | dossiers/équipes sous responsabilité | préparation, affectation, consignes, pièces, validation, stock opérationnel | ne peut agir hors périmètre |
| Technicien | jobs affectés, et dossiers auxquels il a réellement participé | commandes terrain pendant le passage; observations, médias, réponses et compléments append-only après le passage | pas de mutation stock autoritative, de réouverture implicite ni job d’un autre technicien |
| Client entreprise | son organisation | aucune en V1 | lecture seule stricte, jamais stock/personnel interne |

`COORDINATEUR` et `SUPERVISEUR` existent encore dans l’enum mais leur périmètre final n’est pas défini. Ils restent des rôles internes; ne pas leur ajouter de droits métier par supposition.

## Équipes V1

- Une équipe active possède exactement un orienteur.
- Un orienteur ne possède qu’une équipe V1.
- Une équipe active contient au moins un technicien.
- Un technicien appartient au plus à une équipe et porte un grade actif du référentiel métier versionné. `junior` et `senior` restent les valeurs initiales de compatibilité.
- Une équipe couvre un ou plusieurs secteurs.
- Le chef orienteur/admin peut déplacer un technicien; la projection legacy `Technician.orienteur_id` reste synchronisée.

Ces règles décrivent l’organisation courante, pas l’historique. La future évolution doit dater les appartenances pour préserver les responsabilités passées.

## Règles d’autorisation

- Authentification et autorisation se font côté backend, par ressource.
- L’identité utilisateur/technicien vient du JWT.
- Les contrôles visuels React/Flutter améliorent l’UX mais ne constituent pas une sécurité.
- Les comptes clients sont filtrés par `client_organization_id` et restent read-only.
- Leur portail sépare les ordres ouverts, les passages terrain actifs, les dossiers
  en attente de validation et les ordres terminés; il permet recherche, filtres et
  cartographie des positions planifiées.
- Une position technicien n'y apparaît que pendant une intervention active de
  cette organisation, si le technicien travaille bien sur ce dossier et si le
  point respecte le seuil de fraîcheur GPS configuré.
- Cette vue n'expose jamais téléphone, domicile, vitesse, cap, batterie,
  commentaire interne ou intervention d'une autre organisation.
- Les routes internes (FTTH, stock, import, dispatch) ne sont jamais publiques.
- Une intervention terminale reste collaborative en lecture/ajout append-only pour ses participants historiques; son résultat et son workflow restent immuables.
