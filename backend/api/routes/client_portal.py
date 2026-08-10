"""Read-only operational portal for BlueVector client organizations."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.api.schemas.jobs import JobResponse
from backend.auth.dependencies import require_client
from backend.database.connection import get_db
from backend.database.models import Assignment, ClientOrganization, Job, JobStatus, User


router = APIRouter(tags=["Client Portal"])


@router.get("/overview")
async def client_overview(
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_client),
):
    organization_id = current_user.client_organization_id
    organization = await db.get(ClientOrganization, organization_id)
    base_filter = Job.client_organization_id == organization_id

    rows = (
        await db.execute(
            select(Job.status, func.count(Job.id))
            .where(base_filter, Job.deleted_at.is_(None))
            .group_by(Job.status)
        )
    ).all()
    counts = {
        (status.value if hasattr(status, "value") else str(status)): count
        for status, count in rows
    }
    jobs = (
        await db.execute(
            select(Job)
            .where(base_filter, Job.deleted_at.is_(None))
            .options(selectinload(Job.assignment).selectinload(Assignment.technician))
            .order_by(Job.updated_at.desc(), Job.id.desc())
            .limit(limit)
        )
    ).scalars().all()
    closed = counts.get(JobStatus.COMPLETED.value, 0) + counts.get(
        JobStatus.CANCELLED.value, 0
    )
    total = sum(counts.values())
    return {
        "generated_at": datetime.now(timezone.utc),
        "organization": {
            "id": organization.id,
            "name": organization.name,
            "code": organization.code,
        },
        "kpis": {
            "total": total,
            "open": max(total - closed, 0),
            "completed": counts.get(JobStatus.COMPLETED.value, 0),
            "failed": counts.get(JobStatus.FAILED.value, 0),
            "by_status": counts,
        },
        "jobs": [JobResponse.from_orm_with_assignment(job) for job in jobs],
        "read_only": True,
    }
