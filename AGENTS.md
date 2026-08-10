# Repository Guidelines

## Project Structure & Module Organization

BlueVector (formerly FieldOpt) is a multi-client field-service platform. The FastAPI/SQLAlchemy backend lives in `backend/`: routes are under `backend/api/`, domain rules under `backend/logic/`, persistence under `backend/database/`, and integrations under `backend/services/`. PostgreSQL revisions belong in `alembic/versions/`; never edit a shared migration.

Before changing workflow, geolocation, assignments, field evidence, roles, imports, or external integrations, read `docs/bluevector/README.md` and the referenced domain documents. They distinguish current V1 behavior from the target architecture; do not present a target (for example `JobVisit`, canonical `Site`, Praxedo, or QField adapters) as implemented.

The React/Vite client is in `frontend/src/`; the Flutter client is in `mobile_app/lib/`. Their screens/pages, services, and reusable components stay in the existing subdirectories. Tests live in `backend/tests/` and `mobile_app/test/`; shared static resources are in `assets/`.

## Change Discipline

Analyze existing code, dependencies, and data flow before editing. Work incrementally, preserve current behavior, and implement only what was requested. Reuse existing services and components; do not rewrite architecture without an explicit requirement. Business rules belong in the backend, never in React or Flutter.

For shared domain data, trace and verify the backend API/model, React consumer, and Flutter consumer. Keep contracts and enum values synchronized. After changes, list every modified file and explain its purpose. Never expose or commit secrets, passwords, tokens, `.env` files, uploads, or database dumps.

## Build, Test, and Development Commands

- `make up` builds and starts PostgreSQL plus the application at `http://localhost:8080`.
- `make demo` starts the stack with simulation enabled; `make down` preserves database data.
- `python -m uvicorn backend.api.main:app --reload` runs the API locally after installing `requirements.txt`; use `requirements-dev.txt` when running backend tests.
- `cd frontend && npm install && npm run dev` starts React; `npm run build` builds it.
- `cd mobile_app && flutter pub get && flutter run` launches Flutter on a selected device.

## Coding Style & Naming Conventions

Use four spaces and PEP 8 naming in Python: `snake_case` functions/modules and `PascalCase` classes. Keep routes thin. React components use `PascalCase`; hooks begin with `use`. Dart follows `dart format`: two-space indentation, `UpperCamelCase` types, and `lower_snake_case.dart` files.

## Testing Guidelines

Run relevant checks after every modification: `python -m pytest backend/tests`, `cd frontend && npm run lint && npm run build`, and `cd mobile_app && flutter analyze && flutter test`. Backend files use `test_*.py`; Flutter files use `*_test.dart`. Add focused regression tests for changed rules, APIs, migrations, and offline flows.

## Commit & Pull Request Guidelines

History favors short summaries, sometimes release-prefixed, for example `v0.0.8 README update`. Keep commits scoped and mention migrations. Pull requests must describe behavior and validation, link issues, flag schema/configuration changes, and include screenshots for UI changes.
