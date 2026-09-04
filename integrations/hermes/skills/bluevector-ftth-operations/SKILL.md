---
name: bluevector-ftth-operations
description: Preserve BlueVector FTTH contracts during product work.
version: 0.2.0
author: BlueVector project owner, Hermes Agent
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [BlueVector, FTTH, Operations, Contracts, Audit]
    related_skills: []
---

# BlueVector FTTH Operations

Change or review BlueVector as an operational FTTH system while preserving its
canonical domain contracts. This skill does not grant permission to publish,
reset data, migrate an active database, or perform opaque autonomous actions.

## When to Use

- Reviewing or changing BlueVector backend, web, mobile, workflows, permissions,
  stocks, sectors, reports, GIS, or operational histories.
- Designing the future Agent Orienteur or client automation engine.
- Checking whether a UI request conflicts with the backend domain model.

Do not use for generic FTTH research that does not concern BlueVector.

## Canonical Contracts

- Backend services and capability policy own business behavior; UI labels and
  compatibility fallbacks are not independent authorities.
- `WorkflowEngine` and workflow capabilities govern intervention transitions.
- `Job.sector_id` is the operational sector identity. Raw route/locality fields
  are compatibility or imported evidence, not a substitute authority.
- A `Job` is the order; a `JobVisit` is one field passage. Repeated visits must
  not overwrite the order's full operational history.
- Assignment and reassignment history is append-only and auditable.
- Stock consumption and movements link to the server-owned `JobVisit` from V040.
  Historical missing `visit_id` stays unknown; never infer or backfill a passage
  from the current assignment. Clients do not choose the authoritative visit.
- GIS imports are versioned source datasets. They must not silently overwrite
  operational sectors, jobs, assignments, or stock entities.
- Completion policy precedence is client organization, operator, job type,
  default. Each override replaces a complete rule, not selected fields.
- Orienteur assessment and candidate APIs are read-only simulations. `REVIEW`
  does not mean available or assignable; unknown calendars, local slot timezone,
  travel, client authorization and material requirements remain unresolved.

## Validation Routing

Resolve the checkout first, then read `integrations/hermes/QA_WORKFLOW.md` there
for reproducible suite selection and evidence. Test instructions do not grant
database access or authorize creating infrastructure. A PostgreSQL suite that
skips because its admin URL is absent is LIMITED, not a connected PASS.
Use the same commit and record any dirty diff for every claimed validation.

## Procedure

1. Resolve the actual checkout, branch, worktree status, service state, and local
   instructions before editing. Done when existing user changes are identified.
2. Read the repo's `AGENTS.md` plus the relevant files under `docs/bluevector/`.
   Done when the requested behavior is mapped to an authoritative contract.
3. Model the change across backend, web, mobile, permissions, audit history, and
   reporting. State which surfaces intentionally do not change.
4. Put new business rules in a backend service or policy layer. Keep UI code for
   presentation, validated input, and explicit commands.
5. For the Agent Orienteur, separate observed facts, scored proposals, authorized
   commands, execution outcomes, and audit evidence. Begin assisted and require
   human validation before bounded autonomy.
6. Validate the smallest relevant contract first, then broader regressions in
   proportion to risk. Use isolated Docker/PostgreSQL validation for migrations;
   do not claim active-data success from code inspection alone.
7. Report exact tests, remaining warnings, dirty files, and untested surfaces.
   Done when another operator can distinguish proven behavior from planned work.

## Product Decision Filters

- Prefer dense but legible operational views over decorative dashboards.
- Every exception should expose context, responsible actor, next action, and age.
- Cross-history must answer: who, what, where, when, why, previous state, and
  evidence for intervention, technician, sector, material, and client output.
- Automations require persisted definitions, scoped inputs, deterministic output,
  run history, retry policy, delivery evidence, and role-based authorization.
- Personalization may change presentation and saved views, never canonical facts
  or permission boundaries.

## Pitfalls

- Fixing one frontend screen with a fallback that contradicts the API contract.
- Treating assignment as proof that field work started.
- Debiting global stock without preserving technician custody and intervention.
- Letting imported GIS naming redefine live operational sectors.
- Calling an AI recommendation an executed decision without command audit data.
- Resetting a dirty worktree or active database to make validation convenient.

## Verification

- The authoritative backend rule and every affected surface agree.
- Permissions fail closed and reassignment/history remain auditable.
- Stock, technician, intervention, visit, and material links reconcile.
- Tests run in the correct environment and active data remains untouched unless
  the user explicitly authorized a guarded migration.
- Known limitations and the next safe validation step are stated.
