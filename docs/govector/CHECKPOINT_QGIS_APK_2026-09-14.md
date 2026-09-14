# GoVector — checkpoint QGIS et APK — 14 septembre 2026

## État sauvegardé

- Branche : `delivery/govector-final-20260914`.
- Base de recette locale recréée et migrée à `gu1q2r3s4t5u`.
- Base de recette : 6 comptes, 1 équipe, 2 techniciens, 1 client, 2 bobines, 0 intervention inventée avant import utilisateur.
- Serveur local : `http://localhost:8080`.
- API téléphone sur le Wi-Fi de recette : `http://192.168.1.225:8080/api/v1`.

## QGIS / QField intégré

L'écran Administration > Secteurs > Jeux de données SIG permet maintenant :

1. analyser et enregistrer un KML/KMZ ;
2. publier le jeu de données ;
3. exporter un GeoJSON protégé vers QGIS ;
4. sélectionner le GeoJSON modifié dans QGIS ;
5. prévisualiser les changements sans écriture ;
6. bloquer l'application si une révision est ancienne ou en conflit ;
7. appliquer en transaction les changements sans conflit.

Les propriétés `_bv_*` du fichier d'échange doivent être conservées dans QGIS.
Elles portent les identités, révisions et empreintes nécessaires à la prévention
des écrasements silencieux.

## Vérifications réalisées

- Backend GIS/QGIS ciblé : 39 tests réussis, 2 tests PostgreSQL isolés ignorés faute d'URL de base temporaire.
- Web : 286 tests réussis.
- Web : lint réussi.
- Web : build de production réussi.
- APK Android debug : build réussi.

## APK de recette

- Fichier : `GoVector-debug-192.168.1.225-20260914.apk`.
- Taille : `180885659` octets.
- SHA-256 : `DB5A6220AD6D3719E0BD0E3EFDFE49F11DE23C6A5002D14F987DBFB9B3F6D48B`.

Le build prouve la compilation, pas le fonctionnement terrain. La validation
reste à faire sur le téléphone physique : installation manuelle, autorisation
GPS, Wi-Fi connecté au même réseau, photo, formulaire, passage hors ligne et
resynchronisation.

## Reprise immédiate

Après installation de l'APK, se connecter avec `amine.benali` ou
`agent.casablanca`. Importer d'abord les interventions depuis le Web avec le
compte Orienteur, puis affecter une intervention au technicien avant de tester
la récupération mobile.
