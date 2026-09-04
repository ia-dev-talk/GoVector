# Stabilisation et Hermes — 4 septembre 2026

## Résultat

Le parseur SIG refuse les DTD/entités sur tout le document, y compris UTF-16 et
prologues longs. Le contrôle se fait dans `defusedxml` 0.7.1, et conserve les
limites ZIP, de taille et de géométrie. Les erreurs restent des réponses 422 avant
persistance. Huit cas hostiles échouaient avant correction ; ils passent après.

La CI PostgreSQL découvre maintenant tous les tests backend. Elle renseigne aussi
la variable legacy de V024, qui laissait deux tests ignorés. Une fois activés,
ces tests exposaient une fixture historique allant trop loin : elle préparait
V024/V025 mais demandait `upgrade head`, puis V026 tentait de recréer une table
déjà fournie par les métadonnées actuelles. Le contrat cible maintenant explicitement
V025 et conserve les assertions de données, clés, index et valeurs par défaut.
Ses erreurs Alembic exposent enfin stderr pour faciliter le diagnostic.

Un test permanent exerce les migrations réelles V038 → V039 → V040 → V039 → V040
sur une base UUID, après reconstruction de V038 par downgrade. Il vérifie tables
SIG, colonnes nullable, index et clés étrangères `ON DELETE SET NULL`. Aucune
migration partagée n'a été modifiée.

## Preuves locales

| Contrôle | Résultat |
| --- | --- |
| Backend complet, deux variables PostgreSQL renseignées | 500 réussis, zéro ignoré, 33 avertissements |
| Bootstrap sur PostgreSQL vide puis deuxième démarrage | Réussis, head unique `dr8m9n0p1q2r` |
| Frontend unitaires | 262 réussis |
| Frontend lint et build | Réussis ; avertissements chunk AG Grid et vendor vide |
| Playwright SIG, analyse/candidats Orienteur, paramètres | 8 réussis ; API synthétiques du harnais Vite |
| Flutter tests | 63 réussis |
| Flutter analyze avec options CI non fatales | 0 erreur, 51 warnings et 162 infos ; dette existante |
| Hermes skills | Deux copies 0.2.0 identiques aux sources versionnées, local/trusted/enabled |

Les tests backend utilisent un conteneur de test avec les sources montées en
lecture seule et un PostgreSQL 15 jetable sur son propre réseau. Les logs de
session sont conservés hors du dépôt. Les avertissements backend concernent
Pydantic/passlib/httpx et la profondeur de chargement SQLAlchemy.

Ces preuves ne valent pas recette de la pile Web habituelle, validation APK sur
téléphone, livraison QField/Praxedo, ni validation CI GitHub du nouveau SHA.
Aucun email client, envoi Unifiber, déploiement BlueVector ou changement de données
habituelles n'a eu lieu. La base habituelle était déjà au head V040 lors de la
lecture initiale de `alembic_version`.

## GitHub et état initial

- Dépôt principal privé `BigDataai-Dev/bluevector`, release propre et synchronisée
  à `1c9cebd` au début de session. PR release #3 et audit #8 ouverts ; la branche
  d'audit ne contient qu'un document. Aucun run PR attaché au SHA initial retourné
  par le connecteur. Cela ne prouve pas un échec de code ni la cause de l'absence CI.
- Dépôt privé secondaire `ia-dev-talk/bluevector-v1` : release distante `0f74560`,
  plus ancienne. Pas de synchronisation forcée de ce miroir.
- Trois commits de `origin/main` du 31 août restent absents de la release :
  recherche, ontologie/lexique FTTH, normaliseur exact. Réconciliation ciblée à
  prévoir ; aucun merge général ni modification de cette frontière aujourd'hui.
- Dépôt Hermes local propre au commit `fcdae2cf0b`, différent du HEAD amont
  annoncé `13e72fb205b735df679e0fd5f5996a34ac4accc6`. Pas d'update de son installation.

## Hermes — session et intégration

Continuité de configuration dans la session actuelle ; aucune nouvelle exécution
LLM Hermes. Les deux skills existants sont désormais versionnés dans
`integrations/hermes/skills`, sauvegardés puis copiés dans l'installation existante.
Leur workflow QA documente environnements, commandes, exclusions et verdicts.
Les candidats restent non classés, `REVIEW` ne vaut pas disponibilité, les
propositions ne sont pas persistées et les autorisations ne sont pas élargies.
Research Watch `c8a63cb61327` reste désactivé. Son ancien `next_run_at` ne constitue
pas une prochaine exécution active. Aucun cron, profil, secret ou historique effacé.

## Fichiers du lot

| Fichier | Rôle |
| --- | --- |
| `requirements.txt` | Dépendance XML durcie épinglée |
| `backend/services/gis/kml_parser.py` | Rejet des déclarations par le parseur |
| `backend/tests/test_kml_parser.py` | 12 cas encodage/prologue et préservation Unicode |
| `backend/tests/test_gis_http_contract.py` | 2 cas 422 avant toute persistance |
| `.github/workflows/quality.yml` | Découverte backend connectée et variable legacy |
| `backend/tests/test_alembic_v024.py` | Contrat historique borné et erreurs explicites |
| `backend/tests/test_alembic_v039_v040.py` | Aller-retour GIS/stock reproductible |
| `integrations/hermes/skills/bluevector-ftth-operations/SKILL.md` | Contrats FTTH, stocks, clôture et QA |
| `integrations/hermes/skills/bluevector-orienteur-simulation/SKILL.md` | Contrats réels des diagnostics/candidats |
| `integrations/hermes/QA_WORKFLOW.md` | Workflow de validation à la demande |
| `docs/bluevector/CODEX_CHATGPT_WEB_REVIEW_2026-09-04.md` | Revue statique de la passerelle proposée |
| `docs/bluevector/STABILITY_CHECKPOINT_2026-09-04.md` | Ce bilan et les limites de reprise |

## Ordre de reprise

1. Contrôler la CI du SHA poussé ; conserver la PR en revue, pas de promotion V1.
2. Réconcilier séparément les trois commits main et leurs tests d'abstention.
3. Finir la QA Web connectée isolée : grille interventions, secteurs, stocks,
   comptes et rapports ; corriger uniquement les écarts observés.
4. Pour exports programmés/Unifiber : définir périmètre client, destinataires
   confirmés, fuseau, historique d'exécution, retry/idempotence et preuve d'envoi
   avant d'activer la livraison. Les exports manuels ne prouvent pas un scheduler.
5. Agent Orienteur : convention de fuseau puis propositions/approbations persistées
   avec expiration et revalidation serveur ; conserver la simulation entre-temps.
6. APK neuf sur téléphone ; projet QGIS/QField réellement testé et contrat Praxedo.
7. Home lab : inventorier matériel, stockage durable, sauvegarde/restauration et
   mesure des modèles locaux ; ne pas confondre passerelle ChatGPT et IA locale.

CHEHBI Aménagement est traité dans son dépôt séparé retrouvé sur GitHub ; aucun
contenu commercial n'est mélangé au produit BlueVector.
