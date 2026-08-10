"""Business-data history queries for the technician mobile client."""

from __future__ import annotations

import math
from collections import defaultdict
from datetime import date, datetime, time, timezone

from sqlalchemy import and_, false, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.api.schemas.tech_history import (
    TechnicianHistoryActivity,
    TechnicianHistoryDetail,
    TechnicianHistoryItem,
    TechnicianHistoryPage,
    TechnicianSiteHistoryPage,
)
from backend.database.models import (
    Assignment,
    Job,
    JobActivityLog,
    JobFailure,
    JobPostponement,
    JobStatus,
    JobSiteObservation,
    StockConsumption,
    StockConsumptionItem,
    TechnicianFieldAction,
    TechnicianMedia,
    User,
)
from backend.logic.technician_jobs import (
    TechnicianJobMutationError,
    require_assigned_job,
)


HISTORICAL_STATUSES = (
    JobStatus.EN_ATTENTE_VALIDATION,
    JobStatus.COMPLETED,
    JobStatus.FAILED,
    JobStatus.POSTPONED,
    JobStatus.CLIENT_ABSENT,
    JobStatus.CANCELLED,
)


def _utc_start(value: date) -> datetime:
    return datetime.combine(value, time.min, tzinfo=timezone.utc)


def _utc_end(value: date) -> datetime:
    return datetime.combine(value, time.max, tzinfo=timezone.utc)


def _history_date(job: Job) -> datetime:
    return (
        job.completed_at
        or job.updated_at
        or job.scheduled_date
        or job.created_at
    )


def _result_label(job: Job) -> str | None:
    if job.status == JobStatus.FAILED:
        return job.failure_reason or "Échec terrain"
    if job.status == JobStatus.POSTPONED:
        return "Intervention reportée"
    if job.status == JobStatus.EN_ATTENTE_VALIDATION:
        return "Transmise, en attente de validation"
    if job.status == JobStatus.COMPLETED:
        return job.validation_status or "Validée"
    if job.status == JobStatus.CLIENT_ABSENT:
        return "Client absent"
    if job.status == JobStatus.CANCELLED:
        return "Annulée"
    return job.validation_status


def _activity(entry: JobActivityLog) -> TechnicianHistoryActivity:
    technician = getattr(entry, "technician", None)
    return TechnicianHistoryActivity(
        action=entry.action,
        description=entry.description,
        old_status=entry.old_status,
        new_status=entry.new_status,
        technician_id=entry.technician_id,
        technician_name=getattr(technician, "name", None),
        created_at=entry.created_at,
    )


def _item(
    job: Job,
    *,
    current_job_id: int | None = None,
    timeline: list[TechnicianHistoryActivity] | None = None,
) -> TechnicianHistoryItem:
    assignment = getattr(job, "assignment", None)
    technician = getattr(assignment, "technician", None)
    duration = job.real_duration_minutes
    if duration is None and assignment is not None:
        duration = assignment.actual_duration_minutes
    return TechnicianHistoryItem(
        job_id=job.id,
        job_number=job.job_number,
        date=_history_date(job),
        activity=job.job_type,
        client=job.customer_name,
        address=job.service_address,
        city=job.service_city,
        postal_code=job.service_zip,
        status=job.status,
        result=_result_label(job),
        operator=job.operator,
        nro=job.nro_raw,
        sro=job.sro_raw,
        pbo=job.pbo_raw,
        pto=job.pto_raw,
        started_at=job.started_at,
        arrival_time=job.arrival_time,
        duration_minutes=duration,
        completed_at=job.completed_at,
        failure_reason=job.failure_reason,
        report=job.coordinator_comments or job.notes,
        technician_id=getattr(assignment, "technician_id", None),
        technician_name=getattr(technician, "name", None),
        is_current=job.id == current_job_id,
        timeline=timeline or [],
    )


def _pages(total: int, page_size: int) -> int:
    return math.ceil(total / page_size) if total else 0


def _history_time_expression():
    return func.coalesce(
        Job.completed_at,
        Job.updated_at,
        Job.scheduled_date,
        Job.created_at,
    )


