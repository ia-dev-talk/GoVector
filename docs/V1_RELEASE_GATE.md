# BlueVector V1 release gate

This document is the operational gate for promoting the current Public V2 work into the first publishable BlueVector V1.

## Baseline

- Source branch: `product/public-v2-20260812`
- V1 hardening branch: `release/v1-20260817`
- Baseline commit: `f093e57d3333796d8e08925aa9ee142feacfeaca`
- Target: a coherent field-operations V1 whose critical web, API, PostgreSQL/geolocation and technician-mobile paths are validated together.

## Current validation status — 2026-08-18

The V1 branch is still **not promotable** because the required manual critical journeys and deployment-safety checks below remain open.

Automated validation is currently green on release candidate `bad4258874f59f17b9f93fff23f196b25a01e01b` via GitHub Actions run `32102268272`:

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
- production web file/media URLs default to same-origin instead of inheriting a localhost fallback;
- production backup tooling covers PostgreSQL plus technician media with checksum-aware restore tooling; the real restore drill remains a manual deployment gate;
- export-template update/delete operations enforce owner isolation for non-admin users;
- depot-to-technician stock allocation preserves batch number and expiration traceability when one issue spans several lots;
- inactive sectors cannot be newly assigned to technicians and deactivation removes their relational technician assignments;
- Cockpit operational KPI/decision/capacity/sector-load calculations remain based on the full operational dataset instead of being distorted by the UI search query.

## Blocking gates

### 1. Automated quality

All four quality jobs must pass on the same commit:

- backend: Alembic heads + backend pytest suite;
- postgres-geolocation: clean PostgreSQL bootstrap, migrations and PostgreSQL contracts;
- frontend: install, lint, tests and production build;
- mobile: Flutter analyze, tests and pilot release APK build.

A component passing in isolation is not sufficient for release promotion. The current documented green candidate is `bad4258874f59f17b9f93fff23f196b25a01e01b` / run `32102268272`; any subsequent head supersedes that candidate and must earn its own green run.

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

### 4. KML/KMZ and geographic data journeys

Validate with real KML/KMZ fixtures, not hand-built UI state:

- safe preview rejects hostile archives/XML and reports per-feature errors;
- points, lines and polygons are mapped, previewed and published as a version;
- imported data never overwrites jobs, sites, territories or FTTH assets implicitly;
- styles, custom fields, visibility and permissions remain configurable;
- feature edits use optimistic revision checks and append-only audit history;
- a published dataset can be archived, restored and exported;
- the Web map loads by viewport on desktop/phone and the mobile client can read
  the published operational subset offline.

### 5. Documentation and training

Before promotion:

- administrator, dispatcher, technician and client guides match the candidate UI;
- installation, configuration, backup, restore, rollback and incident procedures
  have been executed by someone other than their author;
- the V1 presentation and training material distinguish shipped capability from roadmap;
- every artifact carries the V1 version/date and contains no real secret or client data.

### 6. Deployment safety

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

### 7. Web endpoint safety

Before promotion, direct web/file URLs must never silently fall back to `localhost` in a production browser. Relative same-origin `/api` routing is the preferred default for the bundled web application; any explicit external API/files origin must be deployment-configured.

## Promotion rule

Promote to V1 only when there is one auditable commit for which automated gates are green and the critical manual journeys above have been checked without a release-blocking defect. Cosmetic follow-ups may remain after V1; broken navigation, data-loss risks, sync corruption, authorization issues and non-functional operational pages may not.
