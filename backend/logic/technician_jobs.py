from dataclasses import dataclass
from datetime import date, datetime, time, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import (
    Job,
    JobFailure,
    JobPostponement,
    JobStatus,
    User,
)
from backend.logic import assignments as assignment_logic
from backend.logic import jobs as job_logic
from backend.logic.workflow.engine import WorkflowEngine


class TechnicianJobMutationError(Exception):
    def __init__(self, status: str, code: str, message: str):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


@dataclass(frozen=True)
class TechnicianStartResult:
    job: Job
    transitions: tuple[tuple[JobStatus, JobStatus], ...]


@dataclass(frozen=True)
class TechnicianTransitionResult:
    job: Job
    transitions: tuple[tuple[JobStatus, JobStatus], ...]


_TECHNICIAN_DIRECT_TARGETS = {
    JobStatus.EN_ROUTE,
    JobStatus.ON_SITE,
    JobStatus.IN_PROGRESS,
    JobStatus.WORK_IN_PROGRESS,
    JobStatus.INSTALLATION_DONE,
    JobStatus.CLIENT_VALIDATION,
}


_TERMINATION_FIELDS = {
    "wifi_box_serial": "wifi_box_serial",
    "comment": "coordinator_comments",
    "pto": "pto_raw",
    "ont_serial": "ont_serial",
    "router_serial": "router_serial",
    "mac_address": "mac_address",
    "nro": "nro_raw",
    "sro": "sro_raw",
    "pbo": "pbo_raw",
    "splitter": "splitter_raw",
    "splitter_port": "splitter_port_raw",
    "gps_latitude": "gps_latitude",
    "gps_longitude": "gps_longitude",
    "optical_power_dbm": "optical_power_dbm",
    "cable_length_m": "cable_length_m",
    "real_duration_minutes": "real_duration_minutes",
    "before_photo": "before_photo",
    "after_photo": "after_photo",
    "client_signature": "client_signature",
}


async def require_assigned_job(
    db: AsyncSession,
    *,
    job_id: int,
    current_user: User,
    lock: bool = False,
) -> Job:
    if lock:
        result = await db.execute(
            select(Job).where(Job.id == job_id).with_for_update()
        )
        job = result.scalar_one_or_none()
    else:
        job = await job_logic.get_job(db, job_id)
    if job is None:
        raise TechnicianJobMutationError(
            "rejected",
            "job_not_found",
            f"Intervention {job_id} introuvable",
        )

    assignment = await assignment_logic.get_assignment_for_technician_job(
        db,
        technician_id=current_user.technician_id,
        job_id=job_id,
    )
    if assignment is None:
        raise TechnicianJobMutationError(
            "rejected",
            "job_not_assigned",
            "Cette intervention n'est pas affectée au technicien authentifié",
        )

    return job


async def accept_and_start_technician_job(
    db: AsyncSession,
    *,
    job_id: int,
    payload: dict[str, Any],
    current_user: User,
) -> TechnicianStartResult:
    """Apply the technician accept-and-start command without committing."""

    job = await require_assigned_job(
        db,
        job_id=job_id,
        current_user=current_user,
        lock=True,
    )
    if job.status == JobStatus.EN_ROUTE:
        return TechnicianStartResult(job=job, transitions=())
    if job.status not in (JobStatus.ASSIGNED, JobStatus.ACCEPTED):
        raise TechnicianJobMutationError(
            "conflict",
            "invalid_job_status",
            (
                "Impossible de démarrer une intervention en statut "
                f"'{job.status.value}'"
            ),
        )

    engine = WorkflowEngine(db)
    transitions: list[tuple[JobStatus, JobStatus]] = []
    audit_metadata = {
        "extra": {
            "source": "technician_mobile",
            "command": "accept_and_start",
            "comment": payload.get("comment"),
        }
    }

    if job.status == JobStatus.ASSIGNED:
        await engine.transition_job(
            job,
            JobStatus.ACCEPTED,
            technician_id=current_user.technician_id,
            metadata=audit_metadata,
            broadcast=False,
        )
        transitions.append((JobStatus.ASSIGNED, JobStatus.ACCEPTED))

    old_status = job.status
    await engine.transition_job(
        job,
        JobStatus.EN_ROUTE,
        technician_id=current_user.technician_id,
        metadata={
            "latitude": payload.get("latitude"),
            "longitude": payload.get("longitude"),
            "accuracy": payload.get("accuracy"),
            **audit_metadata,
        },
        broadcast=False,
    )
    transitions.append((old_status, JobStatus.EN_ROUTE))
    return TechnicianStartResult(job=job, transitions=tuple(transitions))


