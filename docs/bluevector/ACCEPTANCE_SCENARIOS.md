# Scénarios d’acceptation V1

Ces scénarios guident les tests manuels et contractuels. Une donnée non fournie doit toujours rester absente.

## A. Dossier incomplet puis enrichi

1. Importer/créer un job avec seulement activité et adresse partielle.
2. Vérifier qu’aucun client, GPS, PTO ou équipement fictif n’apparaît.
3. L’orienteur ajoute plus tard client, secteur, plan et commentaire.
4. Le technicien retrouve ces éléments sans réinstallation ni recréation du job.

## B. Géolocalisation bout en bout — scénario prioritaire

1. Créer un job avec adresse seule.
2. Le géocodage échoue : les coordonnées restent `null`; ou réussit : l’orienteur confirme la position planifiée.
3. Affecter le job; le technicien voit adresse/repère planifié et ouvre la navigation.
4. Démarrer : le GPS live apparaît en supervision, avec heure et précision, sans modifier le job.
5. Arriver puis enregistrer explicitement la position exacte du site.
6. Enregistrer éventuellement entrée et sortie câble comme points séparés.
7. Synchroniser hors ligne/en ligne plusieurs fois : aucune duplication.
8. Le frontend affiche l’ensemble du dossier terrain avec auteurs, dates, médias et positions.
9. Créer un second job réellement lié au même site : le prochain technicien voit le repère du passage précédent avec provenance et confiance.

## C. Parcours nominal sans preuves obligatoires

Effectuer toutes les transitions puis clôturer sans photo, mesure, câble ni signature. Le job passe en attente de validation. Ajouter ensuite une photo/commentaire reste possible selon la politique produit; rien n’est fabriqué.

## D. Échec puis reprise

Le technicien A déclare un échec avec motif. Le job quitte « En cours » et reste consultable dans l’historique. Après replanification, le technicien B doit voir le motif et les preuves de A. Ce scénario n’est pleinement conforme qu’après `JobVisit` et affectations historiques.

## E. Capture libre contextuelle

Depuis `+`, sélectionner explicitement une intervention active, puis ajouter photo, document, commentaire, mesure, incident, matériel déclaré, GPS ou scan. Aucun quota arbitraire. Les erreurs média restent visibles et retentables.

## F. Cloisonnement des comptes

- Le technicien B ne lit ni cache ni job de A.
- Le client IAM ne lit que les jobs de son organisation et ne peut rien modifier.
- Un orienteur ne modifie pas un dossier hors de son périmètre.
- Un payload ne peut jamais choisir `user_id`, `technician_id`, `issued_by` ou équivalent pour usurper l’acteur.

## G. Import Excel variable

Importer deux fichiers aux entêtes différents. L’utilisateur mappe explicitement les colonnes, prévisualise erreurs/avertissements, puis confirme. Les champs non reconnus sont signalés; aucune donnée acceptée n’est silencieusement perdue.

## H. Rejeu réseau

Couper le réseau après upload média ou après traitement serveur mais avant ACK. Au retour, le même UUID/hash est rejoué : un seul média et une seule action métier existent.
