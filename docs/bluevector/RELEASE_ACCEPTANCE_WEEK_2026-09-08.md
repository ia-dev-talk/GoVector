# BlueVector — recette de livraison cette semaine

Objectif : terminer la version livrable pendant la semaine du 8 septembre 2026, sans attendre l'ancienne échéance du 14 septembre.

## Calendrier de décision

- **Vendredi 11 septembre** : code freeze fonctionnel. Aucun nouveau chantier hors blocker de livraison.
- **Samedi 12 septembre** : recette connectée, mobile Android, QField/QGIS et Praxedo sandbox si les accès tenant sont disponibles.
- **Dimanche 13 septembre** : marge de correction uniquement. Aucun ajout de scope.

La branche candidate reste `release/rc-20260914` pour éviter un renommage Git risqué ; son nom n'est plus la date contractuelle de livraison.

## Règle de preuve

Chaque modification du RC doit passer le workflow `BlueVector quality` directement sur la branche `release/**` :

- Alembic head unique ;
- tests backend ;
- bootstrap PostgreSQL propre + suite backend sous PostgreSQL ;
- frontend lint/tests/build ;
- Flutter analyze/tests ;
- APK release pilote compilé.

Un SHA différent du dernier SHA vert doit être revalidé. On ne corrige jamais directement un environnement de démonstration pour contourner un gate.

## STOP immédiat

La livraison repasse NO-GO si l'un des cas suivants apparaît :

- migration ou bootstrap DB impossible ;
- authentification technicien/admin impossible ;
- stock négatif, double consommation ou garde d'un autre technicien visible ;
- SN/MAC présenté comme appartenant au technicien sans `custody_verified=true` côté serveur ;
- perte d'une action offline après reconnexion ;
- écrasement silencieux d'une révision QField/QGIS plus récente ;
- longueur câble fabriquée à partir d'une distance GPS à vol d'oiseau ;
- écriture Praxedo lancée avec un endpoint, une méthode ou un mapping deviné ;
- secret tenant présent dans Git, log ou capture.

## 1. Intervention technicien

1. Se connecter avec un compte technicien de recette.
2. Vérifier que seules ses interventions affectées sont visibles.
3. Ouvrir une intervention et contrôler client/adresse/réseau/statut.
4. Exécuter les commandes de workflow autorisées par le serveur.
5. Passer offline, enregistrer une action, revenir online et synchroniser.

**Accepté si** le serveur reste source de vérité et l'action offline n'est ni perdue ni dupliquée.

## 2. Stock terrain — consommables + sérialisés

### Consommables

1. Ouvrir `Mon stock terrain`.
2. Vérifier les articles et `available_quantity` venant de `GET /api/v1/tech/jobs/stock-v2`.
3. Consommer un article sur une intervention de recette.
4. Synchroniser puis rejouer le même événement.
5. Vérifier une seule consommation et un seul mouvement d'historique.

### Équipements sérialisés

1. Vérifier `GET /api/v1/tech/jobs/stock-v2/serialized`.
2. Contrôler SN, MAC, statut, dépôt de garde et intervention liée.
3. Scanner un équipement réellement affecté au technicien.
4. Tester un équipement d'un autre technicien : il doit être refusé/non présenté comme garde valide.

**Accepté si** la liste et le scanner utilisent la même règle de garde serveur et aucun marqueur ressemblant (`TECH-7` / `TECH-70`) ne crée de faux positif.

## 3. Câble

1. Enregistrer `Entrée câble` puis `Sortie câble` avec la même référence câble.
2. Si des repères compteur/bobine physiques sont disponibles, vérifier `abs(sortie - entrée)`.
3. Tester aussi l'ordre offline inversé.
4. Pour une route GIS explicitement désignée, vérifier la longueur de la LineString/MultiLineString réelle.
5. Vérifier que la mesure physique reste prioritaire sur la géométrie.

**Interdit** : déduire la longueur finale de la simple distance GPS entre les extrémités.

Le décrément automatique de stock câble reste désactivé tant que le catalogue client ne fournit pas une correspondance fiable article/unité/longueur.

## 4. QGIS / QField

Parcours de livraison : round-trip GeoJSON revision-safe.

1. `GET /api/v1/gis-datasets/{dataset_id}/qfield-sync`.
2. Modifier une géométrie/propriété dans QGIS/QField.
3. `POST /api/v1/gis-datasets/{dataset_id}/qfield-sync/preview`.
4. Vérifier `noop`, `apply` ou `conflict`.
5. N'appliquer que si le preview est sans conflit.
6. `POST /api/v1/gis-datasets/{dataset_id}/qfield-sync/apply`.
7. Réexporter et vérifier la nouvelle révision.
8. Envoyer ensuite une copie ancienne : conflit obligatoire, aucune écriture partielle.

Pour le parcours QFieldCloud natif, utiliser PostgreSQL/PostGIS via `pg_service`/Secrets ; aucun mot de passe dans le projet QGIS ou le dépôt Git.

## 5. Praxedo

### Ce que BlueVector doit garantir sans accès tenant

- readiness explicite `not ready` au lieu d'inventer ;
- Basic/OAuth2 configurables ;
- endpoints tenant relatifs, HTTPS obligatoire ;
- contrat canonique BlueVector séparé du mapping tenant ;
- journal d'échange durable ;
- aucune répétition automatique d'une écriture au résultat réseau ambigu sans idempotence confirmée.

