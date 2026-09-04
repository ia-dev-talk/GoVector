"""Lifecycle helpers for durable field visits and historical assignments."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import raiseload

from backend.database.models import Assignment, Job, JobStatus, JobVisit


PASSAGE_END_STATUSES = {
    JobStatus.EN_ATTENTE_VALIDATION,
    JobStatus.COMPLETED,
    JobStatus.CANCELLED,
    JobStatus.FAILED,
    JobStatus.CLIENT_ABSENT,
    JobStatus.POSTPONED,
    JobStatus.ON_HOLD,
    JobStatus.SUSPENDED,
}

VISIT_CREATING_STATUSES = {
    JobStatus.ASSIGNED,
    JobStatus.ACCEPTED,
    JobStatus.EN_ROUTE,
    JobStatus.ON_SITE,
    JobStatus.IN_PROGRESS,
    JobStatus.WORK_IN_PROGRESS,
    JobStatus.INSTALLATION_DONE,
    JobStatus.CLIENT_VALIDATION,
}

PASSAGE_RESET_OUTCOMES = {
    "reassignment": "reassigned",
    "batch_reassignment": "reassigned",
    "unassignment": "unassigned",
}


async def get_current_assignment(
    db: AsyncSession, job_id: int, *, for_update: bool = False,
    load_relationships: bool = True,
) -> Assignment | None:
    statement = select(Assignment).where(
        Assignment.job_id == job_id,
        Assignment.ended_at.is_(None),
    )
    if for_update:
        statement = statement.with_for_update()
    if not load_relationships:
        statement = statement.options(raiseload("*"))
    return (await db.execute(statement)).scalar_one_or_none()


async def get_current_visit(
    db: AsyncSession, job_id: int, *, for_update: bool = False,
    load_relationships: bool = True,
) -> JobVisit | None:
    statement = select(JobVisit).where(
        JobVisit.job_id == job_id,
        JobVisit.ended_at.is_(None),
    )
    if for_update:
        statement = statement.with_for_update()
    if not load_relationships:
        statement = statement.options(raiseload("*"))
    return (await db.execute(statement)).scalar_one_or_none()


async def get_latest_visit(db: AsyncSession, job_id: int) -> JobVisit | None:
    return (
        await db.execute(
            select(JobVisit)
            .where(JobVisit.job_id == job_id)
            .order_by(JobVisit.attempt_number.desc())
            .limit(1)
        )
    ).scalar_one_or_none()


async def resolve_visit_for_technician(
    db: AsyncSession, *, job_id: int, technician_id: int
) -> JobVisit | None:
    """Return the current or latest passage in which this technician participated."""
    if not isinstance(db, AsyncSession):
        return None
    current = await get_current_visit(db, job_id)
    if current is not None:
        assignment = await get_current_assignment(db, job_id)
        if current.primary_technician_id == technician_id or (
            assignment is not None and assignment.technician_id == technician_id
        ):
            return current
    return (
        await db.execute(
            select(JobVisit)
            .outerjoin(Assignment, Assignment.visit_id == JobVisit.id)
            .where(
                JobVisit.job_id == job_id,
                or_(
                    JobVisit.primary_technician_id == technician_id,
                    Assignment.technician_id == technician_id,
                ),
            )
            .order_by(JobVisit.attempt_number.desc())
            .limit(1)
        )
    ).scalar_one_or_none()


async def _ensure_visit(
    db: AsyncSession,
    *,
    job: Job,
    technician_id: int | None,
    occurred_at: datetime,
) -> JobVisit | None:
    current = await get_current_visit(db, job.id, for_update=True)
    if current is not None:
        if technician_id is not None and current.primary_technician_id is None:
            current.primary_technician_id = technician_id
        return current
    assignment = await get_current_assignment(db, job.id, for_update=True)
    effective_technician_id = technician_id or (
        assignment.technician_id if assignment is not None else None
    )
    if effective_technician_id is None:
        return None
    attempt_number = (
        await db.execute(
            select(func.coalesce(func.max(JobVisit.attempt_number), 0)).where(
                JobVisit.job_id == job.id
            )
        )
    ).scalar_one() + 1
    visit = JobVisit(
        job_id=job.id,
        attempt_number=attempt_number,
        primary_technician_id=effective_technician_id,
        status=job.status.value,
        scheduled_at=job.scheduled_date,
        assigned_at=(assignment.assigned_at if assignment is not None else occurred_at),
    )
    db.add(visit)
    await db.flush()
    if assignment is not None:
        assignment.visit_id = visit.id
    return visit


async def sync_job_visit_transition(
    db: AsyncSession,
    *,
    job: Job,
    old_status: JobStatus,
    new_status: JobStatus,
    technician_id: int | None,
    metadata: dict,
) -> JobVisit | None:
    """Project a canonical workflow transition into visit history."""
    # Lightweight unit fakes used by legacy contract tests do not implement a
    # relational identity map. Dedicated visit tests exercise this projection
    # against a real AsyncSession/PostgreSQL transaction.
    if not isinstance(db, AsyncSession):
        return None
    occurred_at = datetime.now(timezone.utc)
    visit = await get_current_visit(db, job.id, for_update=True)
    if visit is None and new_status in VISIT_CREATING_STATUSES:
        visit = await _ensure_visit(
            db,
            job=job,
            technician_id=technician_id,
            occurred_at=occurred_at,
        )
    if visit is None:
        return None

    reset_outcome = PASSAGE_RESET_OUTCOMES.get(
        (metadata.get("extra") or {}).get("source")
    )
    if new_status == JobStatus.PENDING and reset_outcome:
        # A dispatch change starts a new operational attempt. Keep the old
        # passage as immutable history instead of projecting the new assignee
        # onto a visit performed by the previous technician.
        visit.outcome = reset_outcome
        visit.ended_at = occurred_at
        visit.updated_at = occurred_at
        return visit

    visit.status = new_status.value
    if technician_id is not None and visit.primary_technician_id is None:
        visit.primary_technician_id = technician_id
    if new_status == JobStatus.ASSIGNED and visit.assigned_at is None:
        visit.assigned_at = occurred_at
    elif new_status == JobStatus.ACCEPTED and visit.accepted_at is None:
        visit.accepted_at = job.accepted_at or occurred_at
    elif new_status == JobStatus.EN_ROUTE and visit.started_at is None:
        visit.started_at = job.started_at or occurred_at
        visit.start_latitude = metadata.get("latitude")
        visit.start_longitude = metadata.get("longitude")
    elif new_status == JobStatus.ON_SITE and visit.arrived_at is None:
        visit.arrived_at = job.arrival_time or occurred_at
        visit.end_latitude = metadata.get("latitude")
        visit.end_longitude = metadata.get("longitude")
        assignment = await get_current_assignment(db, job.id, for_update=True)
        if assignment is not None and assignment.actual_arrival is None:
            assignment.actual_arrival = visit.arrived_at
    elif new_status in {JobStatus.IN_PROGRESS, JobStatus.WORK_IN_PROGRESS}:
        visit.work_started_at = visit.work_started_at or occurred_at

    if new_status in PASSAGE_END_STATUSES:
        visit.outcome = new_status.value
        visit.ended_at = occurred_at
        assignment = await get_current_assignment(db, job.id, for_update=True)
        if assignment is not None:
            assignment.ended_at = occurred_at
            assignment.end_reason = new_status.value
            if new_status == JobStatus.EN_ATTENTE_VALIDATION:
                assignment.actual_completion = occurred_at
    visit.updated_at = occurred_at
    return visit


async def close_current_assignment(
    db: AsyncSession,
    *,
    job_id: int,
    reason: str,
    ended_by_user_id: int | None = None,
) -> Assignment | None:
    assignment = await get_current_assignment(db, job_id, for_update=True)
    if assignment is None:
        return None
    assignment.ended_at = datetime.now(timezone.utc)
    assignment.end_reason = reason
    assignment.ended_by_user_id = ended_by_user_id
    return assignment


def reset_current_passage_projection(job: Job) -> None:
    """Clear only the mutable current-passage snapshot before a new attempt.

    The previous values have already been copied to ``JobVisit``. Durable
    actions, media, network observations and the prepared dossier stay intact.
    """
    job.accepted_at = None
    job.started_at = None
    job.started_by = None
    job.arrival_time = None
    job.completed_at = None
    job.start_latitude = None
    job.start_longitude = None
    job.end_latitude = None
    job.end_longitude = None
    job.real_duration_minutes = None
    job.failure_reason = None
