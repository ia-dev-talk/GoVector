# Import adaptatif Excel et CSV

L’import BlueVector accepte des classeurs dont la structure varie sans supposer
qu’une valeur absente existe. Il prépare une prévisualisation; seul l’utilisateur
confirme ensuite les interventions valides.

## Contrat V1

- Formats acceptés : `xlsx`, `xlsm` et `csv`.
- Les CSV UTF-8 et Windows CP-1252 sont lus; les séparateurs virgule,
  point-virgule, tabulation et barre verticale sont détectés.
- Chaque feuille est analysée sur ses 25 premières lignes afin de proposer la
  ligne d’en-tête la plus probable.
- L’interface affiche jusqu’à quinze lignes candidates et permet à
  l’administrateur de confirmer une autre ligne.
- Chaque colonne est associée à un champ canonique avec sa méthode de détection.
- Les libellés proposés par l’interface proviennent du contrat backend, pas
  d’une seconde liste métier recopiée dans React.
- Une correction manuelle est prioritaire sur les alias opérateur et génériques.
- Une colonne peut être explicitement ignorée.
- Deux colonnes visant le même champ sont signalées; une seule n’est jamais
  retenue silencieusement.
- Les corrections sont cloisonnées par fichier. Deux fichiers utilisant le même
  mot, par exemple `CLIENT`, peuvent donc recevoir des mappings différents.
- Les dates Excel sont acceptées sous forme de cellule date, de numéro de série
  Excel ou de texte usuel. `DATE` alimente le planning; `DATE D’ACTION` reste
  visible comme colonne non mappée et ne peut pas voler la date planifiée. Un
  administrateur peut l’associer explicitement à `DATE` si le contrat du
  donneur d’ordre lui donne réellement cette signification.
- Après confirmation, l’API retourne le nombre de dossiers par journée et le
  nombre de dossiers sans date. Le web ouvre la première journée réellement
  importée au lieu de rester silencieusement sur la journée courante.
- Un doublon ignoré n’est pas présenté comme une création. L’interface reste
  ouverte et propose le mode de mise à jour pour compléter le dossier existant.
- `TECHNICIEN`, `TECH CB`, `TECH RAC` et `TECH CABLE` décrivent la source
  historique du fichier. Ces valeurs sont conservées dans
  `operational_data` et ne créent ni ne modifient une affectation GoVector.
- Une référence et un type d’intervention reconnus sont obligatoires. Aucun
  type `INSTALLATION` ni aucune compétence ne sont injectés lorsque le fichier
  ou un profil explicitement configuré ne les fournit pas.
- L’idempotence sur `job_number` est imposée par le backend dans les trois
  modes : création (doublon ignoré), mise à jour ou ignore.

## Séquence de traitement

```text
fichier brut
→ lecture des feuilles/lignes
→ détection opérateur indicative
→ proposition de ligne d’en-tête
→ mapping automatique des colonnes
→ corrections humaines éventuelles
→ nouvelle prévisualisation
→ validation des lignes
→ confirmation explicite
```

La prévisualisation conserve le numéro physique de la ligne source. Le géocodage
reste indépendant du mapping : une adresse non résolue conserve son texte et des
coordonnées `null`.

## Profils réutilisables

Les associations de colonnes et les lignes d’en-tête confirmées peuvent être
enregistrées dans un profil versionné. Un profil reste révisable et audité; une
modification concurrente produit un conflit explicite plutôt qu’un écrasement.

## Limites assumées

- Les anciens fichiers binaires `.xls` doivent être enregistrés en `.xlsx` ou
  `.csv`; l’interface ne prétend pas les accepter.
- BlueVector ne déduit pas une donnée métier depuis une colonne ambiguë. Une
  association de faible confiance doit être vérifiée par l’utilisateur.
- Les colonnes sans destination canonique restent visibles comme non reconnues.
  Elles ne sont jamais injectées arbitrairement dans les commentaires; leur
  conservation structurée par ligne source reste une évolution distincte.
