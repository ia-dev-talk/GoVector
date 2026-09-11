# BlueVector — Suivi recette finale

Branche de travail : `delivery/bluevector-final-chatgpt-20260910`

Ce fichier est la source de vérité de la recette visuelle et fonctionnelle avant livraison.

Légende :
- ✅ fait et vérifié visuellement
- 🧪 implémenté, à re-tester sur le vrai runtime local
- 🟠 présent mais incomplet / à améliorer
- 🔴 manquant ou incorrect
- ⏸️ volontairement différé

## Journal des checkpoints

### Checkpoint web W5 — 11/09 — 🧪

État local sur la branche `delivery/bluevector-final-chatgpt-20260910` :
- checkout synchronisé en avance rapide jusqu’au checkpoint GitHub `543b695d92c56a0a0a625e9ebceff9345da69c6e`, sans divergence ni écrasement local ;
- durée du wizard remplacée par une saisie explicite `HH h MM`, bornée de `00 h 15` à `08 h 00` ;
- stockage métier `estimated_duration` conservé en minutes et recalcul du créneau inchangé ;
- compteur d’affectation renommé en `X techniciens actifs` ;
- 282 tests frontend, lint et build de production passés localement.

Ce checkpoint reste 🧪 jusqu’à la recette visuelle du wizard dans le runtime Docker.

### Checkpoint web W4 — 10/09 soir — 🧪

État GitHub vérifié sur le commit `5080327baee39c53072f088d08090c7eb972ffc7` :
- workflow `BlueVector delivery validation` terminé avec tous les jobs au vert ;
- rapport journalier Magillan implémenté avec le logo fourni, route dédiée, action depuis Rapports et test de contrat ;
- page Agents terrain enrichie pour éviter une surface remplie de valeurs « Non renseigné » sans utilité ;
- couche de finition visuelle appliquée aux écrans visibles du pilote ;
- aucun merge vers `main`.

Ce checkpoint reste 🧪 : la CI valide le code, pas le rendu réel Docker/navigateur ni le PDF vu par l’utilisateur.

### Checkpoint web W3 — 10/09 soir — 🧪

Implémenté sur la branche, à vérifier au prochain sync sûr + rebuild :
- Stock pilote filtré sans destruction de données : seuls les articles correspondant à `FO16`, `FO64`, `FO96` peuvent remonter dans la vue.
- Les anciens articles synthétiques INWI/ORANGE/ONT restent en base mais sont exclus de l’interface de livraison.
- Header Stock simplifié : `Stock câbles`, périmètre FO16/FO64/FO96, recherche adaptée, suppression du registre SN de la surface pilote.
- Contrat de test ajouté pour verrouiller le périmètre FO16/FO64/FO96.
- Overrides visuels finaux ajoutés pour : largeur sidebar/branding, équilibre du header dashboard, largeur du wizard, progression 3 étapes non coupée, séparation nom/statut technicien, suppression de l’AM/PM WebKit sur le champ durée.

Ce checkpoint n’est pas marqué ✅ tant qu’il n’a pas été vu dans le navigateur local.

## 1. Tableau de bord Orienteur

Statut : 🧪 composant durée corrigé / 🟠 recette et champs complémentaires

Implémenté à re-tester :
- Réduction du poids visuel du titre « Voici votre activité du jour ».
- Plus d’espace utile pour recherche et CTA.
- Sidebar élargie en mode déployé pour éviter `BlueVecto…`.

Reste :
- Vérifier cohérence KPI ↔ liste interventions du jour.
- Vérifier l’affectation technicien : pas de `—` si une affectation existe.
- Vérifier carte et densité finale.

## 2. Interventions — liste / carte / activité

Statut : 🧪 / 🟠

Implémenté à re-tester :
- Le bandeau principal a été ramené vers le langage visuel clair commun au pilote.
- Les libellés techniques de configuration comme `RETARDS NON CONFIGURÉS` ne doivent plus être exposés sur la surface de livraison.

Reste :
- Revoir densité et lisibilité des KPI.
- Vérifier statuts/compteurs sur vraies données.
- Vérifier affectation technicien entre liste, dashboard et planning.
- Clarifier les onglets Liste / Carte / Activité.
- Vérifier le panneau Ressources terrain.

## 3. Création intervention — wizard

Statut : 🧪 / 🟠

