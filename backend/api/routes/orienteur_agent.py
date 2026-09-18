"""Office orientation helpers and team-scoped Agent terrain tablet surface."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from uuid import UUID

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Path,
    UploadFile,
    status,
)
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.job_responses import job_response
from backend.api.routes.tech_media import upload_technician_media
from backend.api.schemas.tech_media import TechnicianMediaResponse
from backend.api.schemas.tech_sync import (
    TechnicianSyncBatchRequest,
    TechnicianSyncBatchResponse,
    TechnicianSyncEventResult,
)
from backend.auth.dependencies import require_field_agent, require_orienteur
from backend.database.connection import get_db
from backend.database.models import JobStatus, User
from backend.logic.field_agent_access import (
    list_field_agent_team_jobs,
    list_field_agent_team_technicians,
    require_field_agent_team_job,
    subject_user_for_field_agent,
)
from backend.logic.gps_retention import configured_gps_stale_after_minutes
from backend.logic.field_agent_review import FieldAgentReviewWorkflowEngine
from backend.logic.activity_log import log_job_activity
from backend.logic.technician_jobs import TechnicianJobMutationError
from backend.logic.technician_sync import process_technician_sync_event
from backend.logic.validation_pipeline import (
    FIELD_AGENT_VERIFIED,
    RETURNED_FOR_CORRECTION,
    is_field_agent_verified,
)
from backend.services.orienteur_assessment import assess_job
from backend.services.orienteur_candidates import assess_candidates
from backend.services.realtime.dashboard_service import DashboardService


router = APIRouter(prefix="/orienteur-agent", tags=["Agent Orienteur"])
logger = logging.getLogger(__name__)

# Delivery scope: field agents supervise evidence/measurements/reports/closure.
# Material consumption and equipment binding remain the assigned technician's
# responsibility and are intentionally excluded here.
_FIELD_AGENT_ALLOWED_EVENT_TYPES = {
    "intervention_photo",
    "intervention_video",
    "intervention_document",
    "intervention_sketch",
    "intervention_comment",
    "custom_intervention_action",
    "client_signature",
    "field_measurement",
    "otdr_measurement",
    "incident_report",
    "installation_work",
    "network_reference",
    "gps_position",
    "site_location",
    "cable_entry",
    "cable_exit",
    "client_call",
    "job_communication",
    "complete_job",
}


class FieldAgentReturnRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=1000)


def _field_agent_error(exc: TechnicianJobMutationError) -> HTTPException:
    status_code = status.HTTP_403_FORBIDDEN
    if exc.code == "job_not_found":
        status_code = status.HTTP_404_NOT_FOUND
    elif exc.status == "conflict":
        status_code = status.HTTP_409_CONFLICT
    return HTTPException(status_code=status_code, detail=exc.message)


def _review_conflict(message: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=message)


# ---------------------------------------------------------------------------
# Office dispatch helpers (legacy URL, now office-only through require_orienteur)
# ---------------------------------------------------------------------------


@router.get("/jobs/{job_id}/assessment")
async def get_assessment(
    job_id: int = Path(..., gt=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_orienteur),
):
    return await assess_job(db, job_id=job_id, current_user=current_user)


@router.get("/jobs/{job_id}/candidates")
async def get_candidates(
    job_id: int = Path(..., gt=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_orienteur),
):
    return await assess_candidates(db, job_id=job_id, current_user=current_user)


# ---------------------------------------------------------------------------
# Agent terrain tablet surface
# ---------------------------------------------------------------------------


@router.get("/me/technicians/locations")
async def get_my_team_technician_locations(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_field_agent),
):
    technicians = await list_field_agent_team_technicians(
        db,
        current_user=current_user,
    )
    gps_stale_after_minutes = await configured_gps_stale_after_minutes(db)

    return {
        "gps_stale_after_minutes": gps_stale_after_minutes,
        "count": len(technicians),
        "technicians": [
            {
                "id": technician.id,
                "name": technician.name,
                "employee_id": technician.employee_id,
                "team_id": technician.team_id,
                "live_status": technician.live_status.value,
                "current_latitude": technician.current_latitude,
                "current_longitude": technician.current_longitude,
                "current_accuracy": technician.current_accuracy,
                "last_location_update": technician.last_location_update,
                "current_job_id": technician.current_job_id,
            }
            for technician in technicians
        ],
    }

@router.get("/me/jobs")
async def get_my_team_jobs(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_field_agent),
):
    contexts = await list_field_agent_team_jobs(db, current_user=current_user)
    jobs = []
    for context in contexts:
        response = await job_response(db, context.job)
        jobs.append(
            {
                "job": response,
                "assigned_technician": {
                    "id": context.technician.id,
                    "name": context.technician.name,
                    "employee_id": context.technician.employee_id,
                    "team_id": context.technician.team_id,
                },
            }
        )
    return {
        "agent_user_id": current_user.id,
        "team_orienteur_id": current_user.orienteur_id,
        "count": len(jobs),
        "jobs": jobs,
    }


@router.get("/me/jobs/{job_id}")
async def get_my_team_job(
    job_id: int = Path(..., gt=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_field_agent),
):
    try:
        context = await require_field_agent_team_job(
            db,
            job_id=job_id,
            current_user=current_user,
        )
    except TechnicianJobMutationError as exc:
        raise _field_agent_error(exc) from exc
    return {
        "job": await job_response(db, context.job),
        "assigned_technician": {
            "id": context.technician.id,
            "name": context.technician.name,
            "employee_id": context.technician.employee_id,
            "team_id": context.technician.team_id,
        },
        "agent_user_id": current_user.id,
        "team_orienteur_id": current_user.orienteur_id,
    }


@router.post("/me/jobs/{job_id}/return")
async def return_my_team_job_for_correction(
    payload: FieldAgentReturnRequest,
    job_id: int = Path(..., gt=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_field_agent),
):
    """Return a submitted team job to its assigned technician with a reason."""

    reason = payload.reason.strip()
    if not reason:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Le motif de retour est obligatoire",
        )

    try:
        context = await require_field_agent_team_job(
            db,
            job_id=job_id,
            current_user=current_user,
            lock=True,
        )
    except TechnicianJobMutationError as exc:
        raise _field_agent_error(exc) from exc

    if context.job.status != JobStatus.EN_ATTENTE_VALIDATION:
        raise _review_conflict(
            "Seule une intervention en attente de validation peut être retournée"
        )

    engine = FieldAgentReviewWorkflowEngine(db)
    try:
        await engine.transition_job(
            context.job,
            JobStatus.IN_PROGRESS,
            technician_id=context.technician.id,
            metadata={
                "extra": {
                    "source": "field_agent_return",
                    "reason": reason,
                    "field_agent_user_id": current_user.id,
                    "field_agent_orienteur_id": current_user.orienteur_id,
                }
            },
        )
        context.job.validation_status = RETURNED_FOR_CORRECTION
        await db.commit()
    except ValueError as exc:
        await db.rollback()
        raise _review_conflict(str(exc)) from exc

    return {
        "decision": "returned",
        "reason": reason,
        "job": await job_response(db, context.job),
        "assigned_technician": {
            "id": context.technician.id,
            "name": context.technician.name,
            "employee_id": context.technician.employee_id,
            "team_id": context.technician.team_id,
        },
    }


@router.post("/me/jobs/{job_id}/validate", include_in_schema=False)
@router.post("/me/jobs/{job_id}/submit")
async def submit_my_team_job_to_office(
    job_id: int = Path(..., gt=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_field_agent),
):
    """Record the Agent review and transmit the dossier to the office.

    The job deliberately remains ``EN_ATTENTE_VALIDATION``. Only an office
    Orienteur (or an administrator) can perform the final closure.
    """

    try:
        context = await require_field_agent_team_job(
            db,
            job_id=job_id,
            current_user=current_user,
            lock=True,
        )
    except TechnicianJobMutationError as exc:
        raise _field_agent_error(exc) from exc

    if context.job.status != JobStatus.EN_ATTENTE_VALIDATION:
        raise _review_conflict(
            "Seule une intervention en attente de validation peut être transmise au bureau"
        )

    already_submitted = is_field_agent_verified(context.job.validation_status)
    if not already_submitted:
        context.job.validation_status = FIELD_AGENT_VERIFIED
        context.job.updated_at = datetime.now(timezone.utc)
        await log_job_activity(
            db=db,
            job_id=context.job.id,
            action="field_agent_submitted",
            technician_id=context.technician.id,
            description="Dossier contrôlé par l'Agent terrain et transmis à l'Orienteur",
            old_status=context.job.status.value,
            new_status=context.job.status.value,
            metadata={
                "source": "field_agent_submission",
                "field_agent_user_id": current_user.id,
                "field_agent_orienteur_id": current_user.orienteur_id,
            },
        )
        await db.commit()

        try:
            service = DashboardService(db)
            await service.broadcast_job_event(
                "job_ready_for_office_validation",
                {
                    "job_id": context.job.id,
                    "technician_id": context.technician.id,
                    "field_agent_user_id": current_user.id,
                    "validation_status": FIELD_AGENT_VERIFIED,
                },
            )
            await service.broadcast_notification(
                {
                    "type": "job_ready_for_office_validation",
                    "job_id": context.job.id,
                    "message": "Un dossier contrôlé par l'Agent terrain attend la validation bureau.",
                }
            )
            await service.broadcast_dashboard_update()
        except Exception as exc:
            logger.warning("Field-agent submission broadcast failed: %s", exc)

    return {
        "decision": "submitted_to_office",
        "already_submitted": already_submitted,
        "job": await job_response(db, context.job),
        "assigned_technician": {
            "id": context.technician.id,
            "name": context.technician.name,
            "employee_id": context.technician.employee_id,
            "team_id": context.technician.team_id,
        },
    }


@router.post("/sync", response_model=TechnicianSyncBatchResponse)
async def sync_field_agent_events(
    batch: TechnicianSyncBatchRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_field_agent),
) -> TechnicianSyncBatchResponse:
    """Process offline field evidence on jobs belonging to the agent's team.

    The client never chooses the subject technician.  For each event BlueVector
    resolves the current assignment and injects that technician server-side.
    The durable action still keeps the real Agent terrain ``user_id``.
    """

    results: list[TechnicianSyncEventResult] = []
    acknowledged_by_job: dict[int, dict[str, object]] = {}

    for event in batch.events:
        if event.type not in _FIELD_AGENT_ALLOWED_EVENT_TYPES:
            results.append(
                TechnicianSyncEventResult(
                    event_id=event.event_id,
                    status="rejected",
                    code="field_agent_action_not_allowed",
                    error=(
                        "Cette action reste réservée au technicien affecté "
                        "ou à l'Orienteur bureau"
                    ),
                )
            )
            continue

        try:
            context = await require_field_agent_team_job(
                db,
                job_id=event.job_id,
                current_user=current_user,
            )
        except TechnicianJobMutationError as exc:
            results.append(
                TechnicianSyncEventResult(
                    event_id=event.event_id,
                    status=exc.status,
                    code=exc.code,
                    error=exc.message,
                )
            )
            continue

        subject_user = subject_user_for_field_agent(
            field_agent=current_user,
            assigned_technician_id=context.technician.id,
        )
        payload = dict(event.payload)
        payload["field_agent_actor"] = {
            "user_id": current_user.id,
            "orienteur_id": current_user.orienteur_id,
        }
        subject_event = event.model_copy(update={"payload": payload})
        result = await process_technician_sync_event(
            db,
            event=subject_event,
            current_user=subject_user,
        )
        results.append(result)
        if result.status == "acknowledged":
            record = acknowledged_by_job.setdefault(
                event.job_id,
                {
                    "technician_id": context.technician.id,
                    "types": set(),
                },
            )
            record["types"].add(event.type)

    await db.commit()

    if acknowledged_by_job:
        service = DashboardService()
        try:
            for job_id, record in acknowledged_by_job.items():
                await service.broadcast_job_event(
                    "job:updated",
                    {
                        "job_id": job_id,
                        "technician_id": record["technician_id"],
                        "field_agent_user_id": current_user.id,
                        "source": "field_agent_sync",
                        "field_actions": sorted(record["types"]),
                    },
                )
            await service.broadcast_dashboard_update()
        except Exception as exc:
            logger.warning("Field-agent realtime broadcast failed: %s", exc)

    return TechnicianSyncBatchResponse(results=results)


@router.post("/media", response_model=TechnicianMediaResponse)
async def upload_field_agent_media(
    attachment_id: UUID = Form(...),
    job_id: int = Form(..., gt=0),
    kind: str = Form(...),
    sha256: str = Form(...),
    metadata: str = Form("{}"),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_field_agent),
) -> TechnicianMediaResponse:
    """Upload evidence for a team job while preserving the real agent user id."""

    # Validate metadata early so malformed requests fail before storage work.
    try:
        parsed = json.loads(metadata)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=422, detail="Metadata JSON invalide") from exc
    if not isinstance(parsed, dict):
        raise HTTPException(status_code=422, detail="Metadata doit être un objet JSON")

    try:
        context = await require_field_agent_team_job(
            db,
            job_id=job_id,
            current_user=current_user,
        )
    except TechnicianJobMutationError as exc:
        raise _field_agent_error(exc) from exc

    parsed["field_agent_actor"] = {
        "user_id": current_user.id,
        "orienteur_id": current_user.orienteur_id,
    }
    subject_user = subject_user_for_field_agent(
        field_agent=current_user,
        assigned_technician_id=context.technician.id,
    )
    return await upload_technician_media(
        attachment_id=attachment_id,
        job_id=job_id,
        kind=kind,
        sha256=sha256,
        metadata=json.dumps(parsed, ensure_ascii=False),
        file=file,
        db=db,
        current_user=subject_user,
    )
