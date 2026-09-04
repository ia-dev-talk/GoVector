# Corpus documentaire et formation BlueVector V1

## Objectif

La V1 n'est livrable que si un administrateur, un orienteur et un technicien
peuvent l'utiliser, et si une autre personne peut l'exploiter ou la restaurer
sans dépendre de la mémoire de l'équipe projet.

Tous les documents doivent :

- décrire le comportement réellement vérifié ;
- distinguer V1, option et roadmap ;
- utiliser les mêmes termes et statuts que l'API ;
- montrer des données fictives, jamais des secrets ou clients réels ;
- porter version, date, public, propriétaire et date de prochaine revue ;
- être validés sur PC et téléphone quand ils décrivent une interface.

## Livrables

| Lot | Document | Public | Format final | État |
|---|---|---|---|---|
| Produit | présentation BlueVector V1 | direction, client | PPTX + PDF | à rédiger après gel UI |
| Produit | fiche synthèse capacités/limites | client, vente | PDF | à rédiger |
| Produit | glossaire FTTH et BlueVector | tous | Markdown + PDF | socle existant à enrichir |
| Utilisateur | guide administrateur | administrateur | DOCX + PDF | à rédiger |
| Utilisateur | guide orienteur/dispatch | exploitation | DOCX + PDF | à rédiger |
| Utilisateur | guide technicien mobile | technicien | DOCX + PDF court | à rédiger après audit mobile |
| Utilisateur | guide portail client | donneur d'ordre | DOCX + PDF | à rédiger |
| GIS | guide import, édition et export KML/KMZ | administrateur GIS | DOCX + PDF | après implémentation |
| Formation | support formateur | formateur | PPTX + PDF | à rédiger |
| Formation | exercices et grille d'évaluation | apprenants | DOCX + PDF | à rédiger |
| Technique | architecture et flux de données | IT/sécurité | Markdown + PDF | première version rédigée |
| Technique | installation local/staging/production | exploitation | Markdown + PDF | à rédiger après cible cloud |
| Technique | configuration et secrets | exploitation | Markdown | à rédiger sans valeur secrète |
| Technique | sauvegarde/restauration | exploitation | Markdown + fiche réflexe | socle existant, exercice requis |
| Technique | supervision et incidents | support | Markdown + PDF | à rédiger |
| Sécurité | dossier contrôles ASVS/MASVS | sécurité | table de preuves | à produire pendant l'audit |
| Release | notes de version et matrice de validation | tous | Markdown + PDF | à finaliser sur candidat |

## Parcours de formation

### Module 1 — Comprendre BlueVector, 45 minutes

- ordre de travail, passage, affectation, site et preuve ;
- chaîne FTTH NRO/SRO-PM/PBO/PTO et équipements ;
- responsabilités bureau/terrain/client ;
- donnée préparée, observée et résolue.

Validation : reconnaître les objets d'un cas d'intervention et leur provenance.

### Module 2 — Piloter sur le dashboard, 90 minutes

- Cockpit, Supervision, Carte live et Interventions ;
- affectation/réaffectation et créneaux ;
- Personnel, Secteurs, Stocks et Rapports ;
- recherche, filtres, vues et paramètres ;
- gestion des erreurs et escalade.

Exercice : préparer, affecter, suivre puis contrôler une intervention.

### Module 3 — Travailler sur téléphone, 90 minutes

- connexion et session ;
- liste, fiche, navigation et actions terrain ;
- photos, mesures, scans, commentaires et annotations ;
- arrivée, travaux, échec/report, clôture et validation ;
- mode hors ligne, outbox et reconnexion ;
- confidentialité, GPS et changement d'utilisateur.

Exercice : exécuter un passage complet, perdre le réseau puis synchroniser sans
doublon.

### Module 4 — KML/KMZ, 60 minutes

- déposer, contrôler et comprendre un fichier ;
- mapper dossiers, attributs et types d'actif ;
- prévisualiser et résoudre un conflit ;
- publier, personnaliser, archiver, restaurer et exporter ;
- proposer une correction terrain.

Exercice : publier une plaque contenant un polygone, un câble et trois points,
puis relier un PBO après validation.

### Module 5 — Administrer et exploiter, 90 minutes

- utilisateurs, rôles, organisations et catalogues ;
- environnements, domaine, certificats et secrets ;
- sauvegarde, restauration et rollback ;
- journaux, métriques, alertes et incident ;
- règles de sécurité et de confidentialité.

Exercice : restaurer une copie isolée et produire les preuves de validation.

## Méthode de production

1. geler le contrat et les parcours V1 ;
2. capturer les écrans réels avec données fictives ;
3. rédiger les guides depuis les scénarios d'acceptation automatisés/manuels ;
4. faire exécuter chaque procédure par une personne qui ne l'a pas écrite ;
5. corriger le produit si la documentation devient inutilement complexe ;
6. générer DOCX/PDF/PPTX, vérifier visuellement chaque page/diapositive ;
7. publier avec version et date alignées sur le candidat V1.

## Definition of done documentaire

- chaque rôle possède un démarrage rapide et un guide complet ;
- chaque action critique contient prérequis, résultat attendu et récupération ;
- les captures correspondent au candidat V1 ;
- aucun écran, bouton, chiffre ou intégration fictif n'est présenté comme livré ;
- les procédures installation, sauvegarde, restauration et incident sont testées ;
- les liens internes fonctionnent et les PDF sont lisibles sur téléphone ;
- une feuille de présence et une grille de validation formation existent ;
- la date de revue est assignée pour l'après-V1.
