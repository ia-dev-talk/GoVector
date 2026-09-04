# BlueVector — personnalisation client et échanges SIG

État du 4 septembre 2026. Travail local sur `release/v1-20260817`, dans un arbre déjà modifié avant cette intervention. Aucun push, déploiement ou changement de la base habituelle.

## Résultat fonctionnel

### Règles métier par entreprise

Dans Paramètres → Clôture terrain, un administrateur peut ajouter une règle propre à une entreprise cliente, choisir les preuves obligatoires et le minimum de photos. La priorité serveur est **entreprise cliente → opérateur → type d’intervention → règle générale**. Chaque niveau remplace la règle complète du niveau inférieur ; il ne s’agit pas d’une fusion champ par champ.

Les règles restent dans la configuration opérationnelle persistante, révisionnée et auditée. L’API refuse les identifiants invalides et les entreprises inexistantes. Une modification concurrente exige un rechargement. Les autres paramètres sont conservés. Une entreprise inactive peut conserver sa règle existante ; elle n’est pas proposée pour créer une nouvelle exception dans l’interface.

CompletionPolicy demeure l’autorité métier pour les exigences de clôture et alimente également l’analyse de l’Agent Orienteur. Le contrat mobile existant expose les preuves manquantes reçues du serveur ; aucune nouvelle application Android n’a été installée ou validée sur téléphone pendant ce lot.

### Parcours SIG

Dans Secteurs → Jeux de données SIG, l’administrateur choisit une entreprise active, analyse un KML/KMZ, consulte les géométries et les compteurs, puis enregistre un brouillon. Il peut rouvrir son aperçu depuis PostgreSQL et publier explicitement une révision. Une couche publiée peut être téléchargée en GeoJSON, avec ses géométries, attributs et identifiants de provenance.

- Les géométries restent séparées des secteurs, interventions, sites et équipements opérationnels.
- Une couche regroupe un dossier et un type géométrique ; les compteurs de couches sont calculés depuis les objets persistés.
- Le contrôle du hash entre aperçu et enregistrement détecte un changement de fichier.
- Deux imports simultanés du même fichier pour la même entreprise ne créent qu’un jeu de données. Le même fichier pour deux entreprises crée deux ensembles indépendants.
- La publication verrouille le jeu de données et vérifie la révision. Deux publications concurrentes ne réussissent pas toutes les deux.
- Les endpoints SIG sont réservés à ADMIN. Ce lot ne donne pas d’accès SIG au portail client ni aux techniciens.
- La liste est paginée avec un curseur ; l’export de couche contient tous ses objets.
- L’aperçu montre au maximum 20 objets, avec signalement explicite lorsqu’il est partiel. Il n’utilise pas de fond de carte externe.
- Le parseur protège les tailles d’upload/décompression, XML et coordonnées. La persistance est limitée à 10 000 objets par fichier.
- Les attributs originaux sont également conservés dans `_bluevector.source_attributes` à l’export, même si la source utilisait le nom réservé `_bluevector`.

## Preuves

80 tests backend ciblés ont réussi au total : règles et preuves de clôture, capacités workflow, configuration révisionnée, Agent Orienteur, parseur KML/KMZ, services SIG et autorisations HTTP. Les 17 tests GIS/client directement concernés ont été rejoués après la dernière modification : 17 réussis.

Les contrats PostgreSQL utilisent des bases jetables nommées avec UUID, ouvertes puis supprimées par le test. Ils vérifient la relecture après reconnexion, la priorité par client, les refus de références invalides, les imports et publications concurrents, l’absence de modification des nombres d’interventions/secteurs, les révisions de géométrie, l’export exact et le refus d’une couche appartenant à un autre jeu de données.

Frontend : 262 tests unitaires réussis. Six parcours Playwright réussis sur les composants réels : analyse Orienteur, paramètres, exception client, erreur de chargement, import/publication/export SIG et rejet d’un fichier invalide. Captures contrôlées aux largeurs 1440 et 390 pixels. Les API de ces parcours navigateur sont simulées : cela ne constitue pas une recette de la pile applicative complète ni un test QGIS/QField.

Lint final réussi, build Vite final réussi et contrôle des différences Git sans erreur. L’import de l’application FastAPI confirme l’enregistrement des sept opérations SIG sous `/api/v1`. Avertissements préexistants : bundle AG Grid volumineux, chunk vendor vide et dépréciations de dépendances dans les tests backend. Un premier lint avait parcouru par erreur les rapports Playwright générés ; leur exclusion a corrigé le périmètre, puis le lint a été relancé avec succès.

