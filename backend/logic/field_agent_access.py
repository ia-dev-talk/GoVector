"""Team-scoped access for the delivery-week field-agent workflow.

The historical ``CHEF_ORIENTEUR`` application role now represents an Agent
terrain.  The database team identity remains the existing ``orienteur_id`` /
``field_teams`` structure so the release does not need a destructive data
migration.

A field agent never becomes the assigned technician.  Instead, every team job
is resolved server-side to its current assignment.  Callers may then reuse the
mature technician field pipeline with a subject identity that keeps the real
agent ``user_id`` while using the actually assigned ``technician_id``.
"""

from __future__ import annotations

from dataclasses import dataclass
from types import SimpleNamespace
from typing import Any

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import (
    Assignment,
    FieldTeam,
    Job,
    Technician,
    User,
    UserRole,
)
from backend.logic.technician_jobs import TechnicianJobMutationError


@dataclass(frozen=True)
class FieldAgentJobContext:
    job: Job
    assignment: Assignment
    technician: Technician


def _require_field_agent_identity(current_user: User) -> int:
    if current_user.role != UserRole.CHEF_ORIENTEUR:
        raise TechnicianJobMutationError(
            "rejected",
            "field_agent_required",
            "Accès Agent terrain requis",
        )
    orienteur_id = current_user.orienteur_id
    if not orienteur_id:
        raise TechnicianJobMutationError(
            "rejected",
            "field_agent_team_missing",
            "Agent terrain non lié à une équipe",
        )
    return int(orienteur_id)


def _team_membership_clause(orienteur_id: int):
    # Canonical team membership wins whenever technician.team_id exists.
    # Only legacy technicians without a team_id may fall back to their old
    # technicians.orienteur_id projection.  This prevents a stale legacy link
    # from leaking an intervention across current field-team boundaries.
    return or_(
        FieldTeam.orienteur_id == orienteur_id,
        and_(
            Technician.team_id.is_(None),
            Technician.orienteur_id == orienteur_id,
        ),
    )


async def require_field_agent_team_job(
    db: AsyncSession,
    *,
    job_id: int,
    current_user: User,
    lock: bool = False,
) -> FieldAgentJobContext:
    """Return the current team assignment or fail closed.

    Access is based on the current assignment, never on a client-supplied
    technician id.  A reassignment to another team therefore revokes access on
    the next request automatically.
    """

    orienteur_id = _require_field_agent_identity(current_user)
    statement = (
        select(Job, Assignment, Technician)
        .join(Assignment, Assignment.job_id == Job.id)
        .join(Technician, Technician.id == Assignment.technician_id)
        .outerjoin(FieldTeam, FieldTeam.id == Technician.team_id)
        .where(
            Job.id == job_id,
            Assignment.ended_at.is_(None),
            _team_membership_clause(orienteur_id),
        )
    )
    if lock:
        statement = statement.with_for_update(of=Job)
    row = (await db.execute(statement)).first()
    if row is None:
        job_exists = await db.scalar(select(Job.id).where(Job.id == job_id))
        if job_exists is None:
            raise TechnicianJobMutationError(
                "rejected",
                "job_not_found",
                f"Intervention {job_id} introuvable",
            )
        raise TechnicianJobMutationError(
            "rejected",
            "field_agent_team_forbidden",
            "Cette intervention n'appartient pas à l'équipe de cet Agent terrain",
        )
    job, assignment, technician = row
    return FieldAgentJobContext(
        job=job,
        assignment=assignment,
        technician=technician,
    )


async def list_field_agent_team_jobs(
    db: AsyncSession,
    *,
    current_user: User,
) -> list[FieldAgentJobContext]:
    orienteur_id = _require_field_agent_identity(current_user)
    rows = (
        await db.execute(
            select(Job, Assignment, Technician)
            .join(Assignment, Assignment.job_id == Job.id)
            .join(Technician, Technician.id == Assignment.technician_id)
            .outerjoin(FieldTeam, FieldTeam.id == Technician.team_id)
            .where(
                Assignment.ended_at.is_(None),
                _team_membership_clause(orienteur_id),
            )
            .order_by(
                Job.scheduled_date.asc().nullslast(),
                Job.id.asc(),
            )
        )
    ).all()
    return [
        FieldAgentJobContext(job=job, assignment=assignment, technician=technician)
        for job, assignment, technician in rows
    ]


def subject_user_for_field_agent(
    *,
    field_agent: User,
    assigned_technician_id: int,
) -> Any:
    """Build the server-owned subject identity for existing field logic.

    ``id`` remains the actual Agent terrain user for audit/media ownership.
    ``technician_id`` is the technician currently assigned to the job.  The
    role is intentionally TECHNICIAN only inside the already-authorized field
    operation, so downstream code cannot inherit CHEF_ORIENTEUR office powers.
    """

    return SimpleNamespace(
        id=field_agent.id,
        username=getattr(field_agent, "username", None),
        email=getattr(field_agent, "email", None),
        role=UserRole.TECHNICIAN,
        is_active=True,
        technician_id=int(assigned_technician_id),
        orienteur_id=field_agent.orienteur_id,
        client_organization_id=None,
    )
