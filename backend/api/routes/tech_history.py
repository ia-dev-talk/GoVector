"""Secure read-only history endpoints for the technician mobile client."""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.schemas.tech_history import (
    TechnicianHistoryDetail,
    TechnicianHistoryPage,
    TechnicianSiteHistoryPage,
)
from backend.auth.dependencies import require_technician
from backend.database.connection import get_db
from backend.database.models import JobStatus, User
from backend.logic.technician_history import (
    get_site_history_detail,
    get_technician_history_detail,
    list_site_history,
    list_technician_history,
)
from backend.logic.technician_jobs import TechnicianJobMutationError


router = APIRouter(tags=["Technician History (Mobile)"])


def _history_http_exception(exc: TechnicianJobMutationError) -> HTTPException:
    if exc.code == "job_not_found":
        status_code = status.HTTP_404_NOT_FOUND
    elif exc.code in {
        "job_not_assigned",
        "history_not_accessible",
        "site_history_not_accessible",
        "technician_profile_missing",
    }:
        status_code = status.HTTP_403_FORBIDDEN
    else:
        status_code = status.HTTP_400_BAD_REQUEST
    return HTTPException(status_code=status_code, detail=exc.message)


@router.get("/history", response_model=TechnicianHistoryPage)
async def get_my_history(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    date_from: date | None = None,
    date_to: date | None = None,
    job_status: JobStatus | None = Query(None, alias="status"),
    search: str | None = Query(None, max_length=120),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_technician),
):
    """List only historical interventions assigned to the current technician."""
    try:
        return await list_technician_history(
            db,
            current_user=current_user,
            page=page,
            page_size=page_size,
            status=job_status,
            date_from=date_from,
            date_to=date_to,
            search=search,
        )
    except TechnicianJobMutationError as exc:
        raise _history_http_exception(exc) from exc


@router.get("/history/{job_id}", response_model=TechnicianHistoryDetail)
async def get_my_history_detail(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_technician),
):
    """Return one assigned historical intervention as a read-only record."""
    try:
        return await get_technician_history_detail(
            db,
            job_id=job_id,
            current_user=current_user,
        )
    except TechnicianJobMutationError as exc:
        raise _history_http_exception(exc) from exc


@router.get(
    "/jobs/{job_id}/site-history",
    response_model=TechnicianSiteHistoryPage,
)
async def get_job_site_history(
    job_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_technician),
):
    """Resolve a site's prior work from an authorized current job."""
    try:
        return await list_site_history(
            db,
            job_id=job_id,
            current_user=current_user,
            page=page,
            page_size=page_size,
        )
    except TechnicianJobMutationError as exc:
        raise _history_http_exception(exc) from exc


@router.get(
    "/jobs/{job_id}/site-history/{historical_job_id}",
    response_model=TechnicianHistoryDetail,
)
async def get_job_site_history_detail(
    job_id: int,
    historical_job_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_technician),
):
    """Open one prior site intervention after authorizing the current job."""
    try:
        return await get_site_history_detail(
            db,
            current_job_id=job_id,
            historical_job_id=historical_job_id,
            current_user=current_user,
        )
    except TechnicianJobMutationError as exc:
        raise _history_http_exception(exc) from exc
