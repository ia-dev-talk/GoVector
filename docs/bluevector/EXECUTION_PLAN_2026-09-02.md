# Plan d’exécution BlueVector et préparation de l’Agent Orienteur

Date du constat : 2 septembre 2026.

Ce plan part du code, de la documentation, des migrations et des tests réellement
présents. Il ne transforme pas une cible d’architecture en fonctionnalité livrée.

## 1. État réel constaté

- Branche active : `release/v1-20260817`, en avance de deux commits sur sa
  branche distante. Le travail local existant est conservé.
- Web : les espaces Interventions, Personnel, Secteurs, Stocks, Rapports et
  Paramètres sont de vraies surfaces React raccordées aux API. Plusieurs couches
  CSS et générations de composants coexistent encore, ce qui augmente le risque
  de régression de densité et de lisibilité.
- Backend : `WorkflowEngine` et les capacités backend restent l’autorité des
  transitions. `Job.sector_id` reste l’identité opérationnelle canonique.
- Mobile : le workflow, l’outbox idempotente, l’historique technicien et la
  déclaration de matériel existent. La consommation débite bien le stock de
  garde du technicien et porte `job_id` et `technician_id`.
- Traçabilité stock : les consommations et mouvements terrain portent désormais
  le `JobVisit` exact lorsqu'il est connu. Le contrat refuse qu'un client impose
  lui-même ce lien ; il est dérivé ou transmis par le workflow canonique. La
  migration v040 et son retour arrière sont validés sur PostgreSQL isolé.
- Rapports/exports : rapports interactifs et modèles d’export existent. Il
  n’existe pas encore de moteur persistant permettant à un administrateur de
  composer, planifier, prévisualiser et auditer un rapport/export/email client.
- GIS : le parseur KML/KMZ sécurisé et la migration v039 de datasets versionnés
  existent localement. Le parseur passe 8 tests. La migration v038 vers v039 et
  son retour arrière ont été validés sur PostgreSQL isolé ; aucune API ou UI GIS
  complète n’est encore livrée.
- Qualité vérifiée ce jour : 259 tests frontend passent ; lint sans erreur avec
  un avertissement préexistant dans Personnel ; build de production réussi.
  Les 13 tests backend ciblés du contrat stock terrain passent également.

## 2. Contrats non négociables

1. Le backend décide des permissions, transitions, exigences et décisions
   exécutables. Web, Mobile et futurs agents rendent les capacités reçues.
2. `Job` est l’ordre stable ; `JobVisit` est le passage ; `Assignment` conserve
   les responsabilités ; `StockMovement` conserve la réalité matérielle.
3. Une consommation terrain doit relier acteur, technicien, ordre, passage,
   article, lot/série, quantité, date, source et idempotence.
4. Une donnée inconnue reste absente. Une observation n’écrase jamais
   silencieusement une donnée préparée.
5. Les automatisations et l’Agent Orienteur utilisent les mêmes commandes
   métier que les humains, avec journal, motif, préconditions et résultat.
6. Aucun agent ne reçoit un accès implicite plus large que le rôle humain
   correspondant.

## 3. Plan priorisé

### P0 — Stabiliser ce qui existe avant d’étendre

- Terminer la QA réelle écran par écran sur une base contrôlée : connexion,
  Cockpit, Interventions, fiche intervention, Personnel, Secteurs, Stocks,
  Paramètres, Rapports, permissions, erreurs et largeurs desktop/mobile.
- Mesurer pour chaque page : hauteur utile, nombre de décisions visibles sans
  défilement, densité, contraste, état vide/chargement/erreur et action primaire.
- Corriger en lots contractuels étroits avec un avant/après et un test de
  non-régression. Ne pas réécrire les espaces complets.
- Valider les chemins critiques sur PostgreSQL/Docker, puis le Mobile sur un
  téléphone physique avec un APK neuf.

Ordre UX proposé :

1. Interventions : garantir que la grille reçoit toute la hauteur restante,
   conserver une barre haute compacte et éviter que filtres/KPI écrasent le
   planning.
2. Secteurs : remplacer la simple perception « 4 secteurs + chiffres » par une
   vue de territoire exploitable : charge, capacité, exceptions, équipes,
   interventions et provenance de chaque indicateur.
3. Stocks : séparer clairement dépôt, garde technicien, disponible, réservé,
   consommé, à retourner et anomalies ; rendre chaque chiffre cliquable vers
   son historique filtré.