async def transition_technician_job(
    db: AsyncSession,
    *,
    job_id: int,
    new_status: JobStatus,
    payload: dict[str, Any],
    current_user: User,
) -> TechnicianTransitionResult:
    """Apply one direct technician workflow transition without committing."""

    if new_status not in _TECHNICIAN_DIRECT_TARGETS:
        raise TechnicianJobMutationError(
            "rejected",
            "unsupported_technician_transition",
            (
                f"Le statut '{new_status.value}' doit utiliser sa commande "
                "technicien dédiée"
            ),
        )

    job = await require_assigned_job(
        db,
        job_id=job_id,
        current_user=current_user,
        lock=True,
    )
    if job.status == new_status:
        return TechnicianTransitionResult(job=job, transitions=())

    old_status = job.status
    try:
        await WorkflowEngine(db).transition_job(
            job,
            new_status,
            technician_id=current_user.technician_id,
            metadata={
                "latitude": payload.get("latitude"),
                "longitude": payload.get("longitude"),
                "accuracy": payload.get("accuracy"),
                "extra": {
                    "source": "technician_mobile",
                    "command": "status_transition",
                    "comment": payload.get("comment"),
                },
            },
            broadcast=False,
        )
    except ValueError as exc:
        raise TechnicianJobMutationError(
            "conflict",
            "invalid_job_status",
            str(exc),
        ) from exc

    return TechnicianTransitionResult(
        job=job,
        transitions=((old_status, new_status),),
    )


async def fail_technician_job(
    db: AsyncSession,
    *,
    job_id: int,
    payload: dict[str, Any],
    current_user: User,
) -> TechnicianTransitionResult:
    """Record a technician failure and transition through WorkflowEngine."""

    job = await require_assigned_job(
        db,
        job_id=job_id,
        current_user=current_user,
        lock=True,
    )
    if job.status == JobStatus.FAILED:
        return TechnicianTransitionResult(job=job, transitions=())

    old_status = job.status
    try:
        await WorkflowEngine(db).transition_job(
            job,
            JobStatus.FAILED,
            technician_id=current_user.technician_id,
            metadata={
                "latitude": payload.get("latitude"),
                "longitude": payload.get("longitude"),
                "accuracy": payload.get("accuracy"),
                "extra": {
                    "source": "technician_mobile",
                    "command": "failure",
                    "reason": payload["reason"],
                    "comment": payload.get("comment"),
                },
            },
            broadcast=False,
        )
    except ValueError as exc:
        raise TechnicianJobMutationError(
            "conflict",
            "invalid_job_status",
            str(exc),
        ) from exc

    job.failure_reason = payload["reason"]
    db.add(
        JobFailure(
            job_id=job.id,
            technician_id=current_user.technician_id,
            reason=payload["reason"],
            comment=payload.get("comment"),
            latitude=payload.get("latitude"),
            longitude=payload.get("longitude"),
            created_at=datetime.now(timezone.utc),
        )
    )
    await db.flush()
    return TechnicianTransitionResult(
        job=job,
        transitions=((old_status, JobStatus.FAILED),),
    )


def _requested_datetime(value: date | datetime | None) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)
    return datetime.combine(value, time.min, tzinfo=timezone.utc)