def _history_filters(
    *,
    status: JobStatus | None,
    date_from: date | None,
    date_to: date | None,
    search: str | None,
):
    filters = [Job.deleted_at.is_(None), Job.status.in_(HISTORICAL_STATUSES)]
    history_time = _history_time_expression()
    if status is not None:
        filters.append(Job.status == status)
    if date_from is not None:
        filters.append(history_time >= _utc_start(date_from))
    if date_to is not None:
        filters.append(history_time <= _utc_end(date_to))
    if search and search.strip():
        pattern = f"%{search.strip()}%"
        filters.append(
            or_(
                Job.customer_name.ilike(pattern),
                Job.service_address.ilike(pattern),
                Job.job_number.ilike(pattern),
                Job.pto_raw.ilike(pattern),
                Job.pbo_raw.ilike(pattern),
            )
        )
    return filters


def _technician_history_job_ids(technician_id: int):
    """Keep past work visible when current dispatch ownership later changes."""
    return select(Job.id).where(
        or_(
            Job.id.in_(
                select(Assignment.job_id).where(
                    Assignment.technician_id == technician_id
                )
            ),
            Job.id.in_(
                select(JobActivityLog.job_id).where(
                    JobActivityLog.technician_id == technician_id
                )
            ),
            Job.id.in_(
                select(TechnicianFieldAction.job_id).where(
                    TechnicianFieldAction.technician_id == technician_id
                )
            ),
        )
    )


