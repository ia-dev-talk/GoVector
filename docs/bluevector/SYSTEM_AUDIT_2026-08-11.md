# Audit système BlueVector — 11 août 2026

## Objet

Cet audit distingue le produit réellement raccordé des ambitions futures. Il couvre API, PostgreSQL, Web, Mobile, import, géolocalisation, collaboration et administration. Une fonctionnalité n’est considérée livrée que si elle possède persistance, autorisation, contrat, interface et test de régression.

## Niveau actuel

| Domaine | Niveau | Réalité vérifiable | Écart principal |
|---|---|---|---|
| Workflow terrain | solide pilote | moteur backend, commandes par rôle, clôture et validation | règles avancées par client/opérateur |
| Synchronisation Mobile | solide pilote | outbox propriétaire, idempotence, ACK individuel, médias durables | observabilité et purge/réconciliation à grande échelle |
| Collaboration bureau-terrain | solide pilote | messages structurés, pièces jointes, accusés, compléments post-visite | notifications push et annotations vectorielles collaboratives |
| Géolocalisation | solide pilote | planned/live/observed/resolved séparés, provenance, conflits et fusion manuelle auditée | politique juridique de production et supervision des fournisseurs |
| Administration | solide pilote | comptes liés aux profils, catalogues gouvernés, journal append-only sans secrets et identité produit cohérente | sessions, MFA/SSO et délégations fines |
| Historique | intermédiaire avancé | visites, affectations append-only, journal, actions, médias | backfill métier à auditer et stock entièrement rattaché aux visites |
| Import adaptatif | solide pilote | détection d’en-têtes, mapping corrigible, profils réutilisables versionnés, confirmation et audit | métriques qualité par profil et reprise massive |
| Portail client | solide pilote | périmètre strict en lecture seule, KPI canoniques, filtres, carte planifiée et positions terrain fraîches minimales | SLA contractuels et exports client dédiés |
| Exploitation | pilote documenté | garde-fous staging/production, sauvegarde DB/médias avec manifeste, restauration DB avec confirmation | test de restauration réel, stockage objet, secrets managés et observabilité |
| Rapports | intermédiaire | indicateurs et exports existants | définitions KPI partagées, vues par visite/site/client et tests contractuels |
| Intégrations | cadré seulement | frontières documentées | aucun adaptateur Praxedo/QField de production |

## Vérités de domaine à préserver

1. `Job` est l’ordre stable ; `JobVisit` est une tentative terrain.
2. Une affectation historique n’est jamais supprimée pour simplifier l’état courant.
3. Une donnée inconnue reste `null`.
4. Une observation terrain ne remplace pas silencieusement une donnée préparée.
5. L’adresse, la position planifiée, le GPS live et le point confirmé sont des faits différents.
6. Un job interrompu peut fermer une visite sans fermer définitivement l’ordre.
7. Le backend décide des permissions, commandes et contraintes ; les interfaces présentent ces décisions.
8. Une action capturée offline avant un changement de configuration reste synchronisable.

## Audit UX

### Points forts

- Le Mobile V2 privilégie une action primaire par état et une capture libre sans quota arbitraire.
- La fiche intervention Web rassemble contexte, preuves, échanges et validation.
- Les erreurs de géocodage n’inventent plus de coordonnées et offrent une confirmation humaine.
- Les états terminaux quittent correctement l’écran « En cours ».
- Le portail client distingue ordre ouvert, passage actif et attente de validation,
  puis limite strictement les positions terrain à son organisation.
- L'import peut mémoriser une structure de fichier validée sans transformer une
  colonne inconnue par supposition.

### Frictions restantes

- Plusieurs écrans Web anciens coexistent avec les espaces V3 et utilisent encore des composants volumineux.
- Les états chargement/vide/erreur ne partagent pas encore un composant universel.
- Le catalogue métier et les profils d'import sont versionnés, mais les formulaires
  spécifiques par donneur d’ordre ne le sont pas encore.
- L’action Mobile doit mettre en cache la dernière configuration pour éviter toute attente réseau perceptible.
- La recherche transversale n’existe pas encore au niveau plateforme.
- Le bundle AG Grid reste lourd et doit être chargé uniquement dans les pages qui l’utilisent.

## Risques avant bêta publique

### Bloquants

- Formaliser la signature Android/iOS de production pour l’identité `dev.bigdataai.bluevector`.
- Choisir un stockage objet et exécuter un test de restauration sur copie isolée;
  la procédure et les scripts pilotes existent désormais mais n'ont pas été testés
  dans cet environnement sans Docker/PowerShell.
- Configurer secrets, rotation, TLS, CORS, limites d’upload et supervision d’erreurs.
- Valider juridiquement la collecte GPS, l’information des techniciens et la rétention.
- Tester les migrations sur copie anonymisée d’une base réelle et réaliser un test de restauration.

### Importants

- MFA/SSO, révocation de sessions et délégations administratives fines.
- Stratégie éventuelle de défusion; la fusion manuelle conserve déjà source,
  préflight, révisions, snapshot et trace immutable mais ne se renverse pas seule.
- Définitions KPI canoniques par ordre/visite/site et contrat client.
- Notifications ciblées avec anti-spam, accusé et escalade.
- Tests E2E Web/Mobile sur un scénario complet multi-visites et réaffectation offline.

## Séquence recommandée

1. **Bêta interne** : exécuter sauvegarde/restauration, scénario E2E Docker/téléphone,
   signature Android, rétention GPS et revue juridique.
2. **Bêta client** : SLA/KPI contractuels, notifications, object storage, audit de sécurité.
3. **Production** : observabilité, SLA, haute disponibilité, intégrations externes sur sandbox puis canary.

## Critère « meilleur du marché »

Ce résultat ne se mesure pas au nombre d’écrans. BlueVector doit réduire le temps entre information bureau et décision terrain, conserver la preuve et sa provenance, fonctionner hors ligne, expliquer chaque conflit et adapter son vocabulaire sans fragiliser les données. Toute évolution qui contredit ces objectifs doit être refusée même si elle paraît visuellement séduisante.
