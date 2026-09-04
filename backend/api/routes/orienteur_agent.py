"""Native observation surface for the Agent Orienteur."""

from fastapi import APIRouter, Depends, Path
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.dependencies import require_orienteur
from backend.database.connection import get_db
from backend.database.models import User
from backend.services.orienteur_assessment import assess_job
from backend.services.orienteur_candidates import assess_candidates

router = APIRouter(prefix="/orienteur-agent", tags=["Agent Orienteur"])


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