### Pour fermer le gate réel cette semaine

Il faut obtenir du client/Praxedo :

1. URL tenant/sandbox et région ;
2. documentation API correspondant au tenant ;
3. credentials de test Basic ou OAuth2 ;
4. OpenAPI et/ou WSDL exact ;
5. opérations/scopes pour interventions, techniciens, articles, stock, consommations/transferts et comptes-rendus ;
6. identifiants des champs personnalisés nécessaires ;
7. dictionnaire de statuts/transitions ;
8. pagination/quotas/timeouts ;
9. mécanisme delta/polling/webhook ;
10. jeu de données sandbox anonymisé.

Les aliases de **lecture** déjà gouvernés dans BlueVector sont :

- `technician_list` ;
- `intervention_get` ;
- `article_list`.

Ils ne contiennent aucun chemin Praxedo en dur : les URLs relatives et paramètres exacts doivent venir de la documentation du tenant. Le smoke n'autorise aucune opération d'écriture et ne retourne que la forme de la réponse (`kind`, clés, taille), jamais les valeurs métier.

Dès réception des accès : configurer les aliases d'opérations, exécuter d'abord un smoke **lecture seule réel**, binder les external IDs, puis seulement tester une écriture contrôlée lorsque méthode, endpoint, version de contrat, mapping et idempotence sont tous confirmés.

## 6. Smoke non destructif

Exécution normale sans obligation de joindre Praxedo :

```bash
python scripts/release_acceptance_smoke.py \
  --root-url http://localhost:8080 \
  --technician-token "$BLUEVECTOR_TECH_TOKEN" \
  --admin-token "$BLUEVECTOR_ADMIN_TOKEN" \
  --dataset-id "$BLUEVECTOR_DATASET_ID"
```

Le smoke vérifie :

- `/health` ;
- stock technicien agrégé ;
- garde sérialisée SN/MAC vérifiée ;
- readiness Praxedo ;
- journal d'intégration ;
- export QField.

Il ne consomme aucun stock, ne fait aucun `qfield-sync/apply` et ne déclenche aucune écriture Praxedo.

### Lecture Praxedo réelle facultative hors mode strict

L'opération doit être choisie à partir du contrat tenant, jamais par défaut :

```bash
python scripts/release_acceptance_smoke.py \
  --root-url https://bluevector.example \
  --technician-token "$BLUEVECTOR_TECH_TOKEN" \
  --admin-token "$BLUEVECTOR_ADMIN_TOKEN" \
  --dataset-id "$BLUEVECTOR_DATASET_ID" \
  --praxedo-smoke-operation technician_list \
  --praxedo-path-params '{}' \
  --praxedo-params '{"limit":1}'
```

`technician_list` ci-dessus n'est qu'un exemple **si et seulement si** le contrat tenant documente cet alias et ses paramètres configurés. Pour `intervention_get`, les `path_params` doivent être fournis selon le chemin tenant configuré.

### Mode strict final

```bash
python scripts/release_acceptance_smoke.py \
  --root-url https://bluevector.example \
  --technician-token "$BLUEVECTOR_TECH_TOKEN" \
  --admin-token "$BLUEVECTOR_ADMIN_TOKEN" \
  --dataset-id "$BLUEVECTOR_DATASET_ID" \
  --praxedo-smoke-operation "$PRAXEDO_ACCEPTANCE_READ_ALIAS" \
  --praxedo-path-params "$PRAXEDO_ACCEPTANCE_PATH_PARAMS_JSON" \
  --praxedo-params "$PRAXEDO_ACCEPTANCE_QUERY_JSON" \
  --strict-delivery
```

Le mode strict refuse désormais :

- token technicien manquant ;
- token admin manquant ;
- dataset QField manquant ;
- alias de smoke Praxedo manquant ;
- `ready_for_read != true` ;
- échec de la requête réelle Praxedo ;
- réponse de smoke qui n'affirme pas `business_values_exposed=false`.

Ainsi, une simple configuration syntaxiquement complète ne peut plus être confondue avec une intégration réellement joignable.

## 7. Sauvegarde et rollback

Avant recette finale ou démonstration :

1. sauvegarder PostgreSQL et les médias ;
2. noter le SHA exact déployé ;
3. conserver le dernier SHA vert ;
4. en cas de gate critique, restaurer la sauvegarde et revenir au dernier SHA vert.

## Verdict GO

La version est GO cette semaine uniquement si :

- le SHA du RC est vert sur les quatre jobs qualité ;
- intervention/mobile/offline sont reproduits sur appareil ;
- stock consommable + garde sérialisée + historique passent la recette ;
- câble respecte les sources d'autorité ;
- QField/QGIS round-trip et conflit ancien sont reproduits ;
- le readiness Praxedo reflète les accès réels ;
- si les accès tenant sont fournis pour la livraison, le smoke lecture sandbox réel passe ;
- aucun secret n'est versionné ;
- sauvegarde/rollback sont prêts.

Tout blocker externe Praxedo restant doit être nommé explicitement comme tel ; il ne doit jamais être masqué par un mapping ou endpoint supposé.
