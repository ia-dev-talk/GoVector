# BlueVector

BlueVector est une plateforme d’orchestration des opérations terrain FTTH. Elle réunit un cockpit web pour l’orientation et la supervision, une API métier FastAPI/PostgreSQL et une application mobile Flutter conçue pour les techniciens, y compris en mode hors ligne.

## Composants

- `backend/` — API, règles métier, sécurité, synchronisation et intégrations.
- `frontend/` — cockpit React pour les équipes d’exploitation.
- `mobile_app/` — application Android technicien.
- `alembic/` — migrations PostgreSQL autoritatives.
- `docs/bluevector/` — contrats métier, rôles, géolocalisation et scénarios d’acceptation.

## Démarrage local

```bash
docker compose up --build -d
```

L’API est disponible sur `http://localhost:8080` et sa documentation dynamique sur `http://localhost:8080/docs`.

## Qualité

```bash
python -m pytest backend/tests
cd frontend && npm ci && npm run lint && npm test -- --run && npm run build
cd mobile_app && flutter pub get && flutter analyze && flutter test
```

Les décisions de domaine et de protection des données se trouvent dans [`docs/bluevector`](docs/bluevector/README.md).

## Statut

Projet privé en développement actif. Les environnements de test ne doivent contenir aucun secret ni donnée client réelle.