4. Paramètres — organisation/comptes : séparer utilisateurs, profils métier,
   équipes, secteurs et entreprises ; montrer les dépendances et conséquences
   avant activation/archivage.

### P1 — Fermer la boucle matériel de bout en bout

- Fait et validé : ajouter `visit_id` aux consommations et mouvements issus du
  terrain, sans inventer de passage pour les anciennes lignes.
- En cours, première verticale validée : l'historique enrichi du stock expose et
  filtre désormais le passage, avec tentative, statut et issue. Étendre ce même
  read model à la fiche intervention, fiche technicien, article/série et dépôt.
- Afficher la même écriture métier dans les cinq vues, avec des liens croisés,
  et tester l’idempotence hors ligne/en ligne.
- Ajouter des alertes d’incohérence : stock négatif, article non détenu,
  opérateur incompatible, série dupliquée, consommation sans passage actif.

### P1 — Moteur d’automatisations client

Construire un moteur déclaratif et auditable, pas des tâches codées en dur.

- `AutomationDefinition` : nom, propriétaire, organisation, état brouillon/
  actif, fuseau, calendrier ou déclencheur événementiel, destinataires et rôle.
- `AutomationDataScope` : période, clients, secteurs, équipes, activités,
  statuts, KPI et champs autorisés.
- `AutomationOutput` : email, CSV/XLSX, PDF ou webhook via adaptateurs séparés.
- `AutomationRun` : snapshot des paramètres, données sources, résultat,
  durée, erreur, livraison, nouvel essai et acteur.
- Pour les exécutions longues, persister chaque attente et chaque étape afin de
  reprendre après incident ; évaluer Temporal sur un prototype isolé avant
  toute dépendance de production.
- Prévisualisation obligatoire sur données réelles contrôlées avant activation.
- Mode simulation, validation à quatre yeux pour les destinataires externes,
  anti-spam, limites de volume, révocation et journal complet.

Premier scénario vertical : email Unifiber quotidien contenant le nombre de
fermetures, les interventions concernées et leurs dates, avec export joint,
prévisualisation et preuve de livraison.

### P1 — Socle natif de l’Agent Orienteur

L’agent ne doit pas piloter l’interface comme un humain. BlueVector doit exposer
des faits et commandes structurés :

- inbox d’événements et nouvelles interventions ;
- normalisation et enrichissement avec provenance/confiance ;
- files d’exceptions et priorités explicables ;
- proposition d’affectation avec contraintes et alternatives ;
- commandes idempotentes d’affectation, réaffectation, replanification,
  demande d’information, escalade et reporting ;
- journal de décision conservant contexte, règles, modèle/version, proposition,
  validation humaine, exécution et résultat.
- Toute action sensible devient une commande en attente persistée : identifiant
  stable, préconditions, proposition figée, approbateur, décision, expiration et
  reprise idempotente. L'approbation n'est jamais un simple dialogue bloquant.

Progression d’autonomie :

1. **Observation** : synthétise et signale, aucune écriture.
2. **Assistance** : propose une décision et explique ses facteurs.
3. **Exécution validée** : un humain approuve chaque commande structurée.
4. **Autonomie bornée** : exécute seulement les cas couverts par une politique
   versionnée, avec seuil de confiance et budget de risque.
5. **Supervision multi-secteurs** : un chef gère exceptions, règles et qualité ;
   les cas ambigus restent humains.

### P2 — Personnalisation gouvernée

- Étendre les catalogues actuels vers des politiques versionnées par client,
  opérateur et activité : clôture, preuves, SLA, champs, notifications et
  formulaires.
- Préparation, validation et activation différée d’une configuration.
- Simulation de l’impact sur des interventions existantes avant activation.
- Recherche transversale et vues personnelles sauvegardées sans modifier la
  vérité métier.

### P2 — GIS et intégrations

- API de prévisualisation/persistance des datasets KML/KMZ, publication,
  archivage, permissions, export et conflits optimistes.
- Chargement cartographique par viewport et cache mobile du sous-ensemble
  publié.
- Adaptateurs Praxedo/QField seulement après obtention des contrats/sandboxes ;
  aucun statut externe ne fuit dans `JobStatus`.
- Formaliser un validateur de topologie FTTH inspiré des bonnes idées observées
  dans FiberQ : connectivité, intégrité référentielle, identité, attributs
  obligatoires, domaines de valeurs, longueurs, CRS et santé géométrique. Aucun
  code GPL n'est copié dans BlueVector.

