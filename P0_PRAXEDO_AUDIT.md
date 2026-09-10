# Audit P0 — parité Praxedo GoVector

- Sources consultées en lecture seule : création Praxedo connectée, capture PDF de 10 pages, rapport d’intervention PDF réel et modèle `RAPPORT JOURNALIER.xlsx`.
- Création Praxedo : Agence, Groupe d’interventions, Description, Drapeaux, À faire après, À faire avant, Donneur d’ordre, Client, Site, Équipement, Adresse, Code postal, Ville, Contact, Téléphone, Téléphone mobile, E-mail, Fax, Infos site.
- Champs obligatoires visibles : Agence, Client, Site, Équipement, Adresse et Ville.
- Qualification : un seul menu Type d’intervention, sans sélecteur à cartes ni étape Réseau FTTH.
- Types visibles : FTTH Réalisable, PB, PM, PTO, SORTIE DE PCO IAM.
- À masquer du pilote web : NRO, SRO, PBO/PTO génériques, nombre de fibres, boîte de raccordement, réserve de câble, puissance optique et longueur câble génériques.
- À supprimer du pilote web : compétence libre `fibre, routeur, PON`; utiliser seulement PB, PM, POSE DE CABLE SPCO, PTO, RACCORDEMENT REALISABLE, RACCORDEMENT SAV.
- Référentiel pose confirmé : conduite / sous PEHD, façade ou immeuble, aérien; aucune valeur Autre par défaut.
- Référentiel câble confirmé : FO 16, FO 64, FO 96; le catalogue BlueVector reste la source technique.
- SORTIE DE PCO : trois segments câble indépendants et conditionnels; la longueur est `abs(Départ - Arrivée)`, donc 1000 → 700 = 300 m.
- Photos terrain : conserver le pipeline média existant et ses latitude, longitude, précision et heure caméra; ne jamais inventer un GPS pour la galerie.
- Raccordement : conditions Pourquoi, nouveau splitter, nouveau joint et câbles supplémentaires; Étiquetage PCO est un texte, pas une photo.
- Rapport journalier attendu : N° demande/rapport, central, client, adresse, GPS, splitter, PCO, localité; pose câble TYPE/CODE/DÉPART/ARRIVÉE/CONDUITE/FAÇADE/AÉRIEN; raccordement PCO/JOINT/SPLITTER/TIROIR/PRISE/OBSERVATION et signataires.
- Écart export actuel : profils opérateur génériques et colonnes NRO/SRO/puissance optique ne constituent pas le rapport journalier réel; ajouter un profil ciblé sans retirer les capacités backend historiques.
- Limite vérifiée : BlueVector ne possède pas de colonnes dédiées pour tous les champs de création Praxedo; ne pas les simuler dans d’autres champs ni ajouter une migration au checkpoint P0.
