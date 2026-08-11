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

## Limites assumées

- Les anciens fichiers binaires `.xls` doivent être enregistrés en `.xlsx` ou
  `.csv`; l’interface ne prétend pas les accepter.
- Les mappings sont appliqués à la prévisualisation courante. La gestion de
  modèles persistants par donneur d’ordre/opérateur viendra après validation des
  formats réels reçus.
- BlueVector ne déduit pas une donnée métier depuis une colonne ambiguë. Une
  association de faible confiance doit être vérifiée par l’utilisateur.