async def postpone_technician_job(
    db: AsyncSession,
    *,
    job_id: int,
    payload: dict[str, Any],
    current_user: User,
) -> TechnicianTransitionResult:
    """Record a postponement request and transition through WorkflowEngine."""

    job = await require_assigned_job(
        db,
        job_id=job_id,
        current_user=current_user,
        lock=True,
    )
    if job.status == JobStatus.POSTPONED:
        return TechnicianTransitionResult(job=job, transitions=())

    requested_date = _requested_datetime(payload.get("requested_date"))
    old_status = job.status
    try:
        await WorkflowEngine(db).transition_job(
            job,
            JobStatus.POSTPONED,
            technician_id=current_user.technician_id,
            metadata={
                "extra": {
                    "source": "technician_mobile",
                    "command": "postpone",
                    "reason": payload["reason"],
                    "comment": payload.get("comment"),
                    "requested_date": (
                        requested_date.isoformat() if requested_date else None
                    ),
                },
            },
            broadcast=False,
        )
    except ValueError as exc:
        raise TechnicianJobMutationError(
            "conflict",
            "invalid_job_status",
            str(exc),
        ) from exc

    db.add(
        JobPostponement(
            job_id=job.id,
            technician_id=current_user.technician_id,
            reason=payload["reason"],
            comment=payload.get("comment"),
            requested_date=requested_date,
            status="PENDING",
            created_at=datetime.now(timezone.utc),
        )
    )
    await db.flush()
    return TechnicianTransitionResult(
        job=job,
        transitions=((old_status, JobStatus.POSTPONED),),
    )


async def terminate_technician_job(
    db: AsyncSession,
    *,
    job_id: int,
    payload: dict[str, Any],
    current_user: User,
) -> Job:
    """Apply the technician termination mutation without committing.

    The HTTP route and the outbox consumer share this transaction-neutral
    function. The caller owns commit/rollback and any external notification.
    """

    job = await require_assigned_job(
        db,
        job_id=job_id,
        current_user=current_user,
        lock=True,
    )
    if job.status == JobStatus.EN_ATTENTE_VALIDATION:
        return job

    closeable_statuses = {
        JobStatus.IN_PROGRESS,
        JobStatus.WORK_IN_PROGRESS,
        JobStatus.INSTALLATION_DONE,
        JobStatus.CLIENT_VALIDATION,
    }
    if job.status not in closeable_statuses:
        raise TechnicianJobMutationError(
            "conflict",
            "invalid_job_status",
            (
                "Impossible de clôturer une intervention en statut "
                f"'{job.status.value}'"
            ),
        )

    for incoming_name, model_name in _TERMINATION_FIELDS.items():
        value = payload.get(incoming_name)
        if value is not None:
            setattr(job, model_name, value)

    engine = WorkflowEngine(db)
    completion_check = await engine.can_complete(job)
    if not completion_check["can_complete"]:
        raise TechnicianJobMutationError(
            "conflict",
            "completion_requirements_missing",
            "; ".join(completion_check["issues"]),
        )

    metadata = {
        "latitude": payload.get("gps_latitude"),
        "longitude": payload.get("gps_longitude"),
        "accuracy": payload.get("gps_accuracy"),
        "extra": {
            "source": "technician_mobile",
            "command": "terminate",
        },
    }
    try:
        # The mobile close command intentionally hides these technical workflow
        # states. Each legal transition is still applied and audited by the
        # WorkflowEngine, inside the caller-owned transaction.
        if job.status in (JobStatus.IN_PROGRESS, JobStatus.WORK_IN_PROGRESS):
            await engine.transition_job(
                job,
                JobStatus.INSTALLATION_DONE,
                technician_id=current_user.technician_id,
                metadata=metadata,
                broadcast=False,
            )
        if job.status == JobStatus.INSTALLATION_DONE:
            await engine.transition_job(
                job,
                JobStatus.CLIENT_VALIDATION,
                technician_id=current_user.technician_id,
                metadata=metadata,
                broadcast=False,
            )
        await engine.transition_job(
            job,
            JobStatus.EN_ATTENTE_VALIDATION,
            technician_id=current_user.technician_id,
            metadata=metadata,
            broadcast=False,
        )
    except ValueError as exc:
        raise TechnicianJobMutationError(
            "conflict",
            "invalid_job_status",
            str(exc),
        ) from exc

    await db.flush()
    return job