## 4. Besoins déjà prévus mais encore incomplets

- Stock complètement rattaché aux visites.
- Recherche plateforme transversale.
- Préparation puis activation contrôlée des configurations.
- Politique de clôture éditable par opérateur/type.
- Notifications ciblées, accusés et escalades.
- SLA/KPI canoniques par ordre, passage, site et client.
- MFA/SSO, révocation de sessions et délégations fines.
- Object storage, observabilité et test de restauration réel.
- E2E multi-passage/réaffectation/offline Web + Mobile.

## 5. Besoins à formaliser maintenant

- Calendrier opérationnel : jours fériés, pauses, astreintes, compétences,
  véhicules, zones et règles de trajet.
- Gestion des exceptions : doublons, données contradictoires, client absent,
  dépendance réseau, autorisation immeuble, panne collective et reprise.
- Qualité de décision : pourquoi cette affectation, quelles alternatives ont été
  rejetées, quel coût estimé, quel humain a corrigé la proposition.
- Plans de continuité : perte réseau, service externe indisponible, agent arrêté,
  seuil de tâches en attente et retour immédiat à l’exploitation humaine.
- Séparation entre connaissance générale réutilisable et données client : aucun
  secret, fichier client ou donnée personnelle ne doit entrer dans une mémoire
  transversale non cloisonnée.

## 6. Hermes — reprise progressive

**SESSION ACTUELLE** pour la continuité de configuration et les vérifications
légères. Une **NOUVELLE SESSION** ne sera créée que pour un travail long et
isolable, par exemple la construction d’un site ou un lot BlueVector borné.

Ordre de préparation :

1. Santé Gateway/versions/cron et gestion explicite des exécutions manquées.
2. Conserver Research Watch spécialisé, peu coûteux et strictement en lecture.
3. Créer des instructions de projet distinctes pour BlueVector, Chehbi
   Aménagement et Magillan ; ne pas mélanger leurs faits ni leurs secrets.
4. Adapter le principe « isoler, construire, prouver, livrer » au contexte réel :
   pas de nouvelle branche, push, PR, upload public ou revue externe sans demande.
5. Ajouter une compétence de preuve locale : tests, captures contrôlées et
   manifeste, sans enregistrer d’écran contenant des données sensibles.
6. Préparer un profil Agent Orienteur de simulation, sans accès d’écriture en
   production, alimenté uniquement par des contrats BlueVector audités.

État au 2 septembre : la compétence Hermes locale
`bluevector-orienteur-simulation` est créée et activée. Elle reste strictement
en lecture, sépare faits, lacunes, priorité, candidats, commande proposée,
risque et brouillon d'audit, marque toute proposition `SIMULATION_ONLY` et
`REQUIRES_HUMAN_APPROVAL`, et interdit toute écriture opérationnelle.

Une base de connaissances Markdown reliée peut être utile comme interface
humaine (Obsidian est une option), mais elle ne remplace ni la base BlueVector,
ni les journaux métier, ni la mémoire cloisonnée des profils Hermes. Le premier
prototype doit rester minimal : sources, notes atomiques, liens, index et
références ; aucun empilement de plugins ou synchronisation cloud de données
sensibles par défaut.

## 7. Première passe exécutée

- Validation frontend complète et build de production.
- Validation isolée du parseur KML/KMZ.
- Validation PostgreSQL isolée de la migration GIS v038 ↔ v039.
- Rattachement canonique des consommations et mouvements terrain au `JobVisit`,
  avec rejet du `visit_id` fourni par le client, 13 tests backend ciblés passés.
- Validation PostgreSQL isolée du cycle v038 → v039 → v040 → v039 : colonnes,
  index, clés étrangères `SET NULL` et suppression propre au retour arrière.
- Historique Stocks enrichi avec filtre `visit_id`, tentative, statut et issue
  du passage ; export CSV aligné et contrat mobile → mouvement → historique
  validé sur PostgreSQL jetable.
- Ajout d’un test de non-régression garantissant que le workspace desktop
  Interventions et ses trois panneaux peuvent utiliser toute la hauteur utile.

Prochain lot sûr : écrire le service canonique d'historique matériel croisé,
puis QA visuelle Interventions/Secteurs/Stocks/Paramètres sur une copie contrôlée
des données et corrections UX une par une avec preuve avant/après.

