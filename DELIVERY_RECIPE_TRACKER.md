# BlueVector — Suivi recette finale

Branche de travail : `delivery/bluevector-final-chatgpt-20260910`

Dernier head distant vérifié avant création de ce fichier : `4fc85af284e918b00a8cf2e87c8464a8acaea5cb`.

Ce fichier est la source de suivi de la recette visuelle et fonctionnelle avant livraison. Chaque checkpoint doit mettre à jour les statuts ci-dessous.

Légende :
- ✅ Fait et visible
- 🟠 Présent mais à corriger / améliorer
- 🔴 Manquant ou incorrect
- 🧪 À tester après correction

## 1. Tableau de bord Orienteur

Statut : 🟠

À corriger / améliorer :
- Rééquilibrer le header : le bloc « Voici votre activité du jour » prend trop de place par rapport à la recherche et au CTA.
- Vérifier la largeur du branding dans la sidebar : aucun texte tronqué (« BlueVecto… »).
- Harmoniser tailles, densité et alignements des KPI.
- Vérifier la cohérence des données affichées entre KPI et liste des interventions du jour.
- Rendre la zone carte plus nette et cohérente avec le reste du design.
- Conserver le design clair validé, sans revenir au vieux cockpit sombre.

## 2. Interventions — liste / carte / activité

Statut : 🟠

À corriger / améliorer :
- Harmoniser le bandeau sombre actuel avec le design clair global ou le rendre volontairement cohérent avec le dashboard.
- Revoir la densité des KPI : trop petits / trop vides visuellement.
- Corriger les libellés et compteurs techniques qui ne doivent pas être visibles (« retards non configurés », etc.).
- Vérifier les statuts et compteurs avec les vraies données.
- Vérifier l’affectation technicien dans la liste : le dashboard ne doit pas afficher « — » si une affectation existe réellement.
- Garder Liste / Carte / Activité mais clarifier l’état actif et la lisibilité.
- Vérifier le panneau ressources terrain et ses statuts.

## 3. Création intervention — wizard

Statut : 🟠

À corriger / améliorer :
- Corriger le clipping du 3e cercle / étape « Affectation » à droite.
- Supprimer toute ligne/bordure parasite lors du scroll du modal.
- Corriger la durée prévue : ne pas afficher une durée métier comme une heure AM/PM (« 01:00 AM »). Afficher une vraie durée claire (ex. `01 h 00`).
- Corriger les concaténations visibles : ex. `Amine BenaliDéconnecté` doit avoir un espacement et une hiérarchie visuelle corrects.
- Corriger le libellé `4 chargés` si ce compteur ne représente pas réellement la charge.
- Vérifier la date et son format français.
- Reprendre les champs Praxedo utiles convenus : Agence, Groupe d’interventions, Description, Drapeaux, À faire avant/après, Donneur d’ordre, Client, Site, Équipement, Adresse, Code postal, Ville, Contact — en gardant une UX simplifiée.
- Conserver le flux `Création → Qualification → Affectation`.
- Conserver les types d’intervention et durées validés.
- Aucune compétence présélectionnée.
- Vérifier le résumé final avant création.

## 4. Planning

Statut : ✅ base hebdomadaire visible / 🟠 finition

Fait :
- Vue semaine.
- Navigation semaine précédente / suivante.
- Aujourd’hui.
- Recherche.
- Filtre technicien.
- Bande « Non affectées ».
- Cartes d’interventions sur une grille semaine.

À corriger / améliorer :
- Afficher clairement les noms / lignes des techniciens comme vraies ressources à gauche.
- Afficher les jours et dates de façon nette dans l’en-tête de la grille.
- Ajuster la hauteur de la grille et éviter les grands espaces vides inutiles.
- Positionner les interventions par technicien + jour + horaire de façon lisible.
- Ajouter une légende des types / statuts.
- Vérifier la replanification depuis le planning.
- Ajouter le système de plaques : créer une plaque, lier plusieurs interventions, planifier la plaque, visualiser la plaque dans le planning.
- Vérifier ensuite le drag/drop uniquement si le backend et les règles actuelles le permettent sans risque.

## 5. Agents terrain

Statut : 🟠

À corriger / améliorer :
- La page web est trop basique pour l’instant.
- Afficher équipe / secteur / charge uniquement si données réelles disponibles ; éviter quatre cartes « Non renseigné » sans action utile.
- Donner un accès clair au détail d’un agent terrain et à son équipe.
- Conserver le rôle Agent terrain comme rôle métier distinct.
- La validation fonctionnelle complète Agent terrain mobile reste à faire après le web.

## 6. Techniciens

Statut : 🟠

À corriger / améliorer :
- Harmoniser le titre visible : sidebar « Techniciens » vs header « Personnel ».
- Améliorer la lisibilité des textes très pâles / petits.
- Vérifier les données de charge / intervention affichées (`INTERV. A:T` et valeurs type `1:14`, `8:73`) : si ce sont des durées, les formater correctement ; sinon renommer.
- Vérifier les statuts Déconnecté / Disponible / Pause / Hors service.
- Vérifier le panneau détail et les onglets Compétences / Équipement / Planning / Historique.
- Vérifier la relation Orienteur ↔ Technicien avec les vraies données.

