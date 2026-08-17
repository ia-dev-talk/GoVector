# BlueVector V1 release gate

This document is the operational gate for promoting the current Public V2 work into the first publishable BlueVector V1.

## Baseline

- Source branch: `product/public-v2-20260812`
- V1 hardening branch: `release/v1-20260817`
- Baseline commit: `f093e57d3333796d8e08925aa9ee142feacfeaca`
- Target: a coherent field-operations V1 whose critical web, API, PostgreSQL/geolocation and technician-mobile paths are validated together.

## Blocking gates

### 1. Automated quality

All four quality jobs must pass on the same commit:

- backend: Alembic heads + backend pytest suite;
- postgres-geolocation: clean PostgreSQL bootstrap, migrations and PostgreSQL contracts;
- frontend: install, lint, tests and production build;
- mobile: Flutter analyze, tests and pilot release APK build.

A component passing in isolation is not sufficient for release promotion.

### 2. Manual web journeys

Validate with real application data, not mocked screenshots:

- Personnel opens only the personnel workspace and never overlays organization settings;
- technician profile links correctly to interventions, stock and operational context;
- Interventions list, detail, assignment/re-assignment, planning and timeline remain navigable end-to-end;
- Cockpit widgets are configurable and every action routes to a useful operational surface;
- Supervision displays actionable queues (unassigned, overdue windows, urgent/VIP and GPS anomalies) and actions resolve to the relevant record;
- Stocks supports warehouse-to-technician allocation with traceable movements;
- Map/Live surfaces preserve technician/sector relations and intervention navigation;
- Settings is the only organization-management surface.

### 3. Technician mobile journeys

Validate on a physical Android device where possible:

- login/session restore;
- assigned intervention list;
- intervention detail and navigation;
- start/arrival/field action workflow;
- photo, measurement, comment, sketch/annotation and supported evidence capture;
- offline outbox persistence, reconnect and idempotent sync;
- completion workflow and history;
- no cross-user outbox leakage after logout/login.

### 4. Deployment safety

Before a public production deployment:

- `ENVIRONMENT=production`;
- non-default `SECRET_KEY` of at least 32 characters;
- `DEBUG=false` and `API_RELOAD=false`;
- production PostgreSQL credentials;
- explicit HTTPS frontend origins in `CORS_ORIGINS`;
- production API base URL for the mobile build;
- production Android signing configured outside the repository;
- persistent media/object-storage strategy defined and backup/restore exercised;
- secrets kept outside source control.

## Promotion rule

Promote to V1 only when there is one auditable commit for which automated gates are green and the critical manual journeys above have been checked without a release-blocking defect. Cosmetic follow-ups may remain after V1; broken navigation, data-loss risks, sync corruption, authorization issues and non-functional operational pages may not.