Implémenté à re-tester :
- Progression 3 étapes redimensionnée pour éviter le clipping du cercle Affectation.
- Corps du modal nettoyé des artefacts de bordure.
- Nom et statut technicien forcés sur deux lignes distinctes.
- AM/PM masqué sur le champ durée pour les navigateurs WebKit/Chromium.
- Le moteur conserve `estimated_duration` en minutes et recalcule le créneau sans changer le contrat backend.
- Le contrôle natif ambigu a été remplacé par une saisie explicite `HH h MM`, bornée de `00 h 15` à `08 h 00`.
- Le compteur d’affectation indique maintenant `X techniciens actifs` au lieu de `X chargés`.

Reste prioritaire :
- Vérifier visuellement la saisie durée et le compteur sur le runtime Docker.
- Vérifier date et format français.
- Reprendre proprement les champs Praxedo utiles convenus : Agence, Groupe d’interventions, Description, Drapeaux, À faire avant/après, Donneur d’ordre, Client, Site, Équipement, Adresse, Code postal, Ville, Contact.
- Ne connecter un champ que s’il possède une donnée/route réellement persistée ; aucune fausse correspondance métier.
- Conserver `Création → Qualification → Affectation`.
- Conserver types/durées validés.
- Aucune compétence présélectionnée.
- Vérifier résumé final et création réelle.

## 4. Planning

Statut : ✅ base hebdomadaire visible / 🟠 finition

Fait et vu :
- Vue semaine.
- Semaine précédente / suivante.
- Aujourd’hui.
- Recherche.
- Filtre technicien.
- Bande Non affectées.
- Cartes d’interventions dans la grille semaine.

Reste :
- Afficher de vraies lignes/noms techniciens à gauche.
- En-têtes jours + dates nets.
- Réduire les grands espaces vides.
- Positionner clairement par technicien + jour + horaire.
- Ajouter légende types/statuts.
- Vérifier replanification.
- Plaques : créer, lier interventions, planifier et visualiser dans le planning.
- Drag/drop seulement si compatible avec le backend sans bricolage.

## 5. Agents terrain

Statut : 🧪 / 🟠

Implémenté à re-tester :
- Surface enrichie avec un résumé opérationnel au lieu d’une simple grille pauvre.
- Réduction des valeurs `Non renseigné` affichées sans action utile.
- Accès vers les techniciens conservé.
- Rôle Agent terrain conservé distinct du rôle Orienteur bureau.

Reste :
- Vérifier sur vraies données les rattachements équipe/secteur/techniciens.
- Donner un accès clair au détail de l’agent et à son équipe si le contrat API le permet proprement.
- Vérifier le rendu tablette après acceptation web desktop.

## 6. Techniciens

Statut : 🧪 / 🟠

Implémenté à re-tester :
- Header visible uniformisé vers `Techniciens` au lieu de `Personnel`.
- Contraste de certains textes faibles renforcé dans la couche de finition.

Reste :
- Corriger les métriques étranges type `INTERV. A:T 1:14 / 8:73` : format ou libellé métier exact.
- Vérifier Disponible / Déconnecté / Pause / Hors service.
- Vérifier détail Compétences / Équipement / Planning / Historique.
- Vérifier relation Orienteur ↔ Technicien.

## 7. Stock

Statut : 🧪 périmètre corrigé / 🟠 administration

Implémenté à re-tester :
- Vue de livraison limitée à `FO16`, `FO64`, `FO96`.
- Données synthétiques INWI/ORANGE/ONT exclues sans suppression de la base.
- Header explicite `Stock câbles`.
- Recherche orientée FO16/FO64/FO96.
- Registre SN masqué de la surface pilote.
- Test de régression du périmètre ajouté à `npm test`.

Reste :
- Vérifier si les 3 références existent réellement dans la base locale ; si absentes, ne pas inventer de quantités.
- Présentation simple : référence, libellé, quantité, disponible, réservé, seuil, localisation/détenteur.
- Conserver dotation technicien + traçabilité réelles.
- Admin : ajout / modification / désactivation/suppression contrôlée.
- Types de pose administrables :
  - Pose câble FO en conduite / sous PEHD
  - Pose câble FO en façade ou immeuble
  - Pose câble FO en aérien

## 8. Rapports — RAPPORT JOURNALIER Magillan

Statut : 🧪 implémenté / validation visuelle PDF requise

Référence obligatoire : `RAPPORT JOURNALIER(1).xlsx` fourni + logo Magillan fourni.

