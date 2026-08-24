"""Shared serialization boundary for the canonical Job API contract."""

from __future__ import annotations

from collections.abc import Iterable

from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.schemas.jobs import JobResponse
from backend.database.models import Job
from backend.logic.job_sectors import hydrate_job_sector_identities


async def job_response(db: AsyncSession, job: Job) -> JobResponse:
    await hydrate_job_sector_identities(db, [job])
    return JobResponse.from_orm_with_assignment(job)


async def job_responses(db: AsyncSession, jobs: Iterable[Job]) -> list[JobResponse]:
    records = await hydrate_job_sector_identities(db, jobs)
    return [JobResponse.from_orm_with_assignment(job) for job in records]
