# Contrat OpenAPI BlueVector

La spécification autoritative est générée à l'exécution par FastAPI et servie
sur `GET /openapi.json`. Les anciens fichiers versionnés `openapi.json` et
`backend/openapi.json` sont des archives historiques non autoritatives : aucun
runtime, client ou générateur BlueVector ne doit les consommer.

Cette décision évite de présenter un snapshot manuel obsolète comme une vérité
métier. Une future mission pourra supprimer ces archives ou introduire une
génération déterministe en CI quand l'espace disque et la politique de
suppression le permettront.
