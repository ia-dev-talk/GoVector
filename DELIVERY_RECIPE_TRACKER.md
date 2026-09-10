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

### Checkpoint web W3 — 10/09 soir — 🧪

Implémenté sur la branche, à vérifier au prochain `git pull` + rebuild :
- Stock pilote filtré sans destruction de données : seuls les articles correspondant à `FO16`, `FO64`, `FO96` peuvent remonter dans la vue.
- Les anciens articles synthétiques INWI/ORANGE/ONT restent en base mais sont exclus de l’interface de livraison.
- Header Stock simplifié : `Stock câbles`, périmètre FO16/FO64/FO96, recherche adaptée, suppression du registre SN de la surface pilote.
- Contrat de test ajouté pour verrouiller le périmètre FO16/FO64/FO96.
- Overrides visuels finaux ajoutés pour : largeur sidebar/branding, équilibre du header dashboard, largeur du wizard, progression 3 étapes non coupée, séparation nom/statut technicien, suppression de l’AM/PM WebKit sur le champ durée.

Ce checkpoint n’est pas marqué ✅ tant qu’il n’a pas été vu dans le navigateur local.

## 1. Tableau de bord Orienteur

Statut : 🧪 / 🟠

Implémenté à re-tester :
- Réduction du poids visuel du titre « Voici votre activité du jour ».
- Plus d’espace utile pour recherche et CTA.
- Sidebar élargie en mode déployé pour éviter `BlueVecto…`.

Reste :
- Vérifier cohérence KPI ↔ liste interventions du jour.
- Vérifier l’affectation technicien : pas de `—` si une affectation existe.
- Vérifier carte et densité finale.

## 2. Interventions — liste / carte / activité

Statut : 🟠

À faire :
- Harmoniser le bandeau sombre avec le langage visuel clair global.
- Revoir densité et lisibilité des KPI.
- Retirer les libellés techniques visibles comme `RETARDS NON CONFIGURÉS`.
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

Reste :
- Remplacer définitivement le contrôle de durée de type horloge par un vrai composant durée `HH h MM` si le test local reste ambigu.
- Corriger/renommer `4 chargés` selon la vraie signification métier.
- Vérifier date et format français.
- Reprendre proprement les champs Praxedo utiles convenus : Agence, Groupe d’interventions, Description, Drapeaux, À faire avant/après, Donneur d’ordre, Client, Site, Équipement, Adresse, Code postal, Ville, Contact.
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

Statut : 🟠

À faire :
- Enrichir la page trop basique actuelle.
- N’afficher équipe/secteur/charge que si les données sont réellement disponibles.
- Éviter les cartes remplies de `Non renseigné` sans action utile.
- Donner un accès clair au détail de l’agent et à son équipe.
- Conserver le rôle Agent terrain distinct.

## 6. Techniciens

Statut : 🟠

À faire :
- Uniformiser `Techniciens` au lieu de header `Personnel` pour cette surface.
- Améliorer contraste et taille des textes faibles.
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

Statut : 🔴

Référence obligatoire : `RAPPORT JOURNALIER(1).xlsx` fourni + logo Magillan fourni.

À faire :
- Remplacer le rapport générique comme livrable principal par un profil `RAPPORT JOURNALIER Magillan`.
- Intégrer le logo Magillan.
- Respecter la structure exacte du fichier source ; ne pas inventer de sections.
- Champs déjà identifiés : N° demande/N° rapport, Central, Client, Adresse, GPS, Splitter, PCO, Localité, Pose câble, Raccordement, Observation, Signatures.
- Laisser proprement vide toute donnée non disponible au lieu de fabriquer une valeur.
- Prévoir PDF et/ou Excel fidèle au modèle source.

## 9. Paramètres administrateur

Statut : 🔴 / backend partiel

À rendre simple et visible :
- Types d’activités.
- Types de créneaux.
- Types de sites.
- Types d’équipements.
- Indicateurs.
- Compétences technicien.
- Formulaires.
- Listes de références.
- Champs personnalisés.
- Types d’interventions.
- Scénarios de notification.
- Types de notes.
- Groupes d’interventions.
- Types de pose.

Règle : ajouter / modifier / désactiver ou supprimer sans exposer la complexité interne.

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

Reste :
- Unifier dashboard / interventions / planning / techniciens / stock / rapports.
- Corriger les zones sombres isolées.
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

Après corrections visibles :
- `git diff --check`
- mojibake / UTF-8
- frontend lint + tests + build
- backend tests
- PostgreSQL / migrations
- Docker `/health`
- rapport Magillan
- Flutter analyze + tests
- APK release vraie URL
- test PC
- test téléphone
- test terrain

Aucun merge vers `main` avant validation finale explicite.
