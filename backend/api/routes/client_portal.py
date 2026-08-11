"""Read-only operational portal for BlueVector client organizations."""

from __future__ import annotations

from datetime import datetime, timezone
import math

from fastapi import APIRouter, Depends, Query
from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.api.schemas.jobs import JobResponse
from backend.api.schemas.settings import OperationalSettingsValues
from backend.auth.dependencies import require_client
from backend.database.connection import get_db
from backend.database.models import (
    ApplicationSetting,
    Assignment,
    ClientOrganization,
    Job,
    JobActivityLog,
    JobStatus,
    User,
)
from backend.logic.workflow.capabilities import STATUS_METADATA


router = APIRouter(tags=["Client Portal"])

_CLIENT_VISIBLE_ACTIVITY_ACTIONS = {status.value for status in JobStatus} | {
    "status_change",
    "job_started",
    "arrival_confirmed",
    "work_started",
    "job_completed",
    "job_failed",
    "job_postponed",
    "client_absent",
}


def _status_code(status: JobStatus | str) -> str:
    return status.value if hasattr(status, "value") else str(status)


def _valid_coordinates(latitude: object, longitude: object) -> bool:
    try:
        lat = float(latitude)
        lon = float(longitude)
    except (TypeError, ValueError):
        return False
    return math.isfinite(lat) and math.isfinite(lon) and -90 <= lat <= 90 and -180 <= lon <= 180


def _aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def _kpis_from_counts(counts: dict[str, int]) -> dict:
    result = {
        "total": sum(counts.values()),
        "open": 0,
        "field_active": 0,
        "awaiting_validation": 0,
        "completed": counts.get(JobStatus.COMPLETED.value, 0),
        "interrupted": 0,
        "by_status": counts,
    }
    for status, metadata in STATUS_METADATA.items():
        count = counts.get(status.value, 0)
        if metadata.order_open:
            result["open"] += count
        if metadata.field_active:
            result["field_active"] += count
        if metadata.category == "awaiting_validation":
            result["awaiting_validation"] += count
        if metadata.category == "interrupted":
            result["interrupted"] += count
    return result


async def _gps_stale_after_minutes(db: AsyncSession) -> int | None:
    document = await db.scalar(
        select(ApplicationSetting).where(ApplicationSetting.namespace == "operational")
    )
    values = OperationalSettingsValues.model_validate(document.values if document else {})
    return values.gps_stale_after_minutes


def _planned_marker(job: Job) -> dict | None:
    if not _valid_coordinates(job.latitude, job.longitude):
        return None
    return {
        "job_id": job.id,
        "job_reference": job.job_number or str(job.id),
        "customer_name": job.customer_name,
        "address": job.service_address,
        "city": job.service_city,
        "status": _status_code(job.status),
        "latitude": float(job.latitude),
        "longitude": float(job.longitude),
        "source": job.planned_location_source,
        "precision": job.planned_location_precision,
    }


def _live_operation(job: Job, *, now: datetime, stale_after_minutes: int | None) -> dict | None:
    metadata = STATUS_METADATA.get(job.status)
    assignment = job.assignment
    technician = assignment.technician if assignment is not None else None
    observed_at = _aware(technician.last_location_update) if technician is not None else None
    if (
        metadata is None
        or not metadata.field_active
        or stale_after_minutes is None
        or technician is None
        or technician.current_job_id != job.id
        or observed_at is None
        or not _valid_coordinates(technician.current_latitude, technician.current_longitude)
    ):
        return None
    age_seconds = max((now - observed_at).total_seconds(), 0)
    if age_seconds > stale_after_minutes * 60:
        return None
    return {
        "job_id": job.id,
        "job_reference": job.job_number or str(job.id),
        "technician": {"display_name": technician.name},
        "status": _status_code(job.status),
        "latitude": float(technician.current_latitude),
        "longitude": float(technician.current_longitude),
        "observed_at": observed_at,
        "age_seconds": round(age_seconds),
    }


@router.get("/overview")
async def client_overview(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    status: JobStatus | None = Query(None),
    search: str | None = Query(None, max_length=120),
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_client),
):
    organization_id = current_user.client_organization_id
    organization = await db.get(ClientOrganization, organization_id)
    organization_filter = (
        Job.client_organization_id == organization_id,
        Job.deleted_at.is_(None),
    )

    rows = (
        await db.execute(
            select(Job.status, func.count(Job.id))
            .where(*organization_filter)
            .group_by(Job.status)
        )
    ).all()
    counts = {_status_code(item_status): count for item_status, count in rows}

    filtered = list(organization_filter)
    if status is not None:
        filtered.append(Job.status == status)
    normalized_search = (search or "").strip()
    if normalized_search:
        term = f"%{normalized_search}%"
        filtered.append(
            or_(
                cast(Job.id, String).ilike(term),
                Job.job_number.ilike(term),
                Job.customer_name.ilike(term),
                Job.service_address.ilike(term),
                Job.service_city.ilike(term),
                Job.operator.ilike(term),
            )
        )
    if date_from is not None:
        filtered.append(Job.scheduled_date >= date_from)
    if date_to is not None:
        filtered.append(Job.scheduled_date <= date_to)

    filtered_total = await db.scalar(select(func.count(Job.id)).where(*filtered)) or 0
    options = (selectinload(Job.assignment).selectinload(Assignment.technician),)
    jobs = (
        await db.execute(
            select(Job)
            .where(*filtered)
            .options(*options)
            .order_by(Job.updated_at.desc(), Job.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).scalars().all()

    map_jobs = (
        await db.execute(
            select(Job)
            .where(*filtered)
            .options(*options)
            .order_by(Job.updated_at.desc(), Job.id.desc())
            .limit(500)
        )
    ).scalars().all()
    stale_after_minutes = await _gps_stale_after_minutes(db)
    now = datetime.now(timezone.utc)
    planned_markers = [marker for job in map_jobs if (marker := _planned_marker(job))]
    live_operations = [
        marker
        for job in map_jobs
        if (marker := _live_operation(job, now=now, stale_after_minutes=stale_after_minutes))
    ]

    recent_activity = (
        await db.execute(
            select(JobActivityLog, Job)
            .join(Job, Job.id == JobActivityLog.job_id)
            .where(
                *organization_filter,
                JobActivityLog.action.in_(_CLIENT_VISIBLE_ACTIVITY_ACTIONS),
            )
            .order_by(JobActivityLog.created_at.desc(), JobActivityLog.id.desc())
            .limit(20)
        )
    ).all()

    return {
        "generated_at": now,
        "organization": {
            "id": organization.id,
            "name": organization.name,
            "code": organization.code,
        },
        "kpis": _kpis_from_counts(counts),
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": filtered_total,
            "pages": max((filtered_total + page_size - 1) // page_size, 1),
        },
        "jobs": [JobResponse.from_orm_with_assignment(job) for job in jobs],
        "map": {
            "planned_jobs": planned_markers,
            "live_operations": live_operations,
            "live_tracking_configured": stale_after_minutes is not None,
            "stale_after_minutes": stale_after_minutes,
            "truncated": filtered_total > 500,
        },
        "recent_activity": [
            {
                "id": activity.id,
                "job_id": job.id,
                "job_reference": job.job_number or str(job.id),
                "action": activity.action,
                "old_status": activity.old_status,
                "new_status": activity.new_status,
                "occurred_at": activity.created_at,
            }
            for activity, job in recent_activity
        ],
        "read_only": True,
    }
