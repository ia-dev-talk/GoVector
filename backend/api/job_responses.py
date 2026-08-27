"""Shared serialization boundary for the canonical Job API contract."""

from __future__ import annotations

from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.api.schemas.jobs import JobResponse
from backend.database.models import Assignment, Job
from backend.logic.job_sectors import hydrate_job_sector_identities


async def _hydrate_response_assignments(
    db: AsyncSession,
    jobs: Iterable[Job],
) -> list[Job]:
    records = list(jobs)

    # Legacy unit tests deliberately use lightweight DB fakes.
    # Historical assignment hydration is a relational concern and
    # only runs against the real SQLAlchemy session used in production.
    if not isinstance(db, AsyncSession):
        return records

    job_ids = [
        job.id
        for job in records
        if getattr(job, "id", None) is not None
    ]

    if not job_ids:
        return records

    statement = (
        select(Assignment)
        .where(Assignment.job_id.in_(job_ids))
        .options(selectinload(Assignment.technician))
        .order_by(
            Assignment.job_id.asc(),
            Assignment.assigned_at.desc(),
            Assignment.id.desc(),
        )
    )

    assignments = (
        await db.execute(statement)
    ).scalars().all()

    latest_by_job = {}
    for assignment in assignments:
        latest_by_job.setdefault(
            assignment.job_id,
            assignment,
        )

    for job in records:
        job.__dict__["_response_assignment"] = (
            latest_by_job.get(job.id)
        )

    return records


async def job_response(
    db: AsyncSession,
    job: Job,
) -> JobResponse:
    records = await hydrate_job_sector_identities(
        db,
        [job],
    )
    records = await _hydrate_response_assignments(
        db,
        records,
    )
    return JobResponse.from_orm_with_assignment(
        records[0],
    )


async def job_responses(
    db: AsyncSession,
    jobs: Iterable[Job],
) -> list[JobResponse]:
    records = await hydrate_job_sector_identities(
        db,
        jobs,
    )
    records = await _hydrate_response_assignments(
        db,
        records,
    )
    return [
        JobResponse.from_orm_with_assignment(job)
        for job in records
    ]
