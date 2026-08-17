# BlueVector V1 release gate

This document is the operational gate for promoting the current Public V2 work into the first publishable BlueVector V1.

## Baseline

- Source branch: `product/public-v2-20260812`
- V1 hardening branch: `release/v1-20260817`
- Baseline commit: `f093e57d3333796d8e08925aa9ee142feacfeaca`
- Target: a coherent field-operations V1 whose critical web, API, PostgreSQL/geolocation and technician-mobile paths are validated together.

## Current validation status — 2026-08-18

The V1 branch is still **not promotable** because the required manual critical journeys and deployment-safety checks below remain open.

Automated validation is currently green on release candidate `c8d7b5772f31d5e1ae9e8b4396d200f8bf709154` via GitHub Actions run `32075073053`:

- backend gate: **green** — Alembic heads + backend pytest suite passed;
- PostgreSQL/geolocation gate: **green** — clean PostgreSQL bootstrap, migrations and targeted PostgreSQL contracts passed;
- frontend gate: **green** — `npm ci`, lint, tests and production build passed;
- mobile gate: **green** — pinned Flutter 3.47.0, analyze, tests, pilot release APK build and artifact upload passed.

The earlier GitHub billing/spending-limit issue is no longer an active release blocker. Automated green status applies only to the exact candidate/run above; any later release-head commit must be revalidated before promotion.

Hardening already applied on this release branch includes:

- production backend configuration rejects development secrets, debug/reload, development DB credentials and unsafe CORS; production CORS must be explicit HTTPS and non-local;
- Android release builds require an explicit HTTPS `API_BASE_URL` and reject local addresses;
- malformed JWT payloads fail closed on both HTTP and WebSocket authentication paths;
- web login refuses CLIENT accounts whose organization is missing or inactive before issuing a token;
- backend and mobile runtime version metadata is aligned on BlueVector `1.0.1` (`1.0.1+2` for the Android package);
- Flutter CI is pinned to `3.47.0` so release-gate reruns do not silently move to another stable toolchain;
- production web file/media URLs default to same-origin instead of inheriting a localhost fallback.

## Blocking gates

### 1. Automated quality

All four quality jobs must pass on the same commit:

- backend: Alembic heads + backend pytest suite;
- postgres-geolocation: clean PostgreSQL bootstrap, migrations and PostgreSQL contracts;
- frontend: install, lint, tests and production build;
- mobile: Flutter analyze, tests and pilot release APK build.

A component passing in isolation is not sufficient for release promotion. The current documented green candidate is `c8d7b5772f31d5e1ae9e8b4396d200f8bf709154` / run `32075073053`; any subsequent head supersedes that candidate and must earn its own green run.

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

The current pilot persists technician media in a Docker volume and the repository backup procedure archives both PostgreSQL and technician media with checksums. A public-production object-storage/durability decision remains a deployment gate rather than a code-complete claim.

### 5. Web endpoint safety

Before promotion, direct web/file URLs must never silently fall back to `localhost` in a production browser. Relative same-origin `/api` routing is the preferred default for the bundled web application; any explicit external API/files origin must be deployment-configured.

## Promotion rule

Promote to V1 only when there is one auditable commit for which automated gates are green and the critical manual journeys above have been checked without a release-blocking defect. Cosmetic follow-ups may remain after V1; broken navigation, data-loss risks, sync corruption, authorization issues and non-functional operational pages may not.