## Limites avant livraison

Ce lot est une verticale fonctionnelle locale ; BlueVector dans son ensemble n’est pas déclaré terminé ni prêt à déployer. La base cible doit disposer de la migration V039 avant d’activer ces routes. Aucun nouveau schéma n’a été créé par ce lot et aucune migration n’a été appliquée à la base habituelle.

QGIS documente la lecture GeoJSON : [formats pris en charge](https://doc.qgis.org/3.44/en/docs/user_manual/managing_data_source/supported_data.html). QField documente l’usage des données vectorielles et la préparation d’un projet avec QFieldSync : [stockage et préparation](https://docs.qfield.org/how-to/project-setup/storage/). L’ouverture de nos exports dans ces logiciels n’a pas encore été testée. Le GeoJSON préparé ici est une étape d’échange, pas une synchronisation QField.

Restent à réaliser : projet QGIS et paquet QField testés, cache mobile, formulaires terrain, retours de modifications avec versions/conflits, correspondance métier des attributs, liens canoniques explicites et connecteur Praxedo. Le fichier original KML/KMZ binaire n’est pas archivé : géométries normalisées, attributs, styles, avertissements et empreinte sont persistés. Les fichiers publiés ne sont pas encore éditables/archivables dans l’interface.

Pour Praxedo, recueillir le contrat API et un environnement de test : authentification, identifiants, statuts, formulaires, médias, quotas, événements et conflits. Ne pas inventer un connecteur à partir du seul nom du produit.

## Fichiers modifiés dans ce lot

| Fichier | Rôle |
| --- | --- |
| `backend/api/schemas/settings.py` | Règles par identifiant d’entreprise et validation des clés. |
| `backend/api/routes/settings.py` | Vérification des entreprises référencées avant sauvegarde. |
| `backend/logic/completion_policy.py` | Priorité métier par entreprise. |
| `backend/services/gis/datasets.py` | Imports atomiques, idempotence, publication, aperçu persistant, export et audit. |
| `backend/api/routes/gis_datasets.py` | API authentifiée, multipart, pagination et endpoints SIG. |
| `backend/api/main.py` | Enregistrement du routeur SIG. |
| `backend/tests/test_gis_dataset_contract.py` | Contrats PostgreSQL et validations client/import. |
| `backend/tests/test_gis_http_contract.py` | Permissions de toutes les routes, upload KML/KMZ et erreur XML. |
| `frontend/src/components/settings/CompletionPolicySettingsSection.jsx` | Éditeur des exceptions par client. |
| `frontend/src/features/sectors/GisDatasetWorkspace.jsx` | Parcours SIG par entreprise. |
| `frontend/src/features/sectors/gis-datasets.css` | Présentation adaptative du parcours. |
| `frontend/src/pages/SecteursPage.jsx` | Accès au parcours administrateur. |
| `frontend/e2e/orienteur-harness.html` | Harnais hors build, incluant SIG et défilement des captures. |
| `frontend/e2e/orienteur.spec.js` | Sauvegarde d’une exception client sans perte des règles existantes. |
| `frontend/e2e/gis.spec.js` | Parcours SIG et fichier refusé. |
| `frontend/eslint.config.js` | Exclusion des rapports générés, qui ne sont pas du code applicatif. |
| `docs/bluevector/CLIENT_GIS_CHECKPOINT_2026-09-04.md` | Ce checkpoint. |

Le lot Orienteur précédent est décrit séparément dans `AGENT_ORIENTEUR_CHECKPOINT_2026-09-04.md`. Les autres modifications déjà présentes dans Git n’ont pas été assimilées au présent lot.

## Suite priorisée

1. Recette de la pile complète isolée : client réel de test, règle de clôture, import représentatif, publication et export.
2. Ouverture QGIS puis paquet QField de consultation, avec identités et preuve sur téléphone.
3. Mappings client et retours terrain versionnés ; traitement explicite des conflits avant projection dans le référentiel métier.
4. Connecteur Praxedo après réception du contrat réel ; tests de rejouabilité et de correspondance des statuts.
5. Agent Orienteur : candidats fondés sur disponibilité/compétences/secteur/stock, puis propositions révisables et commandes soumises aux permissions.

Le site vitrine Chehbi Management reste dans un lot ultérieur.
