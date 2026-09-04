# BlueVector QA evidence for Hermes

These skills are versioned with BlueVector. Installed copies live under the
existing Hermes `skills/software-development` directory; updating those two
copies does not require changing Hermes core, credentials, profiles or cron.

## Session and scope

State whether an existing session is resumed or a new bounded mission is started.
Read `AGENTS.md`, inspect Git and identify active services first. The `bluevector-qa`
profile remains on-demand. Use interactive approval handling, never one-shot.
Do not start another agent unless the current user authorizes delegation.

## Deterministic validation

Use literal `rg -F` searches and directory arguments on Windows. After two errors
of the same kind, diagnose the environment instead of spending the mission on
retries. Reserve time for the requested test and evidence summary.

From the repository root, with the backend development dependencies installed:

```text
python -m pytest -q -rs backend/tests/test_kml_parser.py backend/tests/test_gis_http_contract.py
python -m pytest -q -rs backend/tests/test_orienteur_assessment.py backend/tests/test_orienteur_candidates.py
```

For connected evidence, an explicitly provisioned disposable PostgreSQL service
must supply `BLUEVECTOR_POSTGRES_CONTRACT_ADMIN_URL`. Never copy a production URL
or read application secrets to make a test pass. The connected tests create UUID
databases and remove them. Do not run them against the habitual service.

```text
python -m pytest -q -rs backend/tests
```

The CI PostgreSQL job discovers the entire suite so new connected contracts are
not missed by a static file list. Record skip reasons. A metadata bootstrap test
does not prove every historical migration works from an empty database.

From `frontend`, run `npm test`, `npm run lint`, `npm run build` when relevant.
The Orienteur/GIS Playwright harness needs a dedicated Vite server and
`BLUEVECTOR_E2E_BASE_URL` pointing to it. Its mocked APIs prove component behavior,
not deployment or database integration. Never run mutating E2E against the usual DB.

From `mobile_app`, run `flutter analyze` and `flutter test` when relevant. A fresh
APK manually installed on a physical phone remains a separate acceptance gate.

## Evidence record

Report SHA, dirty files, exact command, exit code, passed/failed/skipped counts,
environment and limits. PASS covers only the executed scope; FAIL includes a
reproduced failure; LIMITED includes missing dependencies, skipped connected
contracts, static-only review or missing physical validation. Keep logs outside
tracked source. Never include credentials, customer exports or real client data.

No email, recurring execution, production mutation, merge or deployment follows
automatically from a passing test.