## 8. Checkpoint UX vérifié — 2 septembre 2026

Validation réalisée sur une pile Docker isolée, avec données synthétiques et
fenêtre 1280 × 720 :

- **Interventions** : la correction locale existante permet bien au workspace et
  à la grille planning d'utiliser toute la hauteur restante. Aucun débordement
  horizontal n'a été observé. Le bandeau supérieur reste dense à faible hauteur
  et pourra faire l'objet d'un lot séparé.
- **Secteurs** : en l'absence de hiérarchie GIS, le grand espace vide est remplacé
  par un état compact de 219 px. Le registre des secteurs opérationnels apparaît
  désormais dans le premier écran. Les actions GIS restent disponibles sans
  donner l'impression qu'elles remplacent le référentiel métier.
- **Stocks** : les libellés distinguent maintenant « en stock », « utilisable »
  et « déjà réservé », avec l'équation visible « en stock = utilisable + réservé ».
- **Comptes opérationnels** : ajout d'une recherche, de filtres par rôle et état,
  d'un compteur de résultats, de rôles lisibles et d'un état actif/désactivé.

Preuves du checkpoint : 261 tests frontend passés, build de production réussi,
lint sans erreur (un avertissement préexistant dans `PersonnelPage.jsx`), santé
HTTP confirmée et aucune erreur console pendant le parcours visuel.

Décisions reportées volontairement :

- séparer structurellement les comptes, entreprises clientes et équipes/secteurs
  au lieu de surcharger davantage la section actuelle des paramètres ;
- décider si « Users » doit devenir un annuaire dédié ou rester une combinaison
  de Personnel et Comptes, après clarification des usages administrateur ;
- poursuivre le service canonique d'historique matériel croisé et les vues de
  détail Stocks avant d'ajouter de nouveaux tableaux ou indicateurs ;
- garder PowerSync/SQLite/PostgreSQL au stade d'évaluation d'architecture :
  aucune dépendance offline n'est introduite sans prototype mobile borné et test
  sur téléphone physique ;
- garder le pipeline voix Darija–français et MoulSot A–D comme benchmark séparé,
  sans l'injecter dans ce lot UX.

## 9. Checkpoint Hermes utile — 2 septembre 2026

L'installation réelle a été auditée sans modifier le dépôt Hermes ni lancer de
mise à jour. Les deux backends Desktop locaux répondent correctement en version
0.21.0 et leur auto-test est sain. Le dépôt Hermes est propre mais très décalé
de l'amont ; une précédente mise à jour a atteint le commit local actuel puis a
terminé en échec (`OSError: Invalid argument`). Une nouvelle mise à jour est donc
reportée jusqu'à un lot dédié avec sauvegarde, inventaire des processus et preuve
de reprise des profils.

La tâche quotidienne Research Watch est **en pause** : elle ne doit plus
consommer de modèle sans besoin concret. Sa configuration d'origine a été
sauvegardée avant durcissement. Si elle est réutilisée plus tard, son runtime
cron n'expose que Web, navigateur et vision ; terminal, fichiers, exécution de
code, délégation, mémoire, contrôle du PC et auto-gestion cron sont désactivés.

Un profil séparé `bluevector-qa` est maintenant disponible :

- modèle `gpt-5.4-mini`, raisonnement faible, aucun cron et aucun MCP ;
- seulement deux compétences chargées : le socle Hermes et
  `bluevector-ftth-operations` ;
- projet actif relié au dépôt réel
  `C:\Users\Guest\Desktop\optmontana\bluevector-clean-upload` ;
- outils limités à terminal local, fichiers, compétence, petit plan et demande
  de clarification ; aucune navigation Web, génération, délégation, mémoire ou
  contrôle du PC ;
- mandat QA explicite : inspecter d'abord, préserver le worktree, tester par
  paliers, diagnostiquer avant retry et rester inactif entre les demandes ;
- règles runtime bloquant sans confirmation possible les resets/clean Git,
  changements de branche, push et suppressions de volumes Docker. Le contrôle
  confirme que `git status` est autorisé et `git reset --hard` refusé.

Ce profil est volontairement déclenché à la demande. Le prochain usage utile
sera un lot BlueVector borné (par exemple tests ciblés d'un changement ou audit
de non-régression), pas une boucle périodique sur un dépôt inchangé.

## 10. Évaluation CC Switch — ne pas installer maintenant

