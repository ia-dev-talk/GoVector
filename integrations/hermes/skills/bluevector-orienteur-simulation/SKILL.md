---
name: bluevector-orienteur-simulation
description: Simulate auditable BlueVector dispatch and supervision proposals without executing operational writes.
version: 0.2.0
author: BlueVector project owner, Hermes Agent
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [BlueVector, Agent-Orienteur, Dispatch, Human-Approval, Simulation]
    related_skills: [bluevector-ftth-operations]
---

# BlueVector Agent Orienteur Simulation

Analyze BlueVector operational facts and produce explainable proposals while
remaining strictly read-only. This skill does not authorize assignment,
reassignment, scheduling, messaging, reporting delivery, stock mutation, or any
other external or production write.

## Use This Skill For

- Prioritizing a bounded set of interventions from supplied or read-only data.
- Proposing technician assignment, reassignment, escalation, or information
  requests for human review.
- Explaining exceptions, rejected alternatives, missing facts, and confidence.
- Evaluating future Agent Orienteur rules before implementation or activation.

Do not use generic assumptions as BlueVector facts. If authoritative data or a
required policy is unavailable, return an explicit unresolved condition.

## Canonical Inputs

- `Job` is the stable order; `JobVisit` is one physical passage.
- `Assignment` history is append-only; the current assignment is not evidence
  that work started.
- `Job.sector_id` is the operational sector identity.
- Backend capabilities and `WorkflowEngine` determine permissible commands.
- Technician availability, skills, sector, current workload, travel evidence,
  custody stock, SLA, client constraints, and active exceptions are separate
  facts with provenance and observation time.
- Unknown, stale, contradictory, or unverified values remain visibly so.

## Current Read-Only API Contract

Resolve the BlueVector checkout and verify `backend/api/routes/orienteur_agent.py`
and its services before relying on this versioned description. With an already
authorized session, use `GET /api/v1/orienteur-agent/jobs/{job_id}/assessment`
and `/candidates`; never obtain broader credentials to bypass a refusal.

- Preserve `job_revision`, `generated_at`, mode, limitations and allowed commands.
  The assessment also reports the settings revision. These are observations,
  not a frozen approval or an execution lock.
- Candidates are `REVIEW` or `EXCLUDED`; `ready_for_assignment` is always false.
  IDs are sorted ascending without ranking. Report total count, returned count
  and truncation; never present the first candidate as best or the list as complete
  when `truncated=true` (the current response limit is 100).
- Team ownership is canonical; the legacy orienteur field applies only to
  technicians without a team. Do not reconstruct scope outside the API.
- A textual local appointment slot without a governed timezone is UNKNOWN.
  A conflict-free dated assignment check does not establish actual availability.
- No assignment command, approval record, expiration or execution is persisted
  by these endpoints. If capabilities exclude reassignment, candidates are
  `NOT_APPLICABLE`; do not synthesize substitutes.

## Simulation Contract

For each evaluated intervention, produce:

1. **Facts**: only supplied or retrieved authoritative fields, with timestamp
   and source when known.
2. **Blocking gaps**: missing or contradictory information that prevents a safe
   proposal.
3. **Priority proposal**: level and explicit contributing rules; never invent a
   score whose formula is unavailable.
4. **Candidate comparison**: profiles to review, hard exclusions, unknowns and
   alternatives when available; preserve the API's unranked ordering.
5. **Proposed command**: structured intent and preconditions, marked
   `SIMULATION_ONLY` and `REQUIRES_HUMAN_APPROVAL`.
6. **Confidence and risk**: evidence quality, staleness, operational impact,
   and the condition that would invalidate the proposal.
7. **Audit record draft**: stable correlation id, policy/version if known,
   proposal time, inputs used, and reasons. Do not claim execution or delivery.

## Decision Boundaries

- Hard constraints cannot be traded for convenience or confidence: permission,
  operator/client compatibility, required skill, unavailable technician,
  overlapping committed slot, invalid workflow transition, or missing custody
  for required serialized equipment.
- Estimated travel never becomes live GPS. Locality text never replaces the
  canonical sector. Assignment never proves arrival or work start.
- A model score can rank eligible candidates; it cannot make an ineligible
  candidate executable.
- Human approval is specific to the frozen proposal. Before any future
  execution, BlueVector must recalculate permissions, state, version, conflicts,
  and idempotency.
- Do not send email, notify a client, call an assignment endpoint, alter a file,
  or write to a database from this simulation skill.

## Stop Conditions

Stop and return an exception instead of a proposal when the intervention
identity is ambiguous, authoritative state cannot be established, no candidate
passes hard constraints, policy versions conflict, or requested work would
cross the read-only boundary.

## Completion Check

A simulation is complete only when a human can see what is known, what is
missing, which alternatives were excluded and why, whether any ranking has an
authorized rule and sufficient evidence, what would require later approval,
and why no operational write occurred now. Do not force a proposal when the
current API provides only observations and incomplete candidate checks.
