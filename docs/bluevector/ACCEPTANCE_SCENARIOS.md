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

Le technicien A déclare un échec avec motif. Le passage 1 est clôturé et reste consultable avec son affectation et ses preuves. Après replanification, le technicien B reçoit le passage 2 et peut consulter le motif et les preuves de A sans devenir artificiellement l’auteur du premier passage.

## E. Capture libre contextuelle

Depuis `+`, sélectionner explicitement une intervention active, puis ajouter photo, document, commentaire, mesure, incident, matériel déclaré, GPS ou scan. Aucun quota arbitraire. Les erreurs média restent visibles et retentables.

## F. Cloisonnement des comptes

- Le technicien B ne lit ni cache ni job de A.
- Le client IAM ne lit que les jobs de son organisation et ne peut rien modifier.
- Un orienteur ne modifie pas un dossier hors de son périmètre.
- Un payload ne peut jamais choisir `user_id`, `technician_id`, `issued_by` ou équivalent pour usurper l’acteur.

## G. Import Excel variable

Importer deux fichiers aux entêtes différents. L’utilisateur mappe explicitement les colonnes, prévisualise erreurs/avertissements, puis confirme. Les champs non reconnus sont signalés; aucune donnée acceptée n’est silencieusement perdue.

Le scénario couvre aussi une ligne d’en-tête précédée d’un titre opérateur, un
CSV à séparateur point-virgule, deux fichiers où un même libellé doit être mappé
différemment et une colonne explicitement ignorée. Les numéros de lignes affichés
doivent rester ceux du fichier physique.

## H. Rejeu réseau

Couper le réseau après upload média ou après traitement serveur mais avant ACK. Au retour, le même UUID/hash est rejoué : un seul média et une seule action métier existent.

## I. Correction illustrée après passage

1. Le bureau partage un plan ou une photo dans une instruction ou une demande de correction.
2. Le technicien ouvre la pièce, dessine un repère puis répond depuis le dossier, y compris après un statut terminal.
3. Couper le réseau pendant la réponse : l’annotation reste dans l’outbox et repart sans duplication.
4. Le frontend affiche le message, la version annotée, son auteur et son origine.
5. Vérifier que la pièce initiale est toujours consultable et que `Job.status` n’a pas changé.
