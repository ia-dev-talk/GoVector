"""Team-scoped review context for the Agent terrain delivery surface."""

from fastapi import Depends, HTTPException, Path, status
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.routes.job_context import (
    download_office_attachment,
    download_technician_media,
    get_field_record,
)
from backend.api.routes.job_stock_v2 import get_job_stock_context_v2
from backend.api.routes.orienteur_agent import router
from backend.auth.dependencies import require_field_agent
from backend.database.connection import get_db
from backend.database.models import User
from backend.logic.field_agent_access import (
    require_field_agent_team_job,
    subject_user_for_field_agent,
)
from backend.logic.technician_jobs import TechnicianJobMutationError


def _team_scope_error(exc: TechnicianJobMutationError) -> HTTPException:
    status_code = status.HTTP_403_FORBIDDEN
    if exc.code == "job_not_found":
        status_code = status.HTTP_404_NOT_FOUND
    elif exc.status == "conflict":
        status_code = status.HTTP_409_CONFLICT
    return HTTPException(status_code=status_code, detail=exc.message)


async def _agent_subject_for_job(
    *,
    db: AsyncSession,
    job_id: int,
    current_user: User,
):
    try:
        context = await require_field_agent_team_job(
            db,
            job_id=job_id,
            current_user=current_user,
        )
    except TechnicianJobMutationError as exc:
        raise _team_scope_error(exc) from exc

    subject = subject_user_for_field_agent(
        field_agent=current_user,
        assigned_technician_id=context.technician.id,
    )
    return context, subject


@router.get("/me/jobs/{job_id}/field-record")
async def get_field_agent_job_record(
    job_id: int = Path(..., gt=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_field_agent),
):
    """Return the mature field dossier after strict current-team authorization."""
    _, subject = await _agent_subject_for_job(
        db=db,
        job_id=job_id,
        current_user=current_user,
    )
    return await get_field_record(
        job_id=job_id,
        db=db,
        current_user=subject,
    )


@router.get("/me/jobs/{job_id}/stock-context")
async def get_field_agent_job_stock_context(
    job_id: int = Path(..., gt=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_field_agent),
):
    """Return assigned-technician custody/stock after strict team authorization."""
    _, subject = await _agent_subject_for_job(
        db=db,
        job_id=job_id,
        current_user=current_user,
    )
    return await get_job_stock_context_v2(
        job_id=job_id,
        db=db,
        current_user=subject,
    )


@router.get("/me/jobs/{job_id}/media/{media_id}/download")
async def download_field_agent_technician_media(
    media_id: str,
    job_id: int = Path(..., gt=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_field_agent),
):
    """Download field evidence only after the Agent's current-team scope is proven."""
    _, subject = await _agent_subject_for_job(
        db=db,
        job_id=job_id,
        current_user=current_user,
    )
    return await download_technician_media(
        job_id=job_id,
        media_id=media_id,
        db=db,
        current_user=subject,
    )


@router.get("/me/jobs/{job_id}/attachments/{attachment_id}/download")
async def download_field_agent_office_attachment(
    attachment_id: str,
    job_id: int = Path(..., gt=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_field_agent),
):
    """Download office context only after the Agent's current-team scope is proven."""
    _, subject = await _agent_subject_for_job(
        db=db,
        job_id=job_id,
        current_user=current_user,
    )
    return await download_office_attachment(
        job_id=job_id,
        attachment_id=attachment_id,
        db=db,
        current_user=subject,
    )