## 7. Stock

Statut : 🔴 pour le périmètre livrable demandé

Problème actuel :
- La page affiche encore des données synthétiques / hors périmètre : câble drop INWI/ORANGE, ONT, modèles QA, etc.

À faire :
- Pour la livraison pilote, n’afficher que les équipements/câbles connus et demandés actuellement : `FO16`, `FO64`, `FO96`.
- Supprimer du jeu visible de recette les articles synthétiques INWI/ORANGE/ONT qui n’ont pas été validés par le client.
- Présenter un stock simple : référence, libellé, quantité, disponible, réservé, seuil, localisation/détenteur.
- Conserver la dotation technicien et la traçabilité si elles sont réelles.
- Admin : ajout / modification / désactivation/suppression contrôlée d’un article.
- Admin : types de pose modifiables :
  - Pose câble FO en conduite / sous PEHD
  - Pose câble FO en façade ou immeuble
  - Pose câble FO en aérien
- Ne pas inventer d’équipement non confirmé.

## 8. Rapports — RAPPORT JOURNALIER Magillan

Statut : 🔴

Le rapport générique actuel « Interventions & stocks FTTH » n’est pas le livrable attendu.

Référence de recette : le fichier `RAPPORT JOURNALIER(1).xlsx` fourni par le client et le logo Magillan fourni.

À faire :
- Générer un vrai profil / modèle `RAPPORT JOURNALIER Magillan`.
- Intégrer le logo Magillan dans le rapport.
- Respecter la structure du modèle fourni, notamment les blocs/champs convenus :
  - N° demande / N° rapport
  - Central
  - Client
  - Adresse
  - GPS
  - Splitter
  - PCO
  - Localité
  - Pose câble
  - Raccordement
  - Observation
  - Signatures
- Ne pas remplacer le modèle Magillan par le PDF générique BlueVector.
- Prévoir export PDF et/ou Excel en restant fidèle au modèle source.
- Vérifier les valeurs manquantes : laisser vide proprement plutôt que générer de fausses données.

## 9. Paramètres administrateur

Statut : 🔴 / partiel backend

À rendre simple et visible pour l’admin :
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

Règle : ajout / modification / désactivation ou suppression avec une UX simple, sans exposer de réglages techniques inutiles.

## 10. Champs personnalisés / formulaires dynamiques

Statut : 🟠 moteur présent / 🔴 administration complète

À faire :
- Conserver les formulaires conditionnels par activité déjà présents.
- Admin : créer un champ, choisir le type, libellé, obligatoire/non obligatoire, activité/formulaire de rattachement, ordre, actif/inactif.
- Vérifier les listes de références associées.
- `Étiquetage PCO` doit être un champ texte, pas une photo.

## 11. Scénarios de notification

Statut : 🔴 visible / backend à confirmer selon capacités existantes

À faire dans l’esprit de la capture Praxedo fournie :
- Créer / modifier / supprimer un scénario.
- Nom, agence, déclencheur.
- Drapeaux / conditions.
- Type e-mail.
- De / À / Cc / Cci.
- Objet.
- Compte rendu joint oui/non.
- Nom de fichier / format.
- Message.
- Association aux types d’interventions.
- Garder le système simple pour l’admin.

## 12. Plaques

Statut : 🔴

À faire :
- Créer une plaque.
- Modifier / supprimer une plaque.
- Lier plusieurs interventions à une plaque.
- Retirer une intervention d’une plaque.
- Planifier une plaque.
- Afficher clairement une plaque et ses interventions dans le planning.

## 13. Design system / cohérence globale

Statut : 🟠

À faire :
- Unifier dashboard / interventions / planning / techniciens / stock / rapports dans le même langage visuel clair.
- Corriger les zones sombres isolées qui donnent l’impression de plusieurs applications différentes.
- Uniformiser tailles de titres, cartes, boutons, champs, espacements, badges et tableaux.
- Éviter textes coupés, débordements, concaténations et composants trop petits.
- Conserver une application dense mais lisible pour un usage bureau réel.

## 14. Mobile — après acceptation web

Statut : ⏸️ volontairement différé

Ne pas passer à la recette mobile tant que les P0 web ci-dessus ne sont pas acceptés.

Ensuite :
- Technicien : re-test complet du checkpoint A.
- Agent terrain : checkpoint B complet.
- Formulaires dynamiques.
- Photos caméra + GPS/heure/accuracy.
- Galerie sans faux GPS.
- Offline / outbox / sync.
- Étiquetage PCO texte.
- Test APK avec la vraie URL backend.

## 15. Gate finale avant livraison

Statut : 🧪

Après corrections visibles :
- `git diff --check`
- recherche mojibake / UTF-8
- frontend lint
- frontend tests
- frontend build
- backend tests
- PostgreSQL/migrations
- Docker `/health`
- PDF/rapport Magillan
- Flutter analyze
- tests Flutter
- APK release avec URL réelle
- test PC réel
- test téléphone réel
- test terrain réel

Aucun merge vers `main` avant validation finale explicite.