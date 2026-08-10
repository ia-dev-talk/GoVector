"""Deprecated intervention endpoints kept for explicit legacy compatibility."""

from fastapi import APIRouter, Depends, File, Form, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.errors import BusinessAPIError
from backend.auth.dependencies import require_technician
from backend.database.connection import get_db
from backend.database.models import User
from backend.logic.technician_jobs import (
    TechnicianJobMutationError,
    require_assigned_job,
)


router = APIRouter()


@router.post(
    "/{job_id}/complete",
    deprecated=True,
    summary="Legacy multipart completion endpoint (retired)",
)
async def complete_intervention(
    job_id: int,
    comment: str | None = Form(None),
    latitude: float | None = Form(None),
    longitude: float | None = Form(None),
    before_photo: UploadFile | None = File(None),
    after_photo: UploadFile | None = File(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_technician),
):
    """Reject the retired V1 mutation after authenticating its job scope.

    Mobile V2 uses ``/tech/media`` and ``/tech/sync``. Keeping this route as a
    guarded 410 prevents an old client from silently writing unvalidated field
    data or client-supplied filenames.
    """
    del comment, latitude, longitude, before_photo, after_photo
    try:
        await require_assigned_job(
            db,
            job_id=job_id,
            current_user=current_user,
        )
    except TechnicianJobMutationError as exc:
        http_status = (
            status.HTTP_404_NOT_FOUND
            if exc.code == "job_not_found"
            else status.HTTP_403_FORBIDDEN
        )
        raise BusinessAPIError(http_status, exc.code, exc.message) from exc

    raise BusinessAPIError(
        status.HTTP_410_GONE,
        "legacy_endpoint_retired",
        (
            "Cette route V1 est retirée. Utilisez les contrats technicien "
            "de média et de synchronisation."
        ),
    )
