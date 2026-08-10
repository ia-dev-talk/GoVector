# GPS live — finalité, accès et conservation

## Finalité produit

Le GPS live sert exclusivement à conduire une intervention terrain : positionner
le technicien pendant un passage actif, estimer son arrivée, assister la
supervision et attribuer une observation de site. Il ne doit pas devenir un
outil de suivi permanent hors intervention.

BlueVector distingue trois vérités :

- `Job.latitude/longitude` : position préparée du dossier ;
- `Technician.current_*` et `GPSHistory` : télémétrie live attribuée au
  technicien et, si possible, au job actif ;
- `JobSiteObservation` : position de site confirmée volontairement sur le
  terrain.

Un point live ne remplace jamais automatiquement la position préparée ou la
position de site confirmée.

## Garanties déjà exécutées

- le mobile démarre le flux uniquement lorsqu'une intervention terrain est
  active et l'arrête lorsque cette visite n'est plus active ;
- Android affiche une notification persistante pendant le suivi ;
- l'identité technicien provient du JWT et non du payload ;
- le `job_id` doit appartenir au technicien ;
- une correction tardive ne peut pas faire reculer la position live courante ;
- vitesse, précision et batterie absentes restent `null` ;
- l'historique brut n'est lisible que par les rôles de supervision autorisés ;
- la purge quotidienne utilise `gps_history_retention_days` lorsque
  l'administrateur l'a explicitement configuré ; elle supprime les points
  bruts expirés et efface le dernier snapshot live devenu ancien.

## Décisions obligatoires avant production

L'entreprise responsable du traitement doit documenter et faire valider :

1. la finalité exacte du suivi et les catégories de personnes concernées ;
2. les destinataires et rôles habilités à voir le live et l'historique ;
3. la durée de conservation justifiée des points GPS bruts ;
4. l'information remise aux techniciens, le canal d'exercice de leurs droits
   et la version de cette information ;
5. la formalité CNDP applicable et, le cas échéant, les transferts ou
   sous-traitants ;
6. les règles d'usage hors horaires, pause, absence de mission et téléphone
   personnel.

BlueVector n'impose volontairement aucune durée par défaut. Une valeur absente
signifie **décision de conformité manquante**, pas conservation illimitée. Le
paramètre accepte de 1 à 3650 jours et la purge porte uniquement sur les points
bruts `GPSHistory`; les observations de site confirmées restent des preuves
métier distinctes.

## Contrôle avant pilote externe

- [ ] information technicien relue et remise ;
- [ ] finalité et accès approuvés ;
- [ ] `gps_history_retention_days` configuré dans Paramètres → Exploitation ;
- [ ] test Android écran allumé, verrouillé et application en arrière-plan ;
- [ ] vérification que le suivi s'arrête à la fin, l'échec ou le report ;
- [ ] vérification que le portail client n'expose pas la trajectoire interne ;
- [ ] procédure de purge et de réponse à une demande d'accès testée.

## Références de conformité

La CNDP rappelle les principes de finalité précise et communiquée,
proportionnalité, qualité, sécurité et durée limitée au temps nécessaire. Elle
indique également que les traitements relevant de la loi 09-08 doivent faire
l'objet de la formalité appropriée, sauf exception. La durée exacte doit donc
être justifiée par le responsable du traitement : elle ne peut pas être
inventée par le logiciel.

- [CNDP — conditions et principes applicables](https://www.cndp.ma/conditions/)
- [CNDP — notifier un traitement](https://www.cndp.ma/notifier-un-traitement/)