Décision : **WATCH / prototype isolé uniquement si un besoin concret apparaît**.
CC Switch apporte une interface locale crédible pour basculer des fournisseurs,
suivre l'usage, synchroniser sélectivement MCP/prompts/skills et gérer plusieurs
formats de configuration. Ses sauvegardes atomiques et ses tests de conservation
des blocs OAuth Hermes sont des idées utiles pour notre futur runtime.

Il recouvre toutefois presque entièrement des capacités déjà présentes dans
Hermes : profils, fournisseurs et fallback, MCP, skills, sessions, mémoire,
approbations et cron. L'ajouter maintenant créerait une seconde autorité capable
de réécrire `config.yaml`, les configurations Codex et des secrets, alors que le
profil `bluevector-qa` vient précisément d'être réduit et verrouillé.

Le document reçu n'est pas une description technique fiable à lui seul :

- le port proxy officiel documenté est 15721, pas 8118 ;
- les MCP sont activés application par application, pas exposés instantanément
  à toutes les CLI ;
- le gestionnaire de sessions lit les stockages existants des CLI ; aucune
  preuve officielle consultée ne garantit un index global chiffré de toutes les
  conversations interceptées ;
- l'intégration Hermes officielle reste volontairement légère et délègue la
  configuration approfondie à l'interface Hermes ;
- un failover transparent ne doit jamais rejouer aveuglément une action avec
  effets externes : l'idempotence et la réconciliation restent obligatoires ;
- les fonctions de reverse proxy OAuth portent des avertissements explicites de
  conformité et ne doivent pas être utilisées avec nos abonnements.

Un éventuel essai futur devra utiliser un profil jetable, sans clé principale,
sans OAuth reverse proxy, sans App Takeover, sans MCP d'écriture et avec diff
des configurations avant/après. Le seul motif raisonnable serait un besoin réel
d'interface multi-fournisseur ou de mesure d'usage que Hermes ne satisfait pas.

## 11. Checkpoint Personnel — garde de brouillon explicite

L'unique avertissement lint restant dans `PersonnelPage.jsx` masquait une
contrainte réelle : un rafraîchissement serveur ne doit jamais réinitialiser le
brouillon local ouvert avant que la détection de conflit ait arbitré la nouvelle
version. La dépendance React n'est plus omise implicitement. Une clé composée de
l'identifiant technicien et de la révision contrôle désormais explicitement les
seules transitions autorisées à réinitialiser le brouillon.

Ce changement conserve le flux `observer -> comparer -> signaler ou réviser ->
réinitialiser`, et nettoie aussi l'état local si la fiche sélectionnée disparaît
du résultat serveur. Validation du lot : lint sans erreur ni avertissement,
4/4 tests ciblés de brouillon/conflit réussis, build frontend de production
réussi. L'avertissement Rollup sur la taille du chunk AG Grid reste un sujet de
performance séparé ; il ne bloque pas ce checkpoint fonctionnel.

## 12. Premier exercice réel du profil Hermes `bluevector-qa`

Un alias local `bluevector-qa` donne désormais accès au profil sans modifier le
profil Hermes par défaut. Sa première mission a été limitée à une revue en
lecture seule de la garde de brouillon Personnel, avec 4 itérations et 180
secondes au maximum. Le profil a respecté le périmètre et n'a modifié aucun
fichier. Son inspection statique n'a trouvé ni écrasement du brouillon ni boucle
d'effet évidente.

Le résultat reste classé **LIMITED**, et non PASS : l'agent a épuisé son budget
sur plusieurs recherches regex mal échappées puis a lancé l'aide du lint au lieu
du lint réel. Les tests et le vrai lint avaient été exécutés avec succès par le
runtime principal, mais Hermes ne peut pas s'en attribuer la preuve. Son mandat
a donc été complété avec des règles PowerShell : recherche littérale par défaut,
repérage préalable du `package.json`, arrêt après deux erreurs de même classe et
réservation de la dernière itération à la validation demandée.

Le bandeau TUI a affiché des outils Kanban, mais les trois contrôles d'autorité
effective montrent qu'ils ne sont pas exposés au modèle : aucun toolset Kanban
dans le profil, aucune variable de worker Kanban, et garde runtime conditionnelle
dans le code Hermes. Ce décalage est traité comme un défaut d'affichage à revoir
après la future mise à jour Hermes, pas comme une raison d'élargir le profil.