Implémenté :
- Renderer PDF spécifique `magillan_daily_report.py` séparé du rapport générique GoVector.
- Logo Magillan fourni intégré directement au document afin que le PDF reste autonome.
- Endpoint dédié `/api/v1/export/magillan-daily` rattaché au Centre d’Export.
- Action `Rapport Magillan` depuis la page Rapports en conservant le périmètre/filtres sélectionnés.
- Une page du modèle par intervention du périmètre ; page vide structurée si aucun dossier ne remonte.
- Structure métier reprise du modèle fourni : N° demande/N° rapport, Central, Client, Adresse, GPS, Splitter, PCO, Localité, Pose câble, Raccordement, Observation et Signatures.
- Les champs sans source autoritative restent vides : aucune équivalence inventée `PBO = PCO`, `port splitter = BR AFFECTÉE`, etc.
- Test de contrat dédié protégeant les libellés du modèle, le vrai logo et l’absence de ces fausses correspondances.
- Workflow GitHub vert sur le checkpoint `5080327b`.

Reste :
- Ouvrir le PDF généré depuis le runtime local et comparer visuellement au fichier source.
- Vérifier nombre de pages et comportement avec plusieurs interventions réelles.
- Vérifier les filtres jour/secteur/technicien/opérateur sur données locales.
- Ne renseigner Central GPS, PCO, BR affectée, type/n°/départ/arrivée câble, type de pose et signatures que lorsqu’une source autoritative existe réellement.
- Décider seulement après recette si un export Excel fidèle est nécessaire en plus du PDF.

## 9. Paramètres administrateur

Statut : 🟠 backend/catalogue présent / 🔴 couverture complète

Déjà présent dans le référentiel métier :
- Types d’interventions.
- Priorités.
- Statuts d’affichage.
- Actions terrain.
- Types de pose.
- Types de câble.
- Compétences technicien.
- Indicateurs Orienteur.
- Ajout / modification / activation-désactivation ; suppression des lignes métier personnalisées sous contrôle du backend.

Reste à rendre simple et visible sans exposer la complexité interne :
- Types d’activités.
- Types de créneaux.
- Types de sites.
- Types d’équipements.
- Formulaires.
- Listes de références.
- Champs personnalisés.
- Scénarios de notification.
- Types de notes.
- Groupes d’interventions.

## 10. Champs personnalisés / formulaires dynamiques

Statut : 🟠 moteur présent / 🔴 administration complète

À faire :
- Conserver les formulaires conditionnels par activité.
- Admin : type, libellé, obligatoire, rattachement activité/formulaire, ordre, actif/inactif.
- Listes de références associées.
- `Étiquetage PCO` = texte, jamais photo.

## 11. Scénarios de notification

Statut : 🔴

À faire dans l’esprit de la capture Praxedo fournie :
- CRUD scénario.
- Nom, agence, déclencheur, drapeaux/conditions.
- E-mail : De / À / Cc / Cci / Objet / Message.
- Compte rendu joint, nom fichier, format.
- Association aux types d’intervention.

## 12. Plaques

Statut : 🔴

À faire :
- Créer / modifier / supprimer une plaque.
- Lier / retirer plusieurs interventions.
- Planifier une plaque.
- La visualiser avec ses interventions dans le planning.

## 13. Design system / cohérence globale

Statut : 🧪 / 🟠

Implémenté à re-tester :
- Nouvelle couche `delivery-final-fixes.css` chargée après la couche pilote afin de corriger les défauts constatés sans réécrire les anciens écrans.
- Interventions, Agents terrain, Techniciens, wizard, sidebar et dashboard ont reçu des corrections ciblées de livraison.

Reste :
- Unifier définitivement dashboard / interventions / planning / techniciens / stock / rapports après la prochaine recette visuelle.
- Corriger les zones sombres isolées restantes.
- Uniformiser titres, cartes, boutons, champs, espacements, badges et tableaux.
- Zéro texte coupé, débordement ou concaténation.

## 14. Mobile — après acceptation web

Statut : ⏸️ volontairement différé

Après acceptation web :
- Technicien : re-test complet checkpoint A.
- Agent terrain : checkpoint B complet.
- Formulaires dynamiques.
- Photos caméra + GPS/heure/accuracy.
- Galerie sans faux GPS.
- Offline / outbox / sync.
- Étiquetage PCO texte.
- APK avec vraie URL backend.

## 15. Gate finale avant livraison

Statut : 🧪

Déjà vérifié sur le checkpoint GitHub `5080327b` :
- workflow `BlueVector delivery validation` entièrement vert.

À vérifier sur le runtime final après les prochains correctifs :
- `git diff --check`
- mojibake / UTF-8
- frontend lint + tests + build
- backend tests
- PostgreSQL / migrations
- Docker `/health`
- génération et ouverture du rapport Magillan
- Flutter analyze + tests
- APK release vraie URL
- test PC
- test téléphone
- test terrain

Aucun merge vers `main` avant validation finale explicite.