async def list_technician_history(
    db: AsyncSession,
    *,
    current_user: User,
    page: int,
    page_size: int,
    status: JobStatus | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    search: str | None = None,
) -> TechnicianHistoryPage:
    technician_id = current_user.technician_id
    if not technician_id:
        raise TechnicianJobMutationError(
            "rejected", "technician_profile_missing", "Profil technicien manquant"
        )
    filters = _history_filters(
        status=status,
        date_from=date_from,
        date_to=date_to,
        search=search,
    )
    historical_job_ids = _technician_history_job_ids(technician_id)
    total = (
        await db.execute(
            select(func.count(Job.id))
            .select_from(Job)
            .where(Job.id.in_(historical_job_ids), *filters)
        )
    ).scalar_one()
    jobs = (
        await db.execute(
            select(Job)
            .options(
                selectinload(Job.assignment).selectinload(
                    Assignment.technician
                )
            )
            .where(Job.id.in_(historical_job_ids), *filters)
            .order_by(_history_time_expression().desc(), Job.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).scalars().unique().all()
    return TechnicianHistoryPage(
        items=[_item(job) for job in jobs],
        page=page,
        page_size=page_size,
        total=total,
        pages=_pages(total, page_size),
    )


async def get_technician_history_detail(
    db: AsyncSession,
    *,
    job_id: int,
    current_user: User,
) -> TechnicianHistoryDetail:
    technician_id = current_user.technician_id
    historical_job_ids = _technician_history_job_ids(technician_id)
    result = await db.execute(
        select(Job)
        .options(
            selectinload(Job.assignment).selectinload(Assignment.technician)
        )
        .where(
            Job.id == job_id,
            Job.deleted_at.is_(None),
            Job.status.in_(HISTORICAL_STATUSES),
            Job.id.in_(historical_job_ids),
        )
    )
    job = result.scalar_one_or_none()
    if job is None:
        raise TechnicianJobMutationError(
            "rejected",
            "history_not_accessible",
            "Intervention historique introuvable ou non autorisée",
        )

    return await _build_history_detail(db, job=job)


async def _build_history_detail(
    db: AsyncSession,
    *,
    job: Job,
) -> TechnicianHistoryDetail:

    logs = (
        await db.execute(
            select(JobActivityLog)
            .options(selectinload(JobActivityLog.technician))
            .where(JobActivityLog.job_id == job.id)
            .order_by(JobActivityLog.created_at.asc())
        )
    ).scalars().all()
    failures = (
        await db.execute(
            select(JobFailure)
            .where(JobFailure.job_id == job.id)
            .order_by(JobFailure.created_at.asc())
        )
    ).scalars().all()
    postponements = (
        await db.execute(
            select(JobPostponement)
            .where(JobPostponement.job_id == job.id)
            .order_by(JobPostponement.created_at.asc())
        )
    ).scalars().all()
    consumptions = (
        await db.execute(
            select(StockConsumption)
            .options(
                selectinload(StockConsumption.items).selectinload(
                    StockConsumptionItem.item
                )
            )
            .where(StockConsumption.job_id == job.id)
            .order_by(StockConsumption.created_at.asc())
        )
    ).scalars().unique().all()
    uploaded_media = (
        await db.execute(
            select(TechnicianMedia)
            .where(TechnicianMedia.job_id == job.id)
            .order_by(TechnicianMedia.created_at.asc())
        )
    ).scalars().all()
    field_actions = (
        await db.execute(
            select(TechnicianFieldAction)
            .where(TechnicianFieldAction.job_id == job.id)
            .order_by(TechnicianFieldAction.occurred_at.asc())
        )
    ).scalars().all()
    site_observations = (
        await db.execute(
            select(JobSiteObservation)
            .where(JobSiteObservation.job_id == job.id)
            .order_by(JobSiteObservation.occurred_at.asc())
        )
    ).scalars().all()

    activity_log = [_activity(entry) for entry in logs]
    materials = []
    for consumption in consumptions:
        for line in consumption.items:
            materials.append(
                {
                    "consumption_id": consumption.id,
                    "status": getattr(
                        consumption.status, "value", str(consumption.status)
                    ),
                    "reference": getattr(line.item, "reference", None),
                    "label": getattr(line.item, "label", None),
                    "quantity": line.quantity,
                    "serial_number": line.serial_number,
                    "mac_address": line.mac_address,
                }
            )
    media = []
    for media_type, field_name in (
        ("photo_before", "before_photo"),
        ("photo_after", "after_photo"),
        ("client_signature", "client_signature"),
    ):
        reference = getattr(job, field_name, None)
        if reference:
            media.append({"type": media_type, "reference": reference})
    media.extend(
        {
            "type": item.kind,
            "media_id": item.media_id,
            "mime_type": item.mime_type,
            "size_bytes": item.size_bytes,
            "sha256": item.sha256,
        }
        for item in uploaded_media
    )

    return TechnicianHistoryDetail(
        intervention=_item(job, timeline=activity_log),
        activity_log=activity_log,
        field_data={
            "gps_latitude": job.gps_latitude,
            "gps_longitude": job.gps_longitude,
            "optical_power_dbm": job.optical_power_dbm,
            "cable_length_m": job.cable_length_m,
            "ont_serial": job.ont_serial,
            "router_serial": job.router_serial,
            "mac_address": job.mac_address,
            "wifi_box_serial": job.wifi_box_serial,
            "nro": job.nro_raw,
            "sro": job.sro_raw,
            "pbo": job.pbo_raw,
            "pto": job.pto_raw,
            "notes": job.notes,
            "coordinator_comments": job.coordinator_comments,
            "actions": [
                {
                    "type": row.action_type,
                    "payload": row.payload,
                    "technician_id": row.technician_id,
                    "occurred_at": row.occurred_at,
                }
                for row in field_actions
            ],
            "site_observations": [
                {
                    "type": row.observation_type,
                    "latitude": row.latitude,
                    "longitude": row.longitude,
                    "accuracy_m": row.accuracy_m,
                    "note": row.note,
                    "technician_id": row.technician_id,
                    "source": row.source,
                    "occurred_at": row.occurred_at,
                }
                for row in site_observations
            ],
        },
        failures=[
            {
                "reason": row.reason,
                "comment": row.comment,
                "created_at": row.created_at,
            }
            for row in failures
        ],
        postponements=[
            {
                "reason": row.reason,
                "comment": row.comment,
                "requested_date": row.requested_date,
                "status": row.status,
                "created_at": row.created_at,
            }
            for row in postponements
        ],
        materials=materials,
        media_references=media,
    )


def site_match_clause(job: Job):
    """Return a conservative server-side site match and its audit metadata."""
    if job.pto_id:
        return Job.pto_id == job.pto_id, "pto_id", "high"
    pto_raw = (job.pto_raw or "").strip().lower()
    if pto_raw:
        criteria = [func.lower(func.trim(Job.pto_raw)) == pto_raw]
        if job.operator:
            criteria.append(func.lower(Job.operator) == job.operator.lower())
        return and_(*criteria), "pto_reference", "high"

    address = (job.service_address or "").strip().lower()
    zip_code = (job.service_zip or "").strip()
    city = (job.service_city or "").strip().lower()
    exact_address = func.lower(func.trim(Job.service_address)) == address
    exact_zip = Job.service_zip == zip_code
    exact_city = func.lower(func.trim(Job.service_city)) == city
    if job.pbo_id and address and zip_code:
        return (
            and_(Job.pbo_id == job.pbo_id, exact_address, exact_zip),
            "pbo_id+exact_address",
            "medium",
        )
    pbo_raw = (job.pbo_raw or "").strip().lower()
    if pbo_raw and address and zip_code:
        criteria = [
            func.lower(func.trim(Job.pbo_raw)) == pbo_raw,
            exact_address,
            exact_zip,
        ]
        if job.operator:
            criteria.append(func.lower(Job.operator) == job.operator.lower())
        return and_(*criteria), "pbo_reference+exact_address", "medium"

    if address and job.latitude and job.longitude:
        return (
            and_(
                exact_address,
                func.abs(Job.latitude - job.latitude) <= 0.00005,
                func.abs(Job.longitude - job.longitude) <= 0.00005,
            ),
            "exact_address+coordinates_5m",
            "medium",
        )
    if address and city and zip_code:
        return (
            and_(exact_address, exact_city, exact_zip),
            "exact_address+city+postal_code",
            "medium",
        )
    if address and city:
        return (
            and_(exact_address, exact_city),
            "exact_address+city",
            "medium",
        )
    phone = (job.customer_phone or "").strip()
    if address and zip_code and phone:
        return (
            and_(exact_address, exact_zip, Job.customer_phone == phone),
            "exact_address+postal_code+phone",
            "medium",
        )
    return false(), "none", "none"


async def list_site_history(
    db: AsyncSession,
    *,
    job_id: int,
    current_user: User,
    page: int,
    page_size: int,
) -> TechnicianSiteHistoryPage:
    current = await require_assigned_job(
        db, job_id=job_id, current_user=current_user
    )
    match_clause, match_basis, confidence = site_match_clause(current)
    filters = (
        Job.id != current.id,
        Job.deleted_at.is_(None),
        Job.status.in_(HISTORICAL_STATUSES),
        match_clause,
    )
    total = (
        await db.execute(select(func.count(Job.id)).where(*filters))
    ).scalar_one()
    jobs = (
        await db.execute(
            select(Job)
            .options(
                selectinload(Job.assignment).selectinload(
                    Assignment.technician
                )
            )
            .where(*filters)
            .order_by(_history_time_expression().desc(), Job.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).scalars().unique().all()

    timeline_by_job = defaultdict(list)
    if jobs:
        logs = (
            await db.execute(
                select(JobActivityLog)
                .options(selectinload(JobActivityLog.technician))
                .where(JobActivityLog.job_id.in_([job.id for job in jobs]))
                .order_by(JobActivityLog.created_at.asc())
            )
        ).scalars().all()
        for entry in logs:
            timeline_by_job[entry.job_id].append(_activity(entry))

    return TechnicianSiteHistoryPage(
        current_job_id=current.id,
        match_basis=match_basis,
        match_confidence=confidence,
        items=[
            _item(job, timeline=timeline_by_job[job.id]) for job in jobs
        ],
        page=page,
        page_size=page_size,
        total=total,
        pages=_pages(total, page_size),
    )


async def get_site_history_detail(
    db: AsyncSession,
    *,
    current_job_id: int,
    historical_job_id: int,
    current_user: User,
) -> TechnicianHistoryDetail:
    current = await require_assigned_job(
        db,
        job_id=current_job_id,
        current_user=current_user,
    )
    match_clause, _basis, _confidence = site_match_clause(current)
    result = await db.execute(
        select(Job)
        .options(
            selectinload(Job.assignment).selectinload(Assignment.technician)
        )
        .where(
            Job.id == historical_job_id,
            Job.id != current.id,
            Job.deleted_at.is_(None),
            Job.status.in_(HISTORICAL_STATUSES),
            match_clause,
        )
    )
    historical_job = result.scalar_one_or_none()
    if historical_job is None:
        raise TechnicianJobMutationError(
            "rejected",
            "site_history_not_accessible",
            "Intervention absente de l’historique autorisé de ce site",
        )
    return await _build_history_detail(db, job=historical_job)
